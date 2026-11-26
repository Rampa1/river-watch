// River Watch: weather warnings (Flood Plan Rule 4 and the warning half of Rule 5).
// Source: Met Éireann, https://www.met.ie/Open_Data/json/warning_IRELAND.json
// Licence: Met Éireann Custom Open Data Licence (CC BY 4.0 plus conditions). Warning text must not be
// altered, and expired warnings must be removed. This module only selects warnings. It shows each
// warning's own headline unchanged and drops expired ones.

export const WARNINGS_URL = "https://www.met.ie/Open_Data/json/warning_IRELAND.json";

// Met Éireann region codes (EMMA_ID / "regions"). Met Éireann publishes no code table.
// "proven" = derived from Met Éireann's own example warnings (see data_sources_verified.md, section 3).
// "consistent" = matches every warning seen so far and the FIPS 10-4 pattern, but not proven.
// Every match is also checked against the county names in the warning's headline (see matchCounties).
export const COUNTY_CODES = {
  EI01: ["Carlow", "consistent"], EI02: ["Cavan", "consistent"], EI03: ["Clare", "proven"],
  EI04: ["Cork", "consistent"], EI06: ["Donegal", "proven"], EI07: ["Dublin", "consistent"],
  EI10: ["Galway", "proven"], EI11: ["Kerry", "consistent"], EI12: ["Kildare", "consistent"],
  EI13: ["Kilkenny", "consistent"], EI14: ["Leitrim", "consistent"], EI15: ["Laois", "consistent"],
  EI16: ["Limerick", "consistent"], EI18: ["Longford", "consistent"], EI19: ["Louth", "consistent"],
  EI20: ["Mayo", "proven"], EI21: ["Meath", "consistent"], EI22: ["Monaghan", "consistent"],
  EI23: ["Offaly", "consistent"], EI24: ["Roscommon", "proven"], EI25: ["Sligo", "consistent"],
  EI26: ["Tipperary", "consistent"], EI27: ["Waterford", "consistent"], EI29: ["Westmeath", "consistent"],
  EI30: ["Wexford", "consistent"], EI31: ["Wicklow", "consistent"],
};
export const COUNTIES = Object.values(COUNTY_CODES).map(([c]) => c);

// Headlines can name provinces or the whole country instead of counties (e.g. "Connacht, Donegal").
const PROVINCES = {
  connacht: ["Galway", "Leitrim", "Mayo", "Roscommon", "Sligo"],
  munster: ["Clare", "Cork", "Kerry", "Limerick", "Tipperary", "Waterford"],
  leinster: ["Carlow", "Dublin", "Kildare", "Kilkenny", "Laois", "Longford", "Louth", "Meath",
             "Offaly", "Westmeath", "Wexford", "Wicklow"],
  ulster: ["Cavan", "Donegal", "Monaghan"],
};

const RAISING_LEVELS = ["orange", "red"];   // Rule 4: yellow is mentioned but changes nothing
const LEVEL_RANK = { yellow: 1, orange: 2, red: 3 };
const HOUR = 3600 * 1000;

/** Rule 4 says a "rain warning". The `type` field alone is not enough: Met Éireann's own example
 *  "Status Yellow - Rain and Low Temperature warning" has type "low-temperature". So a warning counts
 *  as rain if its type OR its headline names rain. Thunderstorm, wind and other types without rain in
 *  the type or headline do not count. */
export function isRainWarning(w) {
  const rain = /\brain(fall)?\b/i;
  return rain.test(w.type || "") || rain.test(w.headline || "");
}

/** A warning is "in force at any time in the next 48 hours" if it starts before now+48h and has not
 *  expired. Expired warnings are dropped (a licence condition as well as a rule). */
export function inForceWithin48h(w, now = new Date()) {
  const onset = new Date(w.onset), expiry = new Date(w.expiry);
  if (isNaN(onset) || isNaN(expiry)) return false;
  return expiry > now && onset <= new Date(now.getTime() + 48 * HOUR);
}

/** Counties a town counts warnings for: its `county` column plus any county named in `notes`
 *  (Flood Plan Rule 4: "the notes name the second county"). */
export function townCounties(row) {
  const out = new Set([normCounty(row.county)].filter(Boolean));
  for (const c of COUNTIES) if (new RegExp(`\\b${c}\\b`, "i").test(row.notes || "")) out.add(c);
  return [...out];
}

function normCounty(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  return COUNTIES.find((c) => c.toLowerCase() === t) || null;
}

/** Counties a headline names, expanding provinces and "Ireland". Returns null if the headline names
 *  none (for example, a marine warning), in which case the cross-check is skipped. */
export function headlineCounties(headline = "") {
  const found = new Set();
  if (/\b(ireland|all counties|nationwide)\b/i.test(headline)) COUNTIES.forEach((c) => found.add(c));
  for (const [p, cs] of Object.entries(PROVINCES)) if (new RegExp(`\\b${p}\\b`, "i").test(headline)) cs.forEach((c) => found.add(c));
  for (const c of COUNTIES) if (new RegExp(`\\b${c}\\b`, "i").test(headline)) found.add(c);
  return found.size ? found : null;
}

/** Which of `counties` a warning covers, by region code. Each match is cross-checked against the
 *  headline, and disagreements are returned as `mismatches` so the page can show them and not guess. */
export function matchCounties(w, counties) {
  const byCode = new Set((w.regions || []).map((r) => COUNTY_CODES[r]?.[0]).filter(Boolean));
  const named = headlineCounties(w.headline);
  const matched = [], mismatches = [];
  for (const c of counties) {
    const inCodes = byCode.has(c), inHeadline = named ? named.has(c) : null;
    if (inCodes || inHeadline) matched.push(c);
    if (named && inCodes !== inHeadline) mismatches.push({ county: c, inCodes, inHeadline });
  }
  return { matched, mismatches };
}

/**
 * Rule 4 and Rule 5 for one town.
 * @param row       Sheet row: { town, county, notes, warning_override }
 * @param warnings  the parsed warning_IRELAND.json array
 * @param now       Date, used for tests and for the "as of" time shown on the page
 * @returns {{ raises: boolean, level: string|null, rehearsal: boolean, counties: string[],
 *            raising: object[], mentioned: object[], mismatches: object[] }}
 *   raising   = orange/red rain warnings in force within 48h covering the town (each raises one level)
 *   mentioned = yellow rain warnings that match (shown, change nothing)
 *   Each item keeps the warning's own unaltered headline, level, onset, expiry and capId, for provenance.
 */
export function warningForTown(row, warnings, now = new Date()) {
  const counties = townCounties(row);
  const raising = [], mentioned = [], mismatches = [], seen = new Set();
  for (const w of warnings || []) {
    // A combined warning ("Rain and Low Temperature") is published once per type: list it once.
    const key = `${w.headline}|${w.onset}|${w.expiry}|${w.level}`;
    if (seen.has(key)) continue;
    if ((w.status || "Warning") !== "Warning") continue;          // skips Advisory items (e.g. blight)
    if (!isRainWarning(w) || !inForceWithin48h(w, now)) continue;
    const m = matchCounties(w, counties);
    mismatches.push(...m.mismatches.map((x) => ({ ...x, capId: w.capId, headline: w.headline })));
    if (!m.matched.length) continue;
    seen.add(key);
    const item = { source: "live", level: String(w.level).toLowerCase(), headline: w.headline,
                   onset: w.onset, expiry: w.expiry, counties: m.matched, capId: w.capId };
    (RAISING_LEVELS.includes(item.level) ? raising : mentioned).push(item);
  }
  // Rule 5: "If warning_override says orange or red, treat it as a live warning of that level."
  const ov = String(row.warning_override ?? "").trim().toLowerCase();
  const ovLevel = RAISING_LEVELS.find((l) => new RegExp(`\\b${l}\\b`).test(ov));
  if (ovLevel) raising.push({ source: "rehearsal", level: ovLevel,
                              headline: `Rehearsal value: warning_override = "${row.warning_override}"`,
                              counties });
  const top = raising.concat(mentioned).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
  return { raises: raising.length > 0, level: top?.level ?? null, rehearsal: Boolean(ovLevel),
           counties, raising, mentioned, mismatches };
}

/** Rule 4 applied to a flow level: raises the town by one level at most. */
export function applyWarning(flowLevel, warningResult) {
  if (!warningResult.raises) return flowLevel;
  return { Normal: "Standby", Standby: "Barriers", Barriers: "Barriers" }[flowLevel];
}

export async function fetchWarnings(fetchImpl = fetch) {
  const r = await fetchImpl(WARNINGS_URL, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Met Éireann warnings: HTTP ${r.status}`);
  return { fetchedAt: new Date().toISOString(), url: WARNINGS_URL, warnings: await r.json() };
}
