// River Watch: the brain. The page calls the chosen AI provider directly from the browser with the
// user's own key (settings box). Plain fetch, no third-party script: nothing else that runs on this page
// can read the key. Code computes, the brain explains: the model gets the computed plan, never raw
// history, and may only re-run our engine through the what_if tool. Provider formats are in providers.js.

import { DISCLAIMER } from "./config.js";
import { PROVIDERS, DEFAULT_PROVIDER } from "./providers.js";

// Shown when the model declines a question (no retry on another model): treated as out of scope.
export const OUT_OF_SCOPE = "That question is outside what River Watch can answer. River Watch covers tonight's flood levels and crew places for the eight towns under The Flood Plan, and the flood-defence study ranking. Questions about coastal or tidal flooding, road closures, insurance or an individual home go to the council's area office.";
const USAGE_STORE = "riverwatch.usageLog";
const SETTINGS_STORE = "riverwatch.settings";
const keyName = (p) => `riverwatch.key.${p}`;

/** Settings kept in this browser only: provider, model, prices, and one key per provider. */
export const settings = {
  get() {
    const s = JSON.parse(localStorage.getItem(SETTINGS_STORE) || "{}");
    const provider = PROVIDERS[s.provider] ? s.provider : DEFAULT_PROVIDER;
    const model = s.model || PROVIDERS[provider].defaults[0];
    const known = PROVIDERS[provider].prices[model];
    return { provider, model, priceIn: s.priceIn ?? known?.[0] ?? null, priceOut: s.priceOut ?? known?.[1] ?? null };
  },
  save(v) { localStorage.setItem(SETTINGS_STORE, JSON.stringify(v)); },
  key: (p) => localStorage.getItem(keyName(p)) || (p === "anthropic" ? localStorage.getItem("riverwatch.anthropicKey") || "" : ""),
  saveKey: (p, k) => localStorage.setItem(keyName(p), k.trim()),
  forgetKey: (p) => { localStorage.removeItem(keyName(p)); if (p === "anthropic") localStorage.removeItem("riverwatch.anthropicKey"); },
};

export const usageLog = {
  all: () => JSON.parse(localStorage.getItem(USAGE_STORE) || "[]"),
  add: (e) => { const a = usageLog.all(); a.push(e); localStorage.setItem(USAGE_STORE, JSON.stringify(a)); },
  clear: () => localStorage.removeItem(USAGE_STORE),
};

/** Cost in USD from token usage and the per-million prices in Settings (null if no price is set).
 *  Anthropic cache writes cost 1.25x input and cache reads 0.05x input on Sonnet/Opus 5.5 (0.1x on Haiku). */
export function costOf(u, priceIn, priceOut, model = "") {
  if (priceIn == null || priceOut == null || priceIn === "" || priceOut === "") return null;
  const readMult = /haiku/.test(model) ? 0.1 : 0.05;
  return ((u.input || 0) * priceIn + (u.output || 0) * priceOut
    + (u.cacheWrite || 0) * priceIn * 1.25 + (u.cacheRead || 0) * priceIn * readMult) / 1e6;
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

/**
 * Ask one question. `history` is the running conversation in the provider's own format (sent back
 * unchanged). `runWhatIf(changes)` is supplied by the app and re-runs the engine.
 */
export async function ask({ provider = DEFAULT_PROVIDER, model, key, history, question, liveBlock, runWhatIf }) {
  const P = PROVIDERS[provider];
  if (!P) throw new Error(`Unknown provider ${provider}`);
  model = model || P.defaults[0];
  const messages = [...history, P.userMessage(`LIVE DATA (read at ${new Date().toISOString()}):\n${JSON.stringify(liveBlock)}\n\nQUESTION: ${question}`)];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let calls = 0, used = model;
  for (let i = 0; i < 4; i++) {
    const res = await P.call({ key, model, system: SYSTEM_PROMPT, messages });
    calls++; used = res.model || used;
    for (const k of Object.keys(usage)) usage[k] += res.usage[k] || 0;
    messages.push(res.assistant);
    if (res.stop === "refusal") return { text: OUT_OF_SCOPE, messages, usage, calls, model: used };
    if (res.stop !== "tool" || !res.toolCalls.length) {
      let text = res.text || "(The model returned no text.)";
      if (res.stop === "max") text += "\n\n(Answer cut off at the length limit; ask for a shorter answer.)";
      return { text, messages, usage, calls, model: used };
    }
    const results = res.toolCalls.map((t) => {
      try {
        if (t.name !== "what_if" || !Array.isArray(t.input?.changes)) throw new Error("unknown tool or bad input");
        return { id: t.id, name: t.name, content: JSON.stringify(runWhatIf(t.input.changes)) };
      } catch (e) {
        return { id: t.id, name: t.name, isError: true, content: JSON.stringify({ error: String(e.message) }) };
      }
    });
    messages.push(...P.toolResults(results));
  }
  return { text: "Stopped after several tool calls without an answer. Please ask again more simply.", messages, usage, calls, model: used };
}
