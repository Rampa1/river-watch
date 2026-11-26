// Run: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRainWarning, inForceWithin48h, townCounties, warningForTown, applyWarning, matchCounties }
  from "../src/warnings.js";

// Met Éireann's own published example (opendata2.met.ie .../JSONExample.zip, warning_ALL.json)
const EXAMPLE = JSON.parse(readFileSync(new URL("./fixtures/met_eireann_example_warning_ALL.json", import.meta.url), "utf8").replace(/^﻿/, ""));
const EX_NOW = new Date("2026-09-12T09:00:00+01:00");

// Starter Sheet rows (The_Build_Statement_1.pdf)
const ROW = {
  Clonmel: { town: "Clonmel", county: "Tipperary", notes: "Normal service" },
  Fermoy: { town: "Fermoy", county: "Cork", notes: "Normal service" },
  Mallow: { town: "Mallow", county: "Cork", notes: "Mallow crew van in repair: the Mallow crew can work in Mallow only tonight" },
  Ennis: { town: "Ennis", county: "Clare", notes: "Normal service" },
  Athlone: { town: "Athlone", county: "Westmeath", notes: "Town spans Westmeath and Roscommon" },
  Carrick: { town: "Carrick-on-Shannon", county: "Leitrim", notes: "Town spans Leitrim and Roscommon" },
};
const NOW = new Date("2026-11-26T15:00:00Z");
const h = (n) => new Date(NOW.getTime() + n * 3600e3).toISOString();
const warn = (o) => ({ capId: "t", status: "Warning", type: "Rain", level: "orange", onset: h(2), expiry: h(20), ...o });

test("rain detection uses the headline as well as type (Met Éireann example)", () => {
  const lowTemp = EXAMPLE.find((w) => w.type === "low-temperature");
  assert.equal(isRainWarning(lowTemp), true, "'Rain and Low Temperature' must count as rain");
  assert.equal(isRainWarning(EXAMPLE.find((w) => w.type === "Wind")), false);
  assert.equal(isRainWarning(EXAMPLE.find((w) => w.type === "Gale")), false);
  assert.equal(isRainWarning({ type: "Thunderstorm", headline: "Status Orange - Thunderstorm warning for Cork" }), false);
  assert.equal(isRainWarning({ type: "Terrain", headline: "Status Orange - Wind warning for Kerry" }), false, "word boundary");
});

test("example file: yellow rain for Cork is mentioned once, raises nothing; advisories ignored", () => {
  const r = warningForTown(ROW.Fermoy, EXAMPLE, EX_NOW);
  assert.equal(r.raises, false);
  assert.equal(r.mentioned.length, 1, "combined rain+low-temp warning listed once");
  assert.equal(r.level, "yellow");
  assert.equal(r.mismatches.length, 0);
  assert.equal(warningForTown(ROW.Clonmel, EXAMPLE, EX_NOW).mentioned.length, 0, "Advisory for Ireland must not count");
});

test("orange and red rain raise the town; yellow does not", () => {
  const cork = { regions: ["EI04"], headline: "Status Orange - Rain warning for Cork" };
  assert.equal(warningForTown(ROW.Fermoy, [warn(cork)], NOW).raises, true);
  assert.equal(warningForTown(ROW.Fermoy, [warn({ ...cork, level: "red" })], NOW).level, "red");
  assert.equal(warningForTown(ROW.Fermoy, [warn({ ...cork, level: "yellow" })], NOW).raises, false);
  assert.equal(warningForTown(ROW.Clonmel, [warn(cork)], NOW).raises, false, "other county");
  assert.equal(warningForTown(ROW.Fermoy, [warn({ ...cork, type: "Wind", headline: "Status Orange - Wind warning for Cork" })], NOW).raises, false);
});

test("48-hour window and expiry", () => {
  const cork = { regions: ["EI04"], headline: "Status Orange - Rain warning for Cork" };
  assert.equal(inForceWithin48h(warn({ ...cork, onset: h(47), expiry: h(60) }), NOW), true);
  assert.equal(inForceWithin48h(warn({ ...cork, onset: h(49), expiry: h(60) }), NOW), false);
  assert.equal(inForceWithin48h(warn({ ...cork, onset: h(-10), expiry: h(1) }), NOW), true, "already in force");
  assert.equal(inForceWithin48h(warn({ ...cork, onset: h(-10), expiry: h(-1) }), NOW), false, "expired is removed");
});

test("two-county towns count the county named in notes (Roscommon)", () => {
  assert.deepEqual(townCounties(ROW.Athlone), ["Westmeath", "Roscommon"]);
  assert.deepEqual(townCounties(ROW.Carrick), ["Leitrim", "Roscommon"]);
  assert.deepEqual(townCounties(ROW.Mallow), ["Cork"], "'Mallow crew' must not add a county");
  const ros = warn({ regions: ["EI24"], headline: "Status Orange - Rain warning for Roscommon" });
  assert.equal(warningForTown(ROW.Athlone, [ros], NOW).raises, true);
  assert.equal(warningForTown(ROW.Carrick, [ros], NOW).raises, true);
  assert.equal(warningForTown(ROW.Ennis, [ros], NOW).raises, false);
});

test("province headline 'Connacht' covers Leitrim and Roscommon without mismatch", () => {
  const w = warn({ regions: ["EI06", "EI10", "EI14", "EI20", "EI24", "EI25"], headline: "Status Orange - Rain warning for Connacht, Donegal" });
  const r = warningForTown(ROW.Carrick, [w], NOW);
  assert.equal(r.raises, true);
  assert.deepEqual(r.mismatches, []);
});

test("code/headline disagreement is reported, not hidden", () => {
  const w = warn({ regions: ["EI04"], headline: "Status Orange - Rain warning for Kerry" });
  const m = matchCounties(w, ["Cork"]);
  assert.deepEqual(m.mismatches, [{ county: "Cork", inCodes: true, inHeadline: false }]);
});

test("Rule 5 warning_override is a rehearsal value", () => {
  for (const v of ["orange", "Orange", " RED ", "red warning"]) {
    const r = warningForTown({ ...ROW.Clonmel, warning_override: v }, [], NOW);
    assert.equal(r.raises, true, v); assert.equal(r.rehearsal, true, v);
    assert.equal(r.raising[0].source, "rehearsal");
  }
  for (const v of ["", "yellow", null, undefined, "none"]) {
    assert.equal(warningForTown({ ...ROW.Clonmel, warning_override: v }, [], NOW).raises, false, String(v));
  }
});

test("a warning raises one level at most", () => {
  const yes = { raises: true }, no = { raises: false };
  assert.equal(applyWarning("Normal", yes), "Standby");
  assert.equal(applyWarning("Standby", yes), "Barriers");
  assert.equal(applyWarning("Barriers", yes), "Barriers");
  assert.equal(applyWarning("Normal", no), "Normal");
});
