// River Watch page: wires the settings box, live sources, engine, brain and display together.
import { buildPlan } from "./plan.js";
import { readAllLive } from "./sources.js";
import { ask, keyStore, usageLog, costOf, planForModel } from "./brain.js";
import { sheetViewUrl, MODEL } from "./config.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }) : "-";
const fmtDate = (d) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" }) : "-";

let live = null, plan = null, history = [];

// ---------- settings box (key stays in this browser only) ----------
function showKeyState() {
  const k = keyStore.get();
  $("#keyState").textContent = k ? `Key saved in this browser (…${k.slice(-4)}).` : "No key saved. Paste your Anthropic API key to ask questions.";
  $("#askBtn").disabled = !k;
}
$("#saveKey").onclick = () => {
  const v = $("#keyInput").value.trim();
  if (!/^sk-ant-/.test(v)) { $("#keyState").textContent = "That does not look like an Anthropic key (it should start with sk-ant-)."; return; }
  keyStore.save(v); $("#keyInput").value = ""; showKeyState();
};
$("#forgetKey").onclick = () => { keyStore.forget(); showKeyState(); };

// ---------- live data + plan ----------
async function refresh() {
  $("#status").textContent = "Reading the team Sheet, Open-Meteo and Met Éireann now…";
  live = await readAllLive();
  plan = buildPlan({ rows: live.rows, history: live.history, forecasts: live.forecasts, warnings: live.warnings, now: new Date(), sources: live.sources });
  render();
  $("#status").textContent = `Live data read ${fmtTime(new Date().toISOString())}.`;
  return plan;
}

function levelBadge(t) {
  const lvl = t.level ?? "Unknown";
  return `<span class="lvl lvl-${lvl.toLowerCase()}">${esc(lvl)}</span>`;
}

function render() {
  $("#rehearsal").hidden = !plan.rehearsal;
  const rows = plan.towns.map((t) => {
    const days = t.forecast.days?.map((d) => `${fmtDate(d.date)} ${d.value}`).join(" · ") ?? `<em>${esc(t.forecast.error)}</em>`;
    const warn = !t.warning ? "<em>source down</em>"
      : t.warning.raises ? t.warning.raising.map((w) => `<b>${esc(w.level)}</b>${w.source === "rehearsal" ? " (rehearsal)" : ""}`).join(", ")
      : t.warning.mentioned.length ? "yellow (no change)" : "none";
    return `<tr>
      <td><b>${esc(t.town)}</b><br><small>${esc(t.river)}, ${esc(t.county)}</small></td>
      <td>${levelBadge(t)}<br><small>${esc(t.action)}${t.crew ? ` (${esc(t.crew)} crew)` : ""}</small></td>
      <td class="num">${t.peak ?? "-"}${t.rehearsal.some((r) => r.startsWith("flow")) ? ' <span class="tag">rehearsal</span>' : ""}<br><small>${days}</small></td>
      <td class="num">${t.p95} / ${t.p99}<br><small>${t.pctAboveP99 != null ? `${t.pctAboveP99 > 0 ? "+" : ""}${t.pctAboveP99}% vs P99` : ""}</small></td>
      <td>${warn}<br><small>${esc(t.warning?.counties.join(" + ") ?? "")}</small></td>
      <td><small>${t.reasons.map(esc).join("<br>")}${t.flags.length ? `<br><span class="flag">${t.flags.map(esc).join("<br>")}</span>` : ""}</small>
        <br><a href="${esc(t.forecast.url)}" target="_blank" rel="noopener">forecast source ↗</a></td>
    </tr>`;
  }).join("");
  $("#planBody").innerHTML = rows;

  $("#crews").innerHTML = Object.entries(plan.crews).map(([c, v]) =>
    `<li><b>${esc(c)} crew</b>: ${v.goes_to.length ? `recommended to ${v.goes_to.map(esc).join(" and ")}` : "no barrier job tonight"}
      <small>(may work in ${v.may_work_in.map(esc).join(", ") || "nowhere tonight"}${v.constraints.length ? `; ${v.constraints.map(esc).join("; ")}` : ""})</small></li>`).join("");
  $("#problems").innerHTML = plan.problems.map((p) => `<li>${esc(p)}</li>`).join("");
  $("#problemsBox").hidden = !plan.problems.length;

  const s = live.sources;
  const src = (o, extra = "") => o.error ? `<span class="flag">${esc(o.name)}: unavailable (${esc(o.error)})</span>`
    : `${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>` : esc(o.name)}, read ${fmtTime(o.fetchedAt || o.builtAt)}${extra}`;
  $("#sources").innerHTML = [
    src(s.sheet), src(s.forecast, " (daily values for local dates shown; peak = max of today and next 2 days)"),
    src(s.warnings, s.warnings.count != null ? `, ${s.warnings.count} warning(s) in feed` : ""),
    `${esc(s.thresholds.name)}: <a href="data/history_summary.json" target="_blank">stored file</a>, built ${esc(s.thresholds.builtAt)}`,
    `${esc(s.study.name)}: <a href="data/study_ranking.json" target="_blank">stored file</a>, built ${esc(s.study.builtAt)}`,
  ].map((x) => `<li>${x}</li>`).join("");
}

// ---------- what-if: re-run the engine on a copy of the live data ----------
function runWhatIf(changes) {
  const rows = live.rows.map((r) => ({ ...r }));
  for (const c of changes) {
    const r = rows.find((x) => x.town === c.town);
    if (!r) throw new Error(`unknown town ${c.town}`);
    if (c.flow_m3s != null) r.flow_override_m3s = String(c.flow_m3s);
    if (c.warning === "orange" || c.warning === "red") r.warning_override = c.warning;
    if (c.barrier_sets != null) r.barrier_sets = String(c.barrier_sets);
  }
  const p = buildPlan({ rows, history: live.history, forecasts: live.forecasts, warnings: live.warnings, now: new Date(), sources: live.sources });
  return planForModel(p, { hypothetical: true, changes_applied: changes });
}

// ---------- questions ----------
function addMsg(who, html) {
  const d = document.createElement("div"); d.className = `msg ${who}`; d.innerHTML = html; $("#chat").append(d); d.scrollIntoView({ block: "nearest" });
  return d;
}
function mdLite(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#+\s*(.+)$/gm, "<b>$1</b>").replace(/^\s*[-*]\s+/gm, "• ").replace(/\n/g, "<br>");
}
function showUsage() {
  const log = usageLog.all();
  const total = log.reduce((a, e) => a + e.cost, 0);
  $("#usage").textContent = log.length
    ? `${log.length} question(s) sent from this browser · last answer $${log.at(-1).cost.toFixed(4)} (${log.at(-1).input} in / ${log.at(-1).output} out tokens) · average $${(total / log.length).toFixed(4)} · total $${total.toFixed(3)}`
    : "No questions sent yet from this browser.";
}

async function onAsk(question) {
  question = question.trim(); if (!question) return;
  const key = keyStore.get();
  if (!key) { showKeyState(); return; }
  $("#askBtn").disabled = true;
  addMsg("me", esc(question));
  const wait = addMsg("bot", "<em>Reading live sources and asking Claude…</em>");
  try {
    await refresh(); // every question reads the Sheet and live sources again
    const liveBlock = { ...planForModel(plan), sources: live.sources,
      study_ranking_rule8: live.study, thresholds_note: `P95/P99 from ${live.historyMeta.source}, ${live.historyMeta.period}, ${live.historyMeta.method}` };
    const r = await ask({ key, history, question, liveBlock, runWhatIf });
    history = r.messages;
    const cost = costOf(r.usage);
    usageLog.add({ at: new Date().toISOString(), q: question.slice(0, 80), input: r.usage.input_tokens + r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens, output: r.usage.output_tokens, calls: r.calls, cost });
    wait.innerHTML = `${mdLite(r.text)}<div class="meta">${esc(r.model || MODEL)} · ${r.calls} call(s) · ${r.usage.output_tokens} output tokens · ≈ $${cost.toFixed(4)}${plan.rehearsal ? ' · <span class="tag">rehearsal values in use</span>' : ""}</div>`;
  } catch (e) {
    wait.innerHTML = `<span class="flag">${esc(e.message)}</span>`;
  } finally {
    $("#askBtn").disabled = !keyStore.get(); showUsage();
  }
}

$("#askForm").onsubmit = (e) => { e.preventDefault(); const q = $("#question").value; $("#question").value = ""; onAsk(q); };
document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => onAsk(b.dataset.q)));
$("#refreshBtn").onclick = () => refresh().catch((e) => ($("#status").textContent = e.message));
$("#newChat").onclick = () => { history = []; $("#chat").innerHTML = ""; };
$("#clearUsage").onclick = () => { usageLog.clear(); showUsage(); };
$("#sheetLink").href = sheetViewUrl;

showKeyState(); showUsage();
refresh().catch((e) => ($("#status").innerHTML = `<span class="flag">${esc(e.message)}</span>`));
