// Run: node --test test/   (no network: the Anthropic API is simulated)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ask, costOf, SYSTEM_PROMPT, OUT_OF_SCOPE } from "../src/brain.js";

test("request shape, tool loop and usage totals (simulated API)", async () => {
  const sent = [];
  const replies = [
    { stop_reason: "tool_use", model: "claude-sonnet-5-5", usage: { input_tokens: 3000, output_tokens: 200 },
      content: [{ type: "thinking", thinking: "", signature: "sig" },
                { type: "tool_use", id: "tu1", name: "what_if", input: { changes: [{ town: "Clonmel", flow_m3s: 150, warning: "unchanged", barrier_sets: null }] } }] },
    { stop_reason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 3500, output_tokens: 400, cache_read_input_tokens: 1000 },
      content: [{ type: "text", text: "Clonmel would be at Barriers (hypothetical)." }] },
  ];
  globalThis.fetch = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, json: async () => replies[sent.length - 1] }; };
  const calls = [];
  const r = await ask({ key: "sk-ant-test", history: [], question: "What if the Suir at Clonmel reaches 150 m³/s?", liveBlock: { towns: [] },
                        runWhatIf: (ch) => { calls.push(ch); return { towns: [{ town: "Clonmel", final_level: "Barriers" }] }; } });
  assert.equal(r.text, "Clonmel would be at Barriers (hypothetical).");
  assert.equal(r.calls, 2);
  assert.deepEqual(calls[0][0].town, "Clonmel");
  const [first, second] = sent;
  assert.equal(first.url, "https://api.anthropic.com/v1/messages");
  const h = first.init.headers;
  assert.equal(h["x-api-key"], "sk-ant-test");
  assert.equal(h["anthropic-version"], "2026-10-21");
  assert.equal(h["anthropic-dangerous-direct-browser-access"], "true");
  assert.ok(!("anthropic-beta" in h), "no fallback beta header");
  assert.ok(!("fallbacks" in first.body), "no fallback to another model");
  assert.equal(first.body.model, "claude-sonnet-5-5");
  assert.equal(first.body.max_tokens, 4000);
  for (const k of ["temperature", "top_p", "top_k", "thinking"]) assert.ok(!(k in first.body), `${k} must not be sent`);
  assert.equal(first.body.tools[0].strict, true);
  // the assistant turn (with its thinking block) is sent back unchanged, then the tool_result
  assert.deepEqual(second.body.messages[1].content, replies[0].content);
  assert.equal(second.body.messages[2].content[0].type, "tool_result");
  assert.equal(second.body.messages[2].content[0].tool_use_id, "tu1");
  assert.equal(r.usage.input_tokens, 6500); assert.equal(r.usage.output_tokens, 600);
  assert.match(SYSTEM_PROMPT, /Not covered: coastal and tidal flooding/);
});

test("API errors become plain messages; refusals are not invented answers", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
  await assert.rejects(ask({ key: "bad", history: [], question: "q", liveBlock: {}, runWhatIf: () => ({}) }), /key was rejected/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ stop_reason: "refusal", content: [], usage: {} }) });
  const r = await ask({ key: "k", history: [], question: "q", liveBlock: {}, runWhatIf: () => ({}) });
  assert.equal(r.text, OUT_OF_SCOPE);
});

test("cost per answer at Sonnet 5.5 prices", () => {
  // 4,000 in + 1,500 out = 0.008 + 0.015
  assert.equal(costOf({ input_tokens: 4000, output_tokens: 1500 }).toFixed(3), "0.023");
});
