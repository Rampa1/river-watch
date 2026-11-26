// River Watch: the brain. The page calls the Anthropic Messages API directly from the browser
// with the user's own key (settings box). Plain fetch, no third-party script: nothing else that runs on
// this page can read the key. Code computes, the brain explains: the model gets the computed plan, never
// raw history, and may only re-run our engine through the what_if tool.

import { MODEL, ANTHROPIC_VERSION, MAX_TOKENS, EFFORT, PRICE, DISCLAIMER } from "./config.js";

const KEY_STORE = "riverwatch.anthropicKey";
// Shown when the model declines a question (no retry on another model): treated as out of scope.
export const OUT_OF_SCOPE = "That question is outside what River Watch can answer. River Watch covers tonight's flood levels and crew places for the eight towns under The Flood Plan, and the flood-defence study ranking. Questions about coastal or tidal flooding, road closures, insurance or an individual home go to the council's area office.";
const USAGE_STORE = "riverwatch.usageLog";

export const keyStore = {
  get: () => localStorage.getItem(KEY_STORE) || "",
  save: (k) => localStorage.setItem(KEY_STORE, k.trim()),
  forget: () => localStorage.removeItem(KEY_STORE),
};

export const usageLog = {
  all: () => JSON.parse(localStorage.getItem(USAGE_STORE) || "[]"),
  add: (e) => { const a = usageLog.all(); a.push(e); localStorage.setItem(USAGE_STORE, JSON.stringify(a)); },
  clear: () => localStorage.removeItem(USAGE_STORE),
};

export function costOf(u) {
  return ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output
    + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite5m + (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;
}

export const SYSTEM_PROMPT = `You are River Watch, a decision-support assistant for a flood response team that serves eight Irish towns.
You RECOMMEND; the Duty Officer decides by 16:00 and records the decision and the reason. Never say a crew "is sent" - say "recommended".

THE FLOOD PLAN (fictional, version 2026/27) - the rules our code has already applied:
1. Who decides: the Duty Officer, by 16:00. River Watch recommends; it never sends a crew.
2. Numbers that count: each town's own river at that town. Forecast peak = highest daily flow forecast for today and the next two days. Thresholds = the town's own 95th and 99th percentiles of daily flow over at least ten full years.
3. Levels: Normal below P95. Standby at or above P95 (staff on call confirmed, pumps checked, sandbags staged). Barriers at or above P99 (barriers erected by a crew before 18:00).
4. Warnings: an orange or red RAIN warning covering the town's county, in force at any time in the next 48 hours, raises the town one level. Yellow is mentioned but changes nothing. A town spanning two counties counts both; the notes name the second county.
5. Rehearsal values: flow_override_m3s replaces the forecast peak; warning_override "orange"/"red" acts as a live warning. ALWAYS say when an answer uses a rehearsal value.
6. Crews: Clonmel crew (Clonmel, Fermoy, Enniscorthy), Mallow crew (Mallow, Fermoy, Bandon), Athlone crew (Athlone, Carrick-on-Shannon, Ennis); at most two towns each per night. If Barriers towns outnumber places, rank by % above P99, tie -> higher peak. A town without a crew gets every Standby measure and is flagged to the Area Manager.
7. Barrier sets: a town with no barrier set available cannot have barriers: every Standby measure + flag to the Area Manager. Read the notes column.
8. Area Manager's question: count each town's high-flow events (runs of consecutive days at or above the town's P99) in winters 1 Oct-31 Mar, 2016/17 to 2024/25; report the town with most events, whether its last four winters had more than its first four, and one thing the count cannot tell.
9. Not covered: coastal and tidal flooding, road closures, insurance, anything about an individual home. These go to the council's area office.

HOW TO ANSWER
- Use ONLY the numbers in the LIVE DATA block of the latest user message (or what_if results). Never invent, estimate or recall a flow, threshold, warning or date. If the data does not contain something, say so plainly.
- For every number you state, say where it came from and for which date or time (e.g. "Open-Meteo GloFAS forecast for 27 Nov, read 14:05").
- The levels, crew places and flags in LIVE DATA were computed by code from the Flood Plan. Explain them; do not overrule them. If you think the data looks wrong, say why and recommend the Duty Officer checks, but keep the computed result.
- "What if" questions (a different flow, a warning, a resource change): call the what_if tool with the change and explain its result. Make clear it is hypothetical.
- Rule 8 answers come from the stored study ranking (measured OPW gauge flow). Give its caveats.
- Thresholds use the GloFAS model series; OPW gauge readings are on a different scale. If someone quotes a gauge reading, say so.
- Out of scope (Rule 9) or not answerable from the data: say so in one or two sentences and refer to the council's area office where Rule 9 applies. Do not guess.
- Be brief and plain. For "tonight's plan": one line per town (level, action, main reason), then where each crew is recommended to go, then any flags and rehearsal values. End plan answers with: "${DISCLAIMER}"`;

const WHAT_IF_TOOL = {
  name: "what_if",
  description: "Re-run the River Watch Flood Plan engine on a hypothetical change, using today's live data for everything else. Use for any 'what if' question. Returns the recomputed plan (levels, crew places, flags) for all towns.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      changes: {
        type: "array",
        description: "One entry per town to change.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            town: { type: "string", enum: ["Clonmel", "Fermoy", "Mallow", "Bandon", "Enniscorthy", "Ennis", "Athlone", "Carrick-on-Shannon"] },
            flow_m3s: { type: ["number", "null"], description: "Hypothetical forecast peak in m³/s, or null for no change." },
            warning: { type: "string", enum: ["orange", "red", "unchanged"], description: "Hypothetical orange/red rain warning for the town, or 'unchanged' to keep today's live warnings." },
            barrier_sets: { type: ["integer", "null"], description: "Hypothetical barrier sets, or null for no change." },
          },
          required: ["town", "flow_m3s", "warning", "barrier_sets"],
        },
      },
    },
    required: ["changes"],
  },
};

/** Compact, model-facing view of the plan: every number with its source and date. */
export function planForModel(plan, extra = {}) {
  return {
    computed_at: plan.builtAt,
    rehearsal_values_in_use: plan.rehearsal,
    towns: plan.towns.map((t) => ({
      town: t.town, county: t.county, river: t.river,
      forecast_days: t.forecast.days?.map((d) => `${d.date}: ${d.value} m³/s`) ?? `unavailable (${t.forecast.error})`,
      forecast_peak_m3s: t.peak, peak_source: t.peakSource,
      p95_m3s: t.p95, p99_m3s: t.p99, pct_above_p99: t.pctAboveP99,
      flow_level: t.flowLevel, final_level: t.level, action: t.action, crew: t.crew ?? null,
      warnings: t.warning ? {
        counties_checked: t.warning.counties,
        raising: t.warning.raising.map((w) => ({ level: w.level, source: w.source, headline: w.headline, onset: w.onset, expiry: w.expiry })),
        yellow_mentioned: t.warning.mentioned.map((w) => ({ headline: w.headline, onset: w.onset, expiry: w.expiry })),
      } : "warnings source unavailable",
      barrier_available: t.barrier, resources: t.resources, notes: t.notes,
      reasons: t.reasons, flags: t.flags, rehearsal: t.rehearsal,
    })),
    crews: plan.crews, crew_ranking: plan.ranking, problems: plan.problems, ...extra,
  };
}

async function callApi(key, body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    if (r.status === 401) throw new Error("The API key was rejected (401). Check it in the settings box.");
    if (r.status === 429) throw new Error(`Rate or spend limit reached (429): ${msg}`);
    if (r.status === 400 && /usage limits/i.test(msg)) throw new Error(`Spend limit reached: ${msg}`);
    throw new Error(`Anthropic API error ${r.status}: ${msg}`);
  }
  return data;
}

/**
 * Ask one question. `history` is the running conversation (kept in page memory, sent back unchanged so
 * thinking blocks stay valid). `runWhatIf(changes)` is supplied by the app and re-runs the engine.
 */
export async function ask({ key, history, question, liveBlock, runWhatIf }) {
  const messages = [...history, { role: "user", content: `LIVE DATA (read at ${new Date().toISOString()}):\n${JSON.stringify(liveBlock)}\n\nQUESTION: ${question}` }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let calls = 0;
  for (let i = 0; i < 4; i++) {
    const res = await callApi(key, {
      model: MODEL, max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
      output_config: { effort: EFFORT },
      tools: [WHAT_IF_TOOL],
      messages,
    });
    calls++;
    for (const k of Object.keys(usage)) usage[k] += res.usage?.[k] || 0;
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "refusal") {
      return { text: OUT_OF_SCOPE, messages, usage, calls, model: res.model };
    }
    const tools = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !tools.length) {
      let text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (res.stop_reason === "max_tokens") text += "\n\n(Answer cut off at the length limit; ask for a shorter answer.)";
      return { text, messages, usage, calls, model: res.model };
    }
    const results = tools.map((b) => {
      try {
        if (b.name !== "what_if" || !Array.isArray(b.input?.changes)) throw new Error("unknown tool or bad input");
        return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(runWhatIf(b.input.changes)) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: b.id, is_error: true, content: String(e.message) };
      }
    });
    messages.push({ role: "user", content: results });
  }
  return { text: "Stopped after several tool calls without an answer. Please ask again more simply.", messages, usage, calls, model: MODEL };
}
