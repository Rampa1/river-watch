// Run: node --test test/   (no network: every provider's API is simulated)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ask, costOf, SYSTEM_PROMPT, OUT_OF_SCOPE } from "../src/brain.js";
import { PROVIDERS } from "../src/providers.js";

const Q = "What if the Suir at Clonmel reaches 150 m³/s?";
function simulate(replies) {
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return { ok: true, json: async () => replies[sent.length - 1] }; };
  return sent;
}
const whatIf = (calls) => (ch) => { calls.push(ch); return { towns: [{ town: "Clonmel", final_level: "Barriers" }] }; };

test("Anthropic: request shape, tool loop, thinking blocks returned unchanged", async () => {
  const replies = [
    { stop_reason: "tool_use", model: "claude-sonnet-5-5", usage: { input_tokens: 3000, output_tokens: 200 },
      content: [{ type: "thinking", thinking: "", signature: "sig" },
                { type: "tool_use", id: "tu1", name: "what_if", input: { changes: [{ town: "Clonmel", flow_m3s: 150, warning: "unchanged", barrier_sets: null }] } }] },
    { stop_reason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 3500, output_tokens: 400, cache_read_input_tokens: 1000 },
      content: [{ type: "text", text: "Clonmel would be at Barriers (hypothetical)." }] },
  ];
  const sent = simulate(replies), calls = [];
  const r = await ask({ provider: "anthropic", model: "claude-sonnet-5-5", key: "sk-ant-test", history: [], question: Q, liveBlock: {}, runWhatIf: whatIf(calls) });
  assert.equal(r.text, "Clonmel would be at Barriers (hypothetical).");
  assert.equal(calls[0][0].flow_m3s, 150);
  const [first, second] = sent, h = first.init.headers;
  assert.equal(first.url, "https://api.anthropic.com/v1/messages");
  assert.equal(h["x-api-key"], "sk-ant-test"); assert.equal(h["anthropic-version"], "2026-10-21");
  assert.equal(h["anthropic-dangerous-direct-browser-access"], "true");
  assert.ok(!("anthropic-beta" in h)); assert.ok(!("fallbacks" in first.body), "no fallback to another model");
  for (const k of ["temperature", "top_p", "top_k", "thinking"]) assert.ok(!(k in first.body), `${k} must not be sent`);
  assert.equal(first.body.max_tokens, 4000); assert.equal(first.body.tools[0].strict, true);
  assert.ok(!("cache_control" in first.body), "no prompt caching: live data changes every question");
  assert.deepEqual(second.body.messages[1].content, replies[0].content);
  assert.equal(second.body.messages[2].content[0].tool_use_id, "tu1");
  assert.deepEqual(r.usage, { input: 6500, output: 600, cacheRead: 1000, cacheWrite: 0 });
  assert.match(SYSTEM_PROMPT, /Not covered: coastal and tidal flooding/);
});

test("OpenAI: chat completions with function tool, tool message round-trip", async () => {
  const replies = [
    { model: "gpt-4o-mini", usage: { prompt_tokens: 3000, completion_tokens: 50 },
      choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "what_if", arguments: '{"changes":[{"town":"Clonmel","flow_m3s":150,"warning":"unchanged","barrier_sets":null}]}' } }] } }] },
    { model: "gpt-4o-mini", usage: { prompt_tokens: 3300, completion_tokens: 300 },
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hypothetical: Clonmel at Barriers." } }] },
  ];
  const sent = simulate(replies), calls = [];
  const r = await ask({ provider: "openai", model: "gpt-4o-mini", key: "sk-test", history: [], question: Q, liveBlock: {}, runWhatIf: whatIf(calls) });
  assert.equal(r.text, "Hypothetical: Clonmel at Barriers.");
  assert.equal(sent[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(sent[0].init.headers.authorization, "Bearer sk-test");
  assert.equal(sent[0].body.messages[0].role, "system");
  assert.equal(sent[0].body.tools[0].function.name, "what_if");
  assert.equal(sent[0].body.tools[0].function.strict, true);
  const toolMsg = sent[1].body.messages.at(-1);
  assert.equal(toolMsg.role, "tool"); assert.equal(toolMsg.tool_call_id, "c1");
  assert.equal(calls[0][0].town, "Clonmel");
  assert.deepEqual(r.usage, { input: 6300, output: 350, cacheRead: 0, cacheWrite: 0 });
});

test("Groq uses the OpenAI format at its own address, without strict", async () => {
  const sent = simulate([{ model: "llama-3.3-70b-versatile", usage: { prompt_tokens: 10, completion_tokens: 5 },
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }] }]);
  await ask({ provider: "groq", model: "llama-3.3-70b-versatile", key: "gsk_x", history: [], question: "q", liveBlock: {}, runWhatIf: () => ({}) });
  assert.equal(sent[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.ok(!("strict" in sent[0].body.tools[0].function));
});

test("Gemini: generateContent with functionDeclarations and functionResponse", async () => {
  const replies = [
    { modelVersion: "gemini-2.5-flash", usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 20, thoughtsTokenCount: 100 },
      candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name: "what_if", args: { changes: [{ town: "Clonmel", flow_m3s: 150, warning: "unchanged" }] } } }] } }] },
    { modelVersion: "gemini-2.5-flash", usageMetadata: { promptTokenCount: 3200, candidatesTokenCount: 250 },
      candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Hypothetically Barriers." }] } }] },
  ];
  const sent = simulate(replies), calls = [];
  const r = await ask({ provider: "gemini", model: "gemini-2.5-flash", key: "AIza-test", history: [], question: Q, liveBlock: {}, runWhatIf: whatIf(calls) });
  assert.equal(r.text, "Hypothetically Barriers.");
  assert.match(sent[0].url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(sent[0].init.headers["x-goog-api-key"], "AIza-test");
  assert.equal(sent[0].body.tools[0].functionDeclarations[0].parameters.type, "OBJECT");
  const last = sent[1].body.contents.at(-1);
  assert.equal(last.parts[0].functionResponse.name, "what_if");
  assert.equal(calls[0][0].flow_m3s, 150);
  assert.deepEqual(r.usage, { input: 6200, output: 370, cacheRead: 0, cacheWrite: 0 });
});

test("errors become plain messages; a refusal returns the out-of-scope reply", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
  await assert.rejects(ask({ provider: "anthropic", key: "bad", history: [], question: "q", liveBlock: {}, runWhatIf: () => ({}) }), /rejected the API key/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ stop_reason: "refusal", content: [], usage: {} }) });
  const r = await ask({ provider: "anthropic", key: "k", history: [], question: "q", liveBlock: {}, runWhatIf: () => ({}) });
  assert.equal(r.text, OUT_OF_SCOPE);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }], usageMetadata: {} }) });
  const g = await ask({ provider: "gemini", model: "gemini-2.5-flash", key: "k", history: [], question: "q", liveBlock: {}, runWhatIf: () => ({}) });
  assert.equal(g.text, OUT_OF_SCOPE);
});

test("every provider has a label, default model and key hint; Claude prices match the pricing page", () => {
  for (const P of Object.values(PROVIDERS)) { assert.ok(P.label && P.defaults.length && P.keyHint); }
  assert.deepEqual(PROVIDERS.anthropic.prices["claude-sonnet-5-5"], [2, 10]);
});

test("cost per answer uses the prices in Settings; none if prices are blank", () => {
  assert.equal(costOf({ input: 4000, output: 1500 }, 2, 10).toFixed(3), "0.023");
  assert.equal(costOf({ input: 4000, output: 1500 }, null, null), null);
});
