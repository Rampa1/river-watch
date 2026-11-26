// River Watch: live sources, read at the moment of each question. Nothing here is cached between questions.
import { sheetCsvUrl, sheetViewUrl, SHEET_COLUMNS, FLOOD_API, TIMEZONE } from "./config.js";
import { fetchWarnings, WARNINGS_URL } from "./warnings.js";

/** RFC 4180 CSV parser (handles quotes, commas and newlines inside quotes). */
export function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Rows keyed by the 11 required column names. Throws if the header is not as the brief requires. */
export function sheetRowsFromCsv(text) {
  const [header, ...body] = parseCsv(text);
  const h = (header || []).map((x) => x.trim());
  const missing = SHEET_COLUMNS.filter((c) => !h.includes(c));
  if (missing.length) throw new Error(`Team Sheet is missing column(s): ${missing.join(", ")}`);
  return body.map((r) => Object.fromEntries(SHEET_COLUMNS.map((c) => [c, (r[h.indexOf(c)] ?? "").trim()])))
             .filter((r) => r.town);
}

export async function fetchSheet() {
  const url = sheetCsvUrl();
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Team Sheet: HTTP ${r.status}`);
  const text = await r.text();
  if (/^\s*</.test(text)) throw new Error("Team Sheet returned a web page, not CSV: check it is shared as 'Anyone with the link: Viewer'.");
  return { rows: sheetRowsFromCsv(text), fetchedAt: new Date().toISOString(), url: sheetViewUrl };
}

/** One Open-Meteo request for all river cells: today plus the next two days, in Irish local dates. */
export async function fetchForecasts(history) {
  const towns = Object.keys(history);
  const lat = towns.map((t) => history[t].cell_lat).join(",");
  const lon = towns.map((t) => history[t].cell_lon).join(",");
  const url = `${FLOOD_API}?latitude=${lat}&longitude=${lon}&daily=river_discharge&forecast_days=3&timezone=${encodeURIComponent(TIMEZONE)}&cell_selection=nearest`;
  const fetchedAt = new Date().toISOString();
  const out = {};
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let d = await r.json();
    if (!Array.isArray(d)) d = [d];
    towns.forEach((t, i) => {
      const one = d[i];
      // per-town link: one location, so a person can open it in the browser and check the number
      const single = `${FLOOD_API}?latitude=${history[t].cell_lat}&longitude=${history[t].cell_lon}&daily=river_discharge&forecast_days=3&timezone=${encodeURIComponent(TIMEZONE)}&cell_selection=nearest`;
      out[t] = one?.daily
        ? { dates: one.daily.time, values: one.daily.river_discharge, url: single, fetchedAt }
        : { error: "no daily data returned", url: single, fetchedAt };
    });
  } catch (e) {
    for (const t of towns) out[t] = { error: `Open-Meteo unavailable (${e.message})`, url, fetchedAt };
  }
  return { forecasts: out, url, fetchedAt };
}

let stored = null;
/** Files computed once offline (Task 1): thresholds and the Rule 8 ranking. */
export async function loadStored() {
  if (stored) return stored;
  const [h, s] = await Promise.all([
    fetch("data/history_summary.json").then((r) => r.json()),
    fetch("data/study_ranking.json").then((r) => r.json()),
  ]);
  const history = Object.fromEntries(h.towns.map((t) => [t.town, t]));
  stored = { history, historyMeta: { source: h.source, period: h.towns[0]?.period, method: h.percentile_method, built: h.built }, study: s };
  return stored;
}

/** Everything live, read now. Each source fails on its own, so one outage never blanks the page. */
export async function readAllLive() {
  const { history, historyMeta, study } = await loadStored();
  const [sheetR, fcR, warnR] = await Promise.allSettled([fetchSheet(), fetchForecasts(history), fetchWarnings()]);
  if (sheetR.status === "rejected") throw new Error(`The team Sheet could not be read: ${sheetR.reason.message}. No plan is made without it.`);
  return {
    history, historyMeta, study,
    rows: sheetR.value.rows,
    forecasts: fcR.status === "fulfilled" ? fcR.value.forecasts : {},
    warnings: warnR.status === "fulfilled" ? warnR.value.warnings : null,
    sources: {
      sheet: { name: "Team Google Sheet", url: sheetR.value.url, fetchedAt: sheetR.value.fetchedAt },
      forecast: fcR.status === "fulfilled"
        ? { name: "Open-Meteo Flood API (GloFAS), daily river_discharge", url: fcR.value.url, fetchedAt: fcR.value.fetchedAt }
        : { name: "Open-Meteo Flood API", error: String(fcR.reason?.message || fcR.reason) },
      warnings: warnR.status === "fulfilled"
        ? { name: "Met Éireann warnings (warning_IRELAND.json)", url: WARNINGS_URL, fetchedAt: warnR.value.fetchedAt, count: warnR.value.warnings.length }
        : { name: "Met Éireann warnings", url: WARNINGS_URL, error: String(warnR.reason?.message || warnR.reason) },
      thresholds: { name: `Stored P95/P99, ${historyMeta.source}, ${historyMeta.period}`, url: "data/history_summary.json", builtAt: historyMeta.built },
      study: { name: "Stored Rule 8 ranking (OPW gauged flow)", url: "data/study_ranking.json", builtAt: study.built },
    },
  };
}
