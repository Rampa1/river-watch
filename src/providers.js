// River Watch: one adapter per AI provider, so the user can pick the API and model in Settings.
// Every adapter is called straight from the browser with the user's own key (checked 2026-11-26: all
// four APIs allow browser requests). Each adapter speaks its provider's own message and tool format.

import { MAX_TOKENS, EFFORT, ANTHROPIC_VERSION } from "./config.js";

const TOWNS = ["Clonmel", "Fermoy", "Mallow", "Bandon", "Enniscorthy", "Ennis", "Athlone", "Carrick-on-Shannon"];
const TOOL_NAME = "what_if";
const TOOL_DESC = "Re-run the River Watch Flood Plan engine on a hypothetical change, using today's live data for everything else. Use for any 'what if' question. Returns the recomputed plan (levels, crew places, flags) for all towns.";

// JSON Schema (Anthropic, OpenAI, Groq)
const TOOL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    changes: {
      type: "array", description: "One entry per town to change.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          town: { type: "string", enum: TOWNS },
          flow_m3s: { type: ["number", "null"], description: "Hypothetical forecast peak in m³/s, or null for no change." },
          warning: { type: "string", enum: ["orange", "red", "unchanged"], description: "Hypothetical orange/red rain warning, or 'unchanged'." },
          barrier_sets: { type: ["integer", "null"], description: "Hypothetical barrier sets, or null for no change." },
        },
        required: ["town", "flow_m3s", "warning", "barrier_sets"],
      },
    },
  },
  required: ["changes"],
};
// Gemini uses an OpenAPI-style subset: upper-case types, "nullable", no additionalProperties.
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    changes: {
      type: "ARRAY", description: "One entry per town to change.",
      items: {
        type: "OBJECT",
        properties: {
          town: { type: "STRING", enum: TOWNS },
          flow_m3s: { type: "NUMBER", nullable: true, description: "Hypothetical forecast peak in m³/s; omit or null for no change." },
          warning: { type: "STRING", enum: ["orange", "red", "unchanged"] },
          barrier_sets: { type: "INTEGER", nullable: true, description: "Hypothetical barrier sets; omit or null for no change." },
        },
        required: ["town", "warning"],
      },
    },
  },
  required: ["changes"],
};

async function http(url, init, label) {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || data?.error?.status || data?.message || `HTTP ${r.status}`;
    if (r.status === 401 || r.status === 403) throw new Error(`${label} rejected the API key (${r.status}): ${msg}`);
    if (r.status === 429) throw new Error(`${label} rate or spend limit reached (429): ${msg}`);
    if (r.status === 400 && /usage limits/i.test(msg)) throw new Error(`${label} spend limit reached: ${msg}`);
    if (r.status === 404) throw new Error(`${label} does not recognise that model (404): ${msg}`);
    throw new Error(`${label} error ${r.status}: ${msg}`);
  }
  return data;
}
const parseArgs = (s) => { try { return typeof s === "string" ? JSON.parse(s || "{}") : (s || {}); } catch { return { _bad_json: String(s) }; } };

// ---------------------------------------------------------------- Anthropic (Messages API)
const anthropic = {
  label: "Anthropic (Claude)",
  keyHint: "sk-ant-",
  defaults: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
  // USD per million tokens, https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-26)
  prices: { "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.10, 0.50], "claude-opus-5-5": [4, 20] },
  headers: (key) => ({ "content-type": "application/json", "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION,
                       "anthropic-dangerous-direct-browser-access": "true" }),
  async listModels(key) {
    const d = await http("https://api.anthropic.com/v1/models?limit=100", { headers: this.headers(key) }, this.label);
    return (d.data || []).map((m) => m.id);
  },
  userMessage: (text) => ({ role: "user", content: text }),
  async call({ key, model, system, messages }) {
    const d = await http("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: this.headers(key),
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, cache_control: { type: "ephemeral" },
        output_config: { effort: EFFORT }, tools: [{ name: TOOL_NAME, description: TOOL_DESC, strict: true, input_schema: TOOL_SCHEMA }], messages }),
    }, this.label);
    const u = d.usage || {};
    return {
      assistant: { role: "assistant", content: d.content }, // sent back unchanged (keeps thinking blocks valid)
      text: (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
      toolCalls: (d.content || []).filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input })),
      stop: d.stop_reason === "tool_use" ? "tool" : d.stop_reason === "max_tokens" ? "max" : d.stop_reason === "refusal" ? "refusal" : "end",
      usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 },
      model: d.model || model,
    };
  },
  toolResults: (rs) => [{ role: "user", content: rs.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })) }],
};

// ---------------------------------------------------------------- OpenAI-compatible (OpenAI, Groq)
function openAICompatible({ label, base, keyHint, defaults, prices, strict, filter }) {
  return {
    label, keyHint, defaults, prices,
    headers: (key) => ({ "content-type": "application/json", authorization: `Bearer ${key}` }),
    async listModels(key) {
      const d = await http(`${base}/models`, { headers: this.headers(key) }, label);
      return (d.data || []).map((m) => m.id).filter(filter).sort();
    },
    userMessage: (text) => ({ role: "user", content: text }),
    async call({ key, model, system, messages }) {
      const d = await http(`${base}/chat/completions`, {
        method: "POST", headers: this.headers(key),
        body: JSON.stringify({ model, max_completion_tokens: MAX_TOKENS,
          messages: [{ role: "system", content: system }, ...messages],
          tools: [{ type: "function", function: { name: TOOL_NAME, description: TOOL_DESC, parameters: TOOL_SCHEMA, ...(strict ? { strict: true } : {}) } }] }),
      }, label);
      const c = d.choices?.[0] || {}, m = c.message || { role: "assistant", content: "" };
      const u = d.usage || {};
      return {
        assistant: { role: "assistant", content: m.content ?? null, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) },
        text: (m.content || "").trim(),
        toolCalls: (m.tool_calls || []).map((t) => ({ id: t.id, name: t.function?.name, input: parseArgs(t.function?.arguments) })),
        stop: c.finish_reason === "tool_calls" ? "tool" : c.finish_reason === "length" ? "max" : c.finish_reason === "content_filter" || m.refusal ? "refusal" : "end",
        usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, cacheRead: 0, cacheWrite: 0 },
        model: d.model || model,
      };
    },
    toolResults: (rs) => rs.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.content })),
  };
}
const openai = openAICompatible({
  label: "OpenAI", base: "https://api.openai.com/v1", keyHint: "sk-", strict: true,
  defaults: ["gpt-4o-mini"], prices: {},
  filter: (id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(id),
});
const groq = openAICompatible({
  label: "Groq", base: "https://api.groq.com/openai/v1", keyHint: "gsk_", strict: false,
  defaults: ["llama-3.3-70b-versatile"], prices: {},
  filter: (id) => !/(whisper|tts|guard|playai)/i.test(id),
});

// ---------------------------------------------------------------- Google Gemini (generateContent)
const gemini = {
  label: "Google Gemini",
  keyHint: "AIza",
  defaults: ["gemini-2.5-flash"],
  prices: {},
  headers: (key) => ({ "content-type": "application/json", "x-goog-api-key": key }),
  async listModels(key) {
    const d = await http("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: this.headers(key) }, this.label);
    return (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, "")).filter((id) => /^gemini/.test(id)).sort();
  },
  userMessage: (text) => ({ role: "user", parts: [{ text }] }),
  async call({ key, model, system, messages }) {
    const d = await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: this.headers(key),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages,
        tools: [{ functionDeclarations: [{ name: TOOL_NAME, description: TOOL_DESC, parameters: GEMINI_SCHEMA }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS } }),
    }, this.label);
    const cand = d.candidates?.[0];
    if (!cand) return { assistant: { role: "model", parts: [{ text: "" }] }, text: "", toolCalls: [], stop: "refusal",
                        usage: { input: d.usageMetadata?.promptTokenCount || 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model };
    const parts = cand.content?.parts || [];
    const u = d.usageMetadata || {};
    const calls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `${p.functionCall.name}-${i}`, name: p.functionCall.name, input: p.functionCall.args || {} }));
    return {
      assistant: { role: "model", parts },
      text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("\n").trim(),
      toolCalls: calls,
      stop: calls.length ? "tool" : cand.finishReason === "MAX_TOKENS" ? "max" : /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(cand.finishReason || "") ? "refusal" : "end",
      usage: { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), cacheRead: 0, cacheWrite: 0 },
      model: d.modelVersion || model,
    };
  },
  toolResults: (rs) => [{ role: "user", parts: rs.map((r) => ({ functionResponse: { name: r.name, response: { result: parseArgs(r.content) } } })) }],
};

export const PROVIDERS = { anthropic, openai, gemini, groq };
export const DEFAULT_PROVIDER = "anthropic";
