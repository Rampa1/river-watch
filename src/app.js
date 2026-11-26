// River Watch page: wires the settings box, live sources, engine, brain and display together.
import { buildPlan } from "./plan.js";
import { readAllLive } from "./sources.js";
import { ask, settings, usageLog, costOf, planForModel } from "./brain.js";
import { PROVIDERS } from "./providers.js";
import { sheetViewUrl } from "./config.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }) : "-";
const fmtDate = (d) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" }) : "-";
const DECISIONS = "riverwatch.decisions";

let live = null, plan = null, history = [];

// ---------- settings box: provider, model, prices, and a key per provider (this browser only) ----------
const MODELS_STORE = (p) => `riverwatch.models.${p}`;
const OTHER = "__other";

function modelChoices(p) {
  const loaded = JSON.parse(localStorage.getItem(MODELS_STORE(p)) || "[]");
  return [...new Set([...PROVIDERS[p].defaults, ...loaded])];
}
function fillProviders() {
  $("#provider").innerHTML = Object.entries(PROVIDERS).map(([id, P]) => `<option value="${id}">${esc(P.label)}</option>`).join("");
}
function fillModels(p, selected) {
  const list = modelChoices(p);
  const custom = selected && !list.includes(selected);
  $("#model").innerHTML = list.map((m) => `<option value="${esc(m)}">${esc(m)}${m === PROVIDERS[p].defaults[0] ? " (default)" : ""}</option>`).join("")
    + `<option value="${OTHER}">Other… (type a model name)</option>`;
  $("#model").value = custom ? OTHER : (selected || list[0]);
  $("#modelOther").hidden = !custom;
  $("#modelOther").value = custom ? selected : "";
}
const currentModel = () => ($("#model").value === OTHER ? $("#modelOther").value.trim() : $("#model").value);
function fillPrices(p, m, keepTyped = false) {
  const known = PROVIDERS[p].prices[m];
  if (known) { $("#priceIn").value = known[0]; $("#priceOut").value = known[1]; }
  else if (!keepTyped) { $("#priceIn").value = ""; $("#priceOut").value = ""; }
}
function persist() {
  const num = (v) => (v === "" ? null : Number(v));
  settings.save({ provider: $("#provider").value, model: currentModel(), priceIn: num($("#priceIn").value), priceOut: num($("#priceOut").value) });
}
/** Forget the previous question and answer: clears the screen and the AI's memory of the conversation. */
function resetConversation(note) {
  history = []; $("#chat").innerHTML = ""; $("#decision").hidden = true;
  $("#followUp").checked = false; $("#followUp").disabled = true;
  if (note) $("#sendStatus").textContent = note;
}
/** Results stay hidden until a question is asked (as in Winter Watch). */
function showResults(on) {
  for (const id of ["#adviceCard", "#planCard", "#sourcesCard"]) $(id).hidden = !on;
  if (!on) $("#rehearsal").hidden = true;
}
function showKeyState() {
  const p = $("#provider").value, k = settings.key(p);
  $("#keyState").textContent = k ? `A ${PROVIDERS[p].label} key is saved in this browser (…${k.slice(-4)}).` : `No ${PROVIDERS[p].label} key saved yet.`;
  $("#keyInput").placeholder = k ? "Key saved in this browser (hidden)" : `Paste your key here (${PROVIDERS[p].keyHint}…)`;
  $("#askBtn").disabled = !k || !currentModel();
}
function loadSettings() {
  const s = settings.get();
  $("#provider").value = s.provider;
  fillModels(s.provider, s.model);
  $("#priceIn").value = s.priceIn ?? ""; $("#priceOut").value = s.priceOut ?? "";
  showKeyState();
}
$("#provider").onchange = () => {
  const p = $("#provider").value;
  fillModels(p, PROVIDERS[p].defaults[0]); fillPrices(p, currentModel()); persist(); showKeyState();
  resetConversation(`Switched to ${PROVIDERS[p].label} · ${currentModel()}. New conversation started.`);
};
$("#model").onchange = () => {
  $("#modelOther").hidden = $("#model").value !== OTHER;
  if ($("#model").value === OTHER) $("#modelOther").focus();
  fillPrices($("#provider").value, currentModel()); persist(); showKeyState();
  resetConversation(`Model set to ${currentModel() || "(type a name)"}. New conversation started.`);
};
$("#modelOther").onchange = () => { fillPrices($("#provider").value, currentModel(), true); persist(); showKeyState(); };
$("#priceIn").onchange = $("#priceOut").onchange = persist;
$("#loadModels").onclick = async () => {
  const p = $("#provider").value, key = $("#keyInput").value.trim() || settings.key(p);
  if (!key) { $("#keyState").textContent = "Paste or save a key for this provider first."; return; }
  $("#keyState").textContent = `Loading models from ${PROVIDERS[p].label}…`;
  try {
    const list = await PROVIDERS[p].listModels(key);
    localStorage.setItem(MODELS_STORE(p), JSON.stringify(list));
    fillModels(p, currentModel());
    $("#keyState").textContent = `${list.length} model(s) loaded from ${PROVIDERS[p].label}.`;
  } catch (e) { $("#keyState").textContent = e.message; }
};
$("#saveKey").onclick = () => {
  const p = $("#provider").value, v = $("#keyInput").value.trim();
  persist();
  if (v) {
    settings.saveKey(p, v); $("#keyInput").value = "";
    showKeyState();
    if (!v.startsWith(PROVIDERS[p].keyHint)) $("#keyState").textContent += ` Note: ${PROVIDERS[p].label} keys usually start with "${PROVIDERS[p].keyHint}".`;
    else $("#keyState").textContent = "Saved. " + $("#keyState").textContent;
  } else { showKeyState(); $("#keyState").textContent = "Settings saved. " + $("#keyState").textContent; }
};
$("#forgetKey").onclick = () => { settings.forgetKey($("#provider").value); $("#keyInput").value = ""; showKeyState(); $("#keyState").textContent = "Key forgotten for this provider."; };

// ---------- live data + plan ----------
async function refresh() {
  $("#status").textContent = "Reading the team Sheet, Open-Meteo and Met Éireann now…";
  live = await readAllLive();
  plan = buildPlan({ rows: live.rows, history: live.history, forecasts: live.forecasts, warnings: live.warnings, now: new Date(), sources: live.sources });
  render();
  $("#status").textContent = `Live data read ${fmtTime(new Date().toISOString())}. Rules applied by code; the AI only explains.`;
  return plan;
}

const lvlKey = (t) => (t.level ?? "Unknown").toLowerCase();

function render() {
  $("#rehearsal").hidden = !plan.rehearsal;

  const count = (l) => plan.towns.filter((t) => t.level === l).length;
  const crewsOut = Object.values(plan.crews).reduce((a, c) => a + c.goes_to.length, 0);
  const warned = plan.towns.filter((t) => t.warning?.raises).length;
  $("#tiles").innerHTML = [
    ["t-bar", count("Barriers"), "towns at Barriers"], ["t-sby", count("Standby"), "towns at Standby"],
    ["t-nor", count("Normal"), "towns Normal"], ["t-crw", `${crewsOut}/6`, "crew places used"],
    ["t-wrn", warned, "towns raised by a warning"],
  ].map(([c, v, l]) => `<div class="tile ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

  $("#planBody").innerHTML = plan.towns.map((t) => {
    const days = t.forecast.days?.map((d) => `${fmtDate(d.date)} ${d.value}`).join(" · ") ?? `<em>${esc(t.forecast.error)}</em>`;
    const warn = !t.warning ? "<em>source down</em>"
      : t.warning.raises ? t.warning.raising.map((w) => `<b>${esc(w.level)}</b>${w.source === "rehearsal" ? ' <span class="tag">rehearsal</span>' : ""}`).join(", ")
      : t.warning.mentioned.length ? "yellow (no change)" : "none";
    const rehearsalFlow = t.rehearsal.some((r) => r.startsWith("flow")) ? ' <span class="tag">rehearsal</span>' : "";
    return `<tr class="r-${lvlKey(t)}">
      <td><b>${esc(t.town)}</b><br><span class="sub">${esc(t.river)}, ${esc(t.county)}</span></td>
      <td data-label="Level / action"><span class="lvl lvl-${lvlKey(t)}">${esc(t.level ?? "Unknown")}</span><br><span class="sub">${esc(t.action)}${t.crew ? ` (${esc(t.crew)} crew)` : ""}</span></td>
      <td data-label="Forecast peak m³/s (today + 2 days)" class="num">${t.peak ?? "-"}${rehearsalFlow}<br><span class="sub">${days}</span></td>
      <td data-label="P95 / P99 m³/s" class="num">${t.p95} / ${t.p99}<br><span class="sub">${t.pctAboveP99 != null ? `${t.pctAboveP99 > 0 ? "+" : ""}${t.pctAboveP99}% vs P99` : ""}</span></td>
      <td data-label="Rain warning">${warn}<br><span class="sub">${esc(t.warning?.counties.join(" + ") ?? "")}</span></td>
      <td data-label="Working"><span class="sub">${t.reasons.map(esc).join("<br>")}</span>${t.flags.length ? `<br><span class="flag">${t.flags.map(esc).join("<br>")}</span>` : ""}
        <br><a href="${esc(t.forecast.url)}" target="_blank" rel="noopener">forecast source ↗</a></td>
    </tr>`;
  }).join("");

  $("#crews").innerHTML = Object.entries(plan.crews).map(([c, v]) =>
    `<li><b>${esc(c)} crew</b>: ${v.goes_to.length ? `recommended to ${v.goes_to.map(esc).join(" and ")}` : "no barrier job tonight"}
      <span class="sub">(may work in ${v.may_work_in.map(esc).join(", ") || "nowhere tonight"}${v.constraints.length ? `; ${v.constraints.map(esc).join("; ")}` : ""})</span></li>`).join("");
  $("#problems").innerHTML = plan.problems.map((p) => `<li>${esc(p)}</li>`).join("");
  $("#problemsBox").hidden = !plan.problems.length;

  const s = live.sources;
  const src = (o, extra = "") => o.error ? `<span class="flag">${esc(o.name)}: unavailable (${esc(o.error)})</span>`
    : `${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a>` : esc(o.name)}, read ${fmtTime(o.fetchedAt || o.builtAt)}${extra}`;
  $("#sources").innerHTML = [
    src(s.sheet), src(s.forecast, " (daily values for local dates; peak = max of today and the next 2 days)"),
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

// ---------- answer formatting: small, safe Markdown (escaped first) ----------
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = text.replace(/\r/g, "").split("\n");
  let html = "", list = null, i = 0;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      close();
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      let t = `<div class="scroll"><table class="md"><thead><tr>${cells(l).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`;
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { t += `<tr>${cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`; i++; }
      html += t + "</tbody></table></div>"; continue;
    }
    let m;
    if ((m = /^#{1,6}\s+(.*)$/.exec(l))) { close(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) close();
    else { close(); html += `<p>${inline(l)}</p>`; }
    i++;
  }
  close();
  return html;
}

// ---------- questions ----------
function addMsg(cls, html) {
  const d = document.createElement("div"); d.className = `msg ${cls}`; d.innerHTML = html; $("#chat").append(d);
  d.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return d;
}
function showUsage() {
  const log = usageLog.all();
  const priced = log.filter((e) => typeof e.cost === "number");
  const total = priced.reduce((a, e) => a + e.cost, 0);
  $("#usage").textContent = !log.length ? "No questions sent yet from this browser."
    : `${log.length} question(s) sent from this browser` + (priced.length
      ? ` · last $${priced.at(-1).cost.toFixed(4)} · average $${(total / priced.length).toFixed(4)} per answer · total $${total.toFixed(3)}` : " · set prices in Settings to see cost");
}

async function onAsk(question) {
  question = question.trim(); if (!question) return;
  const s = settings.get(), P = PROVIDERS[s.provider], key = settings.key(s.provider), model = currentModel();
  if (!key) { $("#sendStatus").textContent = `Save your ${P.label} API key in Settings first.`; $("#settings").open = true; return; }
  if (!model) { $("#sendStatus").textContent = "Choose or type a model in Settings first."; $("#settings").open = true; return; }
  $("#askBtn").disabled = true;
  const followUp = $("#followUp").checked && history.length > 0;
  if (!followUp) resetConversation(); // a new question starts fresh: previous Q&A cleared from screen and memory
  showResults(true);
  addMsg("me", `${followUp ? '<span class="sub">Follow-up: </span>' : ""}${esc(question)}`);
  const wait = addMsg("bot", "<p><em>Reading live sources and asking the AI…</em></p>");
  $("#sendStatus").textContent = "Fetching the team Sheet, river forecast and warnings…";
  try {
    await refresh(); // every question reads the Sheet and live sources again
    $("#sendStatus").textContent = `Asking ${P.label} (${model})…`;
    const liveBlock = { ...planForModel(plan), sources: live.sources,
      study_ranking_rule8: live.study, thresholds_note: `P95/P99 from ${live.historyMeta.source}, ${live.historyMeta.period}, ${live.historyMeta.method}` };
    const r = await ask({ provider: s.provider, model, key, history, question, liveBlock, runWhatIf });
    history = r.messages;
    const input = r.usage.input + r.usage.cacheRead + r.usage.cacheWrite;
    const cost = costOf(r.usage, s.priceIn, s.priceOut, model);
    usageLog.add({ at: new Date().toISOString(), provider: s.provider, model, q: question.slice(0, 80), input, output: r.usage.output, calls: r.calls, cost });
    const costTxt = cost == null ? "cost not shown (set prices in Settings)"
      : `cost this question US$${cost.toFixed(4)} (${input.toLocaleString()} × $${s.priceIn}/M + ${r.usage.output.toLocaleString()} × $${s.priceOut}/M${r.usage.cacheRead ? ", cache reads discounted" : ""})`;
    wait.innerHTML = `${md(r.text)}<div class="meta">Tokens used: ${input.toLocaleString()} in + ${r.usage.output.toLocaleString()} out · ${costTxt} · answered by ${esc(P.label)} · ${esc(r.model || model)} · ${fmtTime(new Date().toISOString())}${plan.rehearsal ? ' · <span class="tag">rehearsal values in use</span>' : ""} · Advice only. The Duty Officer decides.</div>`;
    $("#decision").hidden = false;
    $("#decisionStatus").textContent = "";
  } catch (e) {
    wait.className = "msg err"; wait.textContent = `Error: ${e.message}`;
  } finally {
    showKeyState(); $("#sendStatus").textContent = ""; showUsage();
    $("#followUp").disabled = history.length === 0;
    $("#followUp").checked = false; // each question starts fresh unless follow-up is ticked again
  }
}

// ---------- decision record (Flood Plan Rule 1), kept in this browser ----------
function showDecisions() {
  const all = JSON.parse(localStorage.getItem(DECISIONS) || "[]");
  $("#decisionLog").innerHTML = all.slice(-5).reverse().map((d) =>
    `<li><b>${esc(d.decision)}</b> · ${fmtTime(d.at)}${d.rehearsal ? ' · <span class="tag">rehearsal</span>' : ""}<br><span class="sub">${esc(d.reason || "(no reason given)")}</span></li>`).join("");
}
function record(decision) {
  const reason = $("#reason").value.trim();
  if (!reason) { $("#decisionStatus").textContent = "Please add the reason (Flood Plan Rule 1)."; return; }
  const all = JSON.parse(localStorage.getItem(DECISIONS) || "[]");
  all.push({ at: new Date().toISOString(), decision, reason, rehearsal: plan?.rehearsal,
             levels: plan?.towns.map((t) => `${t.town}: ${t.level}`).join("; ") });
  localStorage.setItem(DECISIONS, JSON.stringify(all));
  $("#reason").value = ""; $("#decisionStatus").textContent = `${decision} recorded in this browser. The Duty Officer's decision stands.`;
  showDecisions();
}
$("#approve").onclick = () => record("Approved");
$("#reject").onclick = () => record("Rejected");

// ---------- wiring ----------
$("#askForm").onsubmit = (e) => { e.preventDefault(); const q = $("#question").value; $("#question").value = ""; onAsk(q); };
$("#question").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#askForm").requestSubmit(); } });
document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { $("#followUp").checked = false; onAsk(b.dataset.q); }));
$("#refreshBtn").onclick = () => refresh().catch((e) => ($("#status").textContent = e.message));
$("#newChat").onclick = () => { resetConversation(); showResults(false); $("#question").value = ""; };
$("#clearUsage").onclick = () => { usageLog.clear(); showUsage(); };
$("#sheetLink").href = sheetViewUrl;

// Nothing is fetched or shown until a question is asked.
fillProviders(); loadSettings(); showUsage(); showDecisions();
