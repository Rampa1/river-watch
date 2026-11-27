// River Watch: The Flood Plan (2026/27) applied in code. Pure functions, with no network access and no AI.
// Code computes, the brain explains: this module produces every level, crew place and flag;
// the model only puts them into words.

import { CREWS, TOWNS_PER_CREW } from "./config.js";
import { warningForTown, applyWarning } from "./warnings.js";

const LEVELS = ["Normal", "Standby", "Barriers"];
const num = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s.replace(/\s*(m3\/s|m³\/s|cumecs?)$/i, ""));
  return Number.isFinite(n) ? n : NaN;
};
const round1 = (x) => Math.round(x * 10) / 10;

/** Rule 7 ("read the notes column"): a barrier set is unavailable if the count is 0, or the notes
 *  say the set is on loan, unavailable, damaged and so on. */
export function barrierAvailable(row) {
  const sets = num(row.barrier_sets);
  if (!(sets > 0)) return { ok: false, why: `barrier_sets = ${row.barrier_sets || 0}` };
  const m = /barrier[^.;]*?\b(on loan|loaned|lent|unavailable|not available|out of service|damaged|missing|broken|in repair)\b/i
    .exec(row.notes || "");
  if (m) return { ok: false, why: `notes: "${row.notes}"` };
  return { ok: true, why: `barrier_sets = ${sets}` };
}

/** Crew availability from the Sheet: crew_based_here must be "yes", and notes can restrict a crew
 *  ("the Mallow crew can work in Mallow only tonight") or stand it down ("Clonmel crew unavailable"). */
export function crewStatus(rows) {
  const byTown = Object.fromEntries(rows.map((r) => [r.town, r]));
  const out = {};
  for (const [crew, area] of Object.entries(CREWS)) {
    const row = byTown[crew];
    let towns = [...area], capacity = TOWNS_PER_CREW;
    const notes = [];
    if (!row || String(row.crew_based_here).trim().toLowerCase() !== "yes") {
      towns = []; capacity = 0; notes.push(`crew_based_here is "${row?.crew_based_here ?? "missing"}" for ${crew}`);
    }
    for (const r of rows) {
      const text = r.notes || "";
      if (!new RegExp(`\\b${crew}\\s+crew\\b`, "i").test(text)) continue;
      const only = new RegExp(`\\b${crew}\\s+crew\\b[^.;]*?\\bwork\\s+in\\s+([A-Za-z-]+(?:\\s+and\\s+[A-Za-z-]+)?)\\s+only\\b`, "i").exec(text)
        || new RegExp(`\\b${crew}\\s+crew\\b[^.;]*?\\bonly\\s+(?:work\\s+)?in\\s+([A-Za-z-]+(?:\\s+and\\s+[A-Za-z-]+)?)`, "i").exec(text);
      if (only) {
        const allowed = only[1].split(/\s+and\s+/i).map((s) => s.trim().toLowerCase());
        towns = towns.filter((t) => allowed.includes(t.toLowerCase()));
        notes.push(`${r.town} notes: "${text}"`);
      } else if (/\b(unavailable|not available|stood down|off duty|out of service)\b/i.test(text)) {
        towns = []; capacity = 0; notes.push(`${r.town} notes: "${text}"`);
      }
    }
    out[crew] = { towns, capacity: Math.min(capacity, towns.length ? capacity : 0), notes };
  }
  return out;
}

/** Can every town in `set` get a crew? Small exact search (3 crews, at most 8 towns). */
function assign(set, crews) {
  const left = Object.fromEntries(Object.entries(crews).map(([c, v]) => [c, v.capacity]));
  const result = {};
  const go = (i) => {
    if (i === set.length) return true;
    for (const [c, v] of Object.entries(crews)) {
      if (left[c] > 0 && v.towns.includes(set[i])) {
        left[c]--; result[set[i]] = c;
        if (go(i + 1)) return true;
        left[c]++; delete result[set[i]];
      }
    }
    return false;
  };
  return go(0) ? result : null;
}

/** Rule 6: rank the Barriers towns that can take barriers by % above P99 (tie: higher peak), then
 *  give crews in rank order, keeping a town only if everyone already chosen can still be served. */
export function allocateCrews(candidates, crews) {
  const ranked = [...candidates].sort((a, b) => (b.pctAboveP99 - a.pctAboveP99) || (b.peak - a.peak));
  let chosen = [];
  for (const c of ranked) {
    if (assign([...chosen, c.town], crews)) chosen.push(c.town);
  }
  const assignment = assign(chosen, crews) || {};
  return { ranked: ranked.map((c, i) => ({ rank: i + 1, town: c.town, pctAboveP99: round1(c.pctAboveP99), peak: c.peak })),
           assignment };
}

/**
 * Build tonight's plan.
 * @param {object} p
 *  rows      Sheet rows (objects keyed by the 11 column names)
 *  history   { town: { p95_m3s, p99_m3s, river, county, cell_lat, cell_lon } }
 *  forecasts { town: { dates:[], values:[], url, fetchedAt } } or { town: { error } }
 *  warnings  parsed Met Éireann warning_IRELAND.json (array), or null if the source is down
 *  now       Date
 */
export function buildPlan({ rows, history, forecasts, warnings, now = new Date(), sources = {} }) {
  const towns = [];
  const problems = [];
  for (const row of rows) {
    const h = history[row.town];
    if (!h) { problems.push(`No stored history for "${row.town}" (check the town name in the Sheet).`); continue; }
    const fc = forecasts[row.town] || { error: "no forecast requested" };
    const t = { town: row.town, county: row.county, river: row.river, p95: h.p95_m3s, p99: h.p99_m3s,
                cell: [h.cell_lat, h.cell_lon], rehearsal: [], reasons: [], flags: [] };

    // Rule 2: forecast peak = highest daily flow for today and the next two days
    const ov = num(row.flow_override_m3s);
    if (Number.isNaN(ov)) problems.push(`${row.town}: flow_override_m3s "${row.flow_override_m3s}" is not a number, so it was ignored.`);
    if (fc.values && fc.values.length) {
      const days = fc.values.slice(0, 3).map((v, i) => ({ date: fc.dates[i], value: v })).filter((d) => d.value !== null);
      const top = days.reduce((a, b) => (b.value > a.value ? b : a), days[0]);
      t.forecast = { days, peak: top?.value ?? null, peakDate: top?.date ?? null, url: fc.url, fetchedAt: fc.fetchedAt };
    } else {
      t.forecast = { error: fc.error || "no data", url: fc.url, fetchedAt: fc.fetchedAt };
    }
    if (ov !== null && !Number.isNaN(ov)) {
      t.peak = ov; t.peakSource = "rehearsal: flow_override_m3s in the team Sheet";
      t.rehearsal.push(`flow_override_m3s = ${ov} m³/s replaces the forecast peak${t.forecast.peak != null ? ` (live forecast peak was ${t.forecast.peak} m³/s)` : ""}`);
    } else if (t.forecast.peak != null) {
      t.peak = t.forecast.peak; t.peakSource = `Open-Meteo GloFAS forecast, peak on ${t.forecast.peakDate}`;
    } else {
      t.peak = null; t.peakSource = `forecast unavailable (${t.forecast.error})`;
    }

    // Rule 3: levels against the town's own P95 / P99
    if (t.peak == null) {
      t.flowLevel = null;
      t.reasons.push("No forecast peak: the flow level cannot be set from data. The Duty Officer must check the river directly.");
      t.flags.push("Forecast source unavailable");
    } else {
      t.flowLevel = t.peak >= t.p99 ? "Barriers" : t.peak >= t.p95 ? "Standby" : "Normal";
      t.reasons.push(`Peak ${t.peak} m³/s vs P95 ${t.p95} / P99 ${t.p99} → ${t.flowLevel}`);
    }
    t.pctAboveP99 = t.peak == null ? null : round1(((t.peak - t.p99) / t.p99) * 100);

    // Rule 4 + Rule 5 (warning half)
    if (warnings) {
      const w = warningForTown(row, warnings, now);
      t.warning = w;
      if (w.rehearsal) t.rehearsal.push(`warning_override = "${row.warning_override}" treated as a live ${w.raising.find((x) => x.source === "rehearsal").level} warning`);
      for (const m of w.mismatches) problems.push(`${row.town}: warning ${m.capId} county codes and headline disagree about ${m.county}; check met.ie.`);
      if (w.raises) t.reasons.push(`${w.raising.map((x) => `${x.level} rain warning (${x.source})`).join(", ")} for ${w.counties.join("/")} → up one level`);
      else if (w.mentioned.length) t.reasons.push(`Yellow rain warning for ${w.counties.join("/")} noted; changes nothing (Rule 4)`);
    } else {
      t.warning = null;
      t.flags.push("Warnings source unavailable");
      t.reasons.push("Met Éireann warnings could not be read; no warning has been applied.");
    }
    const base = t.flowLevel ?? null;
    t.level = base == null ? null : (t.warning ? applyWarning(base, t.warning) : base);
    if (base == null && t.warning?.raises) t.reasons.push("A warning would raise this town, but there is no flow level to raise.");

    t.barrier = barrierAvailable(row);
    t.resources = { staff_on_call: num(row.staff_on_call), pumps: num(row.pumps), sandbags: num(row.sandbags), barrier_sets: num(row.barrier_sets) };
    t.notes = row.notes || "";
    towns.push(t);
  }

  // Rules 6 + 7
  const crews = crewStatus(rows);
  const atBarriers = towns.filter((t) => t.level === "Barriers");
  for (const t of atBarriers) if (!t.barrier.ok) {
    t.action = "Standby measures (cannot have barriers)";
    t.flags.push(`Flag to Area Manager: at Barriers but no barrier set (${t.barrier.why}) (Rule 7)`);
  }
  const candidates = atBarriers.filter((t) => t.barrier.ok);
  const alloc = allocateCrews(candidates, crews);
  for (const t of candidates) {
    const crew = alloc.assignment[t.town];
    if (crew) { t.action = "Barriers erected by a crew before 18:00"; t.crew = crew; }
    else {
      t.action = "Standby measures (no crew place)";
      t.flags.push("Flag to Area Manager: at Barriers but no crew place available (Rule 6)");
    }
  }
  for (const t of towns) {
    if (t.level === "Standby") t.action = `Standby: ${t.resources.staff_on_call} staff on call confirmed, ${t.resources.pumps} pumps checked, ${t.resources.sandbags} sandbags staged`;
    if (t.level === "Normal") t.action = "No action";
    if (t.level == null) t.action = "Unknown: check sources";
    if (t.action?.startsWith("Standby") && t.level !== "Standby")
      t.action += `: staff on call ${t.resources.staff_on_call}, pumps ${t.resources.pumps}, sandbags ${t.resources.sandbags}`;
  }

  const crewPlan = Object.fromEntries(Object.entries(crews).map(([c, v]) => [c, {
    goes_to: Object.entries(alloc.assignment).filter(([, k]) => k === c).map(([town]) => town),
    may_work_in: v.towns, capacity: v.capacity, constraints: v.notes }]));

  return {
    builtAt: now.toISOString(),
    rehearsal: towns.some((t) => t.rehearsal.length),
    towns, crews: crewPlan, ranking: alloc.ranked, problems, sources,
  };
}

export { LEVELS };
