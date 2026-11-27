// Run: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, crewStatus, barrierAvailable } from "../src/plan.js";
import { sheetRowsFromCsv, parseCsv } from "../src/sources.js";

const H = JSON.parse(readFileSync(new URL("../data/history_summary.json", import.meta.url), "utf8"));
const history = Object.fromEntries(H.towns.map((t) => [t.town, t]));
const STARTER = readFileSync(new URL("../sheet/river_watch_team_sheet.csv", import.meta.url), "utf8");
const rows = () => sheetRowsFromCsv(STARTER);
const NOW = new Date("2026-11-26T14:00:00Z");
const DATES = ["2026-11-26", "2026-11-27", "2026-11-28"];
// forecasts as a fraction of each town's P99, default 0.3 (Normal)
const fc = (over = {}) => Object.fromEntries(Object.keys(history).map((t) => {
  const v = over[t] ?? [0.3, 0.3, 0.3];
  return [t, { dates: DATES, values: v.map((f) => Math.round(f * history[t].p99_m3s * 10) / 10), url: "u", fetchedAt: NOW.toISOString() }];
}));
const plan = (o = {}) => buildPlan({ rows: o.rows ?? rows(), history, forecasts: o.forecasts ?? fc(), warnings: o.warnings ?? [], now: NOW });
const town = (p, name) => p.towns.find((t) => t.town === name);
const set = (rs, name, patch) => rs.map((r) => (r.town === name ? { ...r, ...patch } : r));

test("starter CSV: 11 columns, 8 towns, empty overrides", () => {
  const r = rows();
  assert.equal(r.length, 8);
  assert.equal(parseCsv(STARTER)[0].length, 11);
  assert.ok(r.every((x) => x.flow_override_m3s === "" && x.warning_override === ""));
});

test("Rule 2/3: peak is max of today+2 days; levels against own P95/P99", () => {
  const p = plan({ forecasts: fc({ Fermoy: [0.2, 0.99, 0.5], Ennis: [0.1, 1.2, 0.2] }) });
  const f = town(p, "Fermoy");
  assert.equal(f.forecast.peakDate, "2026-11-27");
  assert.equal(f.level, f.peak >= f.p95 ? "Standby" : "Normal");
  assert.equal(town(p, "Ennis").level, "Barriers");
  assert.equal(town(p, "Clonmel").level, "Normal");
});

test("brief's what-if: Clonmel at 150 m³/s is Barriers, ~17.5% above P99 127.7", () => {
  const p = plan({ rows: set(rows(), "Clonmel", { flow_override_m3s: "150" }) });
  const c = town(p, "Clonmel");
  assert.equal(c.level, "Barriers"); assert.equal(c.pctAboveP99, 17.5);
  assert.equal(c.crew, "Clonmel"); assert.ok(p.rehearsal); assert.match(c.rehearsal[0], /flow_override_m3s = 150/);
});

test("Rule 5: warning_override orange raises one level and is labelled rehearsal", () => {
  const p = plan({ rows: set(rows(), "Athlone", { warning_override: "Orange" }) });
  const a = town(p, "Athlone");
  assert.equal(a.flowLevel, "Normal"); assert.equal(a.level, "Standby");
  assert.equal(a.action, "Standby: 6 staff on call confirmed, 5 pumps checked, 2500 sandbags staged");
  assert.ok(a.rehearsal.some((r) => /warning_override/.test(r)));
});

test("Rule 4: a live orange rain warning for Roscommon raises Athlone and Carrick, not Ennis", () => {
  const w = [{ capId: "x", status: "Warning", type: "Rain", level: "orange", onset: "2026-11-26T18:00:00Z", expiry: "2026-11-27T06:00:00Z",
               headline: "Status Orange - Rain warning for Roscommon", regions: ["EI24"] }];
  const p = plan({ warnings: w, forecasts: fc({ Athlone: [0.8, 0.8, 0.8] }) });
  assert.equal(town(p, "Carrick-on-Shannon").level, "Standby");
  assert.equal(town(p, "Ennis").level, "Normal");
  // Athlone: a forecast at 0.8 of P99 is above P95 (142.4/186.7 = 0.76), so Standby, +1 = Barriers
  assert.equal(town(p, "Athlone").flowLevel, "Standby"); assert.equal(town(p, "Athlone").level, "Barriers");
});

test("Rule 7: Bandon (0 sets, on loan) at Barriers gets Standby measures + flag, no crew place", () => {
  assert.equal(barrierAvailable(rows().find((r) => r.town === "Bandon")).ok, false);
  const p = plan({ forecasts: fc({ Bandon: [1.5, 1.5, 1.5] }) });
  const b = town(p, "Bandon");
  assert.equal(b.level, "Barriers"); assert.equal(b.crew, undefined);
  assert.match(b.action, /Standby measures \(cannot have barriers\)/);
  assert.ok(b.flags.some((f) => /Area Manager/.test(f)));
  assert.ok(!p.ranking.some((r) => r.town === "Bandon"), "takes no crew place");
});

test("Rule 7 reads notes even when barrier_sets > 0", () => {
  assert.equal(barrierAvailable({ barrier_sets: "1", notes: "Barrier set damaged in storm" }).ok, false);
  assert.equal(barrierAvailable({ barrier_sets: "1", notes: "Mallow crew van in repair" }).ok, true);
});

test("Mallow note: Mallow crew works in Mallow only, so Fermoy can only get the Clonmel crew", () => {
  const cs = crewStatus(rows());
  assert.deepEqual(cs.Mallow.towns, ["Mallow"]);
  assert.deepEqual(cs.Clonmel.towns, ["Clonmel", "Fermoy", "Enniscorthy"]);
  // Clonmel, Fermoy and Enniscorthy all at Barriers: the Clonmel crew has 2 places -> lowest-ranked is flagged
  const p = plan({ forecasts: fc({ Clonmel: [1.3, 1.3, 1.3], Fermoy: [1.1, 1.1, 1.1], Enniscorthy: [1.2, 1.2, 1.2] }) });
  assert.equal(town(p, "Clonmel").crew, "Clonmel");
  assert.equal(town(p, "Enniscorthy").crew, "Clonmel");
  assert.equal(town(p, "Fermoy").crew, undefined);
  assert.match(town(p, "Fermoy").action, /no crew place/);
  assert.deepEqual(p.ranking.map((r) => r.town), ["Clonmel", "Enniscorthy", "Fermoy"]);
});

test("without the Mallow restriction, Fermoy is covered by the Mallow crew", () => {
  const r = set(rows(), "Mallow", { notes: "Normal service" });
  const p = plan({ rows: r, forecasts: fc({ Clonmel: [1.3, 1.3, 1.3], Fermoy: [1.1, 1.1, 1.1], Enniscorthy: [1.2, 1.2, 1.2] }) });
  assert.equal(town(p, "Fermoy").crew, "Mallow");
  assert.ok(["Clonmel", "Enniscorthy", "Fermoy"].every((t) => town(p, t).crew));
});

test("Rule 6 tie-break: equal % above P99 -> higher peak first", () => {
  const p = plan({ forecasts: fc({ Athlone: [1.1, 1.1, 1.1], "Carrick-on-Shannon": [1.1, 1.1, 1.1], Ennis: [1.1, 1.1, 1.1] }) });
  assert.equal(p.ranking[0].town, "Athlone");                    // largest P99 -> highest peak at the same %
  assert.equal(town(p, "Ennis").crew, undefined);                  // smallest peak loses the 3rd place
  assert.ok(town(p, "Ennis").flags.some((f) => /no crew place/.test(f)));
});

test("crew_based_here = no removes that crew", () => {
  const p = plan({ rows: set(rows(), "Athlone", { crew_based_here: "no" }), forecasts: fc({ Ennis: [1.2, 1.2, 1.2] }) });
  assert.equal(town(p, "Ennis").crew, undefined);
  assert.equal(p.crews.Athlone.capacity, 0);
});

test("a source going down gives Unknown and a flag, never a guess", () => {
  const f = fc(); f.Clonmel = { error: "Open-Meteo unavailable (HTTP 503)", url: "u" };
  const p = buildPlan({ rows: rows(), history, forecasts: f, warnings: null, now: NOW });
  const c = town(p, "Clonmel");
  assert.equal(c.level, null); assert.equal(c.action, "Unknown: check sources");
  assert.ok(c.flags.includes("Forecast source unavailable"));
  assert.ok(town(p, "Fermoy").flags.includes("Warnings source unavailable"));
});

test("a non-numeric flow override is ignored and reported", () => {
  const p = plan({ rows: set(rows(), "Ennis", { flow_override_m3s: "high" }) });
  assert.ok(p.problems.some((x) => /Ennis.*not a number/.test(x)));
  assert.equal(town(p, "Ennis").rehearsal.length, 0);
});
