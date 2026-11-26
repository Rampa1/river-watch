# River Watch: data source verification (checked 2026-11-26)

## 0. Sources, licences and attribution lines (Task 1)
These were checked on the publishers' own pages on 2026-11-26. Show the attribution lines on the River Watch page, next to the data.

| source | publisher / address | licence | attribution line to show | fields used | conditions that affect the build |
|---|---|---|---|---|---|
| River flow forecast + 10-yr history | Open-Meteo Flood API, `https://flood-api.open-meteo.com/v1/flood` (data from GloFAS, Copernicus Emergency Management Service) | CC BY 4.0 (https://open-meteo.com/en/licence) | "Weather data by Open-Meteo.com" (link to https://open-meteo.com/) + "Flood forecasts from Global Flood Awareness System GloFAS" | `daily.time`, `daily.river_discharge` (m³/s), `latitude`, `longitude` | Free API is **non-commercial**: 10,000 calls/day, 600/min, no uptime guarantee. Must link to Open-Meteo wherever the data is shown and say if changes were made. The GloFAS licence PDF linked from Open-Meteo's licence page returned **404** on 2026-11-26, so the exact Copernicus wording is unverified. |
| Town coordinates | Open-Meteo Geocoding API, `https://geocoding-api.open-meteo.com/v1/search` (data: GeoNames) | CC BY 4.0 | "Location data based on GeoNames" (link to https://www.geonames.org) | `latitude`, `longitude`, `admin1/admin2`, `name` | Coordinates were found once and stored; no live calls. |
| Weather warnings | Met Éireann, `https://www.met.ie/Open_Data/json/warning_IRELAND.json` (data.gov.ie "Weather Warnings") | **Met Éireann Custom Open Data Licence**: CC BY 4.0 plus conditions | "Copyright Met Éireann. Source: met.ie. This data is published under a Creative Commons Attribution 4.0 International (CC BY 4.0). Met Éireann does not accept any liability whatsoever for any error or omission in the data." | `type`, `level`, `status`, `onset`, `expiry`, `headline`, `regions`, `capId` | **Do not alter** the warning fields (show the headline as published), **keep up to date** and **remove expired warnings**. Met Éireann must be acknowledged as the source. |
| Gauged flow (validation + Rule 8) | Office of Public Works, Hydro-Data, `https://waterlevel.ie/hydro-data/` (`.../internet/stations/0/<station>/Q/Discharge_complete.zip`) | CC BY 4.0 (https://waterlevel.ie/page/api/) | "Contains Irish Public Sector Information licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (source http://waterlevel.ie - provided by the Office of Public Works.)" | `Timestamp`, `Value` (m³/s), `Quality Code` | Data is "provisional, unchecked" (disclaimer: https://waterlevel.ie/disclaimer/), and derived works must refer to waterlevel.ie and that disclaimer. Only stations 00001–41000 may be republished (all of ours qualify). OPW asks, as a courtesy, for an email to waterlevel@opw.ie before an app uses the data. Do not poll more than once per 15 min. The Hydro-Data archive pages themselves were not checked for separate terms. |

Suggested citation for Open-Meteo: Zippenfenig, P. (2023). Open-Meteo.com Weather API. Zenodo. https://doi.org/10.5281/ZENODO.7970649

**Changes made (CC BY requires saying so):**
- GloFAS: the tool takes the nearest main-river cell, not the town's own coordinates, and computes P95/P99 from 2016–2025.
- OPW: 15-min flow is averaged to daily means, and days with fewer than 48 readings are dropped.
- Met Éireann: warnings are filtered (rain only, within 48 hours, by county) but never edited.

## 0b. Rain-only warning filter (`src/warnings.js`, tests in `test/warnings.test.js`, run with `npm test`)
- **Counts as rain:** `type` OR `headline` contains "rain"/"rainfall". The type alone is not enough: Met Éireann's own example "Rain and Low Temperature warning" has `type: "low-temperature"`. Wind, gale, thunderstorm, fog and advisories do not count.
- **Raises a level:** level is orange or red, and `status` is "Warning". Yellow is listed as "mentioned" and changes nothing.
- **In force in the next 48 h:** `onset` ≤ now + 48 h and `expiry` > now. Expired warnings are dropped (a rule and a licence condition).
- **Counties:** the town's `county` plus any county named in `notes` (Athlone and Carrick add Roscommon). Matching uses the EI codes, cross-checked against the headline's counties, with provinces and "Ireland" expanded. Disagreements are returned as `mismatches` for the page to show.
- **Rule 5:** a `warning_override` containing "orange" or "red" (any case) acts as a live warning tagged `source: "rehearsal"`.
- **One level at most:** Normal → Standby → Barriers.
- A combined warning published once per type is listed once.
- Live run on 2026-11-26 at 21:00 UTC: 0 warnings in force, so no town is raised.

## 1. Town locations (Open-Meteo Geocoding API)
`https://geocoding-api.open-meteo.com/v1/search?name=<town>&countryCode=IE`

| town | lat | lon | county (geocoder) | note |
|---|---|---|---|---|
| Clonmel | 52.35500 | -7.70389 | Tipperary | 2nd hit "Clonmellon" (Westmeath): always filter by county |
| Fermoy | 52.13583 | -8.27583 | Cork | |
| Mallow | 52.13333 | -8.63333 | Cork | |
| Bandon | 51.74694 | -8.74250 | Cork | |
| Enniscorthy | 52.50083 | -6.55778 | Wexford | |
| Ennis | 52.84361 | -8.98639 | Clare | search also returns Enniskean, Enniskerry, Ennistimon: take exact name + county |
| Athlone | 53.42278 | -7.93722 | Westmeath | also Roscommon (notes column) |
| Carrick-on-Shannon | 53.94694 | -8.09000 | Leitrim | geocoder spells it "Carrick on Shannon" (no hyphens); also Roscommon |

## 1b. AI brain (Task 1): Anthropic Claude Sonnet 5.5
**Provider / model / tier:** Anthropic Claude API (first-party), model `claude-sonnet-5-5`, standard (global) routing, not batch or fast mode.
The org starts on the Start usage tier (monthly spend cap $500, 4,000 requests/min for Sonnet 5.5).

**Price** (https://platform.claude.com/docs/en/about-claude/pricing, checked 2026-11-26):
$2 per million input tokens, $10 per million output tokens; cache reads $0.10 per million. `inference_geo: "us"` would cost 1.1x, so keep the default global routing.

**Price per answer (estimate, to be replaced by measured `response.usage` in Task 2/4):**

| part of one answer | tokens (est.) | cost |
|---|---|---|
| Input: Flood Plan rules + system prompt (~1,500), history summary (~800), Sheet rows (~600), tonight's computed levels, forecasts and warnings (~1,000), question (~100) | ~4,000 | $0.008 |
| Output: the answer (~700) + adaptive thinking (billed as output, ~800 at `low`/`medium` effort) | ~1,500 | $0.015 |
| **Per answer** | | **≈ $0.02 (range $0.01–0.05)** |

- **Monthly:** about 5 questions a day from the Duty Officer and 10 a month from the Area Manager is ~160 answers, so ≈ **$3–4 a month**.
- **Cap per answer:** `max_tokens: 4000` means one answer can never cost more than about **$0.05**.
- **Caching:** caching the fixed prefix (rules + history summary) could cut the input cost further. It only helps if the prefix is above the model's minimum cacheable length and questions arrive within 5 minutes of each other, so it is not counted in the estimate.

**Why this level of model fits:**
- The model does not decide anything. Deterministic code calculates percentiles, levels, warnings and crew places. The model explains the result, reads free-text Sheet notes (e.g. "Mallow crew can work in Mallow only tonight"), answers what-if questions by calling the same code with a rehearsal value, and declines out-of-scope questions (Rule 9).
- That needs dependable instruction-following and tool use, which a mid-tier model handles well. Claude Opus 5.5 costs twice as much for reasoning the code already does.
- The smallest model (Haiku 5.5) is cheaper, but a wrong reading of a note or a missed rehearsal-value flag matters more here than a cent per answer.
- Run Sonnet 5.5 at `effort: "low"` or `"medium"`, set explicitly, since the default is `high`.

**Where the key lives:** we use the settings-box route (decision 2026-11-26).
- River Watch is a static GitHub Pages site with no server. The person using it pastes their own Anthropic key into a **settings box** with three actions: paste, save, forget key.
- The key is kept **only in that person's browser** (`localStorage`). It is sent only to `https://api.anthropic.com`, in the `x-api-key` header, with Anthropic's `anthropic-dangerous-direct-browser-access: true` header for direct browser calls.
- The key is **never** in the repository, the page source, the Google Sheet or any file. "Forget key" deletes it from the browser.
- Checked 2026-11-26: Open-Meteo, Met Éireann, the Google Sheet CSV export and the Anthropic API all allow cross-site browser requests, so no server is needed. OPW live levels do not, so that optional extra is left out.

**What stops a leak costing more than was funded** (https://platform.claude.com/docs/en/api/rate-limits, checked 2026-11-26):
1. **A dedicated workspace** for River Watch, with the key created inside it and a **workspace spend limit** of e.g. $10/month. Expected use is $3–4. A copied key can only spend that workspace's allowance. When a limit is reached, requests fail with HTTP 400 "You have reached your specified API usage limits" until the next month.
2. **Organisation spend limit** (Settings → Spend limits) as a second ceiling. Without it, the Start tier's own cap ($500/month) is the backstop.
3. **Per-request ceiling:** `max_tokens: 4000` is set in the page code, so one answer costs at most ≈ $0.05.
4. **Exposure is limited to the browser** where the key was pasted. Do not paste it on a shared computer, or press "Forget key" afterwards.
5. If the key leaks: delete it in the Console and create a new one. Nothing in the site needs to change, because the site never contained it.

## 2. River flow forecast + history (Open-Meteo Flood API, GloFAS, 0.05° grid)
Forecast: `https://flood-api.open-meteo.com/v1/flood?latitude=..&longitude=..&daily=river_discharge&forecast_days=7&cell_selection=nearest`
History: same URL with `&start_date=2016-01-01&end_date=2025-12-31`. This returned 3,653 days with 0 nulls for every town.

**Pitfall found:** querying the town's own coordinates puts 4 of 8 towns in a non-river cell
(Fermoy 0.3, Bandon 0.3, Athlone 0.8, Ennis 3.0 m³/s mean). I scanned the 5x5 neighbouring cells
and chose the main-channel cell nearest the town. These are the cells to use:

| town | river cell (lat, lon) | km from town | mean m³/s | Q95 | Q99 | median annual max | 10-yr max (date) |
|---|---|---|---|---|---|---|---|
| Clonmel | 52.375, -7.675 | 3.0 | 33.1 | 77.7 | 127.2 | 165.6 | 291.4 (2024-11-24, Storm Bert) |
| Fermoy | 52.125, -8.225 | 3.7 | 32.4 | 77.2 | 127.8 | 169.4 | 316.0 (2024-11-24) |
| Mallow | 52.125, -8.625 | 1.1 | 18.5 | 44.6 | 70.6 | 106.6 | 207.4 (2024-11-24) |
| Bandon | 51.775, -8.725 | 3.3 | 8.2 | 22.0 | 38.0 | 52.1 | 99.7 (2023-10-19, Storm Babet) |
| Enniscorthy | 52.475, -6.625 | 5.4 | 17.1 | 38.7 | 69.6 | 87.6 | 144.2 (2025-11-15) |
| Ennis | 52.825, -9.025 | 3.3 | 13.1 | 31.1 | 45.2 | 50.4 | 65.2 (2024-11-24) |
| Athlone | 53.425, -7.975 | 2.5 | 76.2 | 142.2 | 186.5 | 142.2 | 254.3 (2016-01-06) |
| Carrick-on-Shannon | 53.925, -8.075 | 2.6 | 27.4 | 62.2 | 88.7 | 108.5 | 133.6 (2020-02-10) |

Open questions on cells:
- Fermoy: an alternative channel cell is 52.175, -8.275 (4.3 km, 2024 mean 36.8). Confirm which cell is the Blackwater main stem.
- Enniscorthy: the flow jumps from 16.9 to 21.3 between 52.525 and 52.475 (a tributary, likely the Urrin). The chosen cell is downstream of the town.
- Clonmel: town centre sits on a cell boundary; the upstream cell 52.375, -7.725 has a mean of about 28.
- GloFAS is a modelled product, not a gauge. Next step: compare these magnitudes with OPW / EPA gauged flows.
- The forecast product and the historical reanalysis may differ in bias: check before mixing them in thresholds.

## 2b. Validation: GloFAS vs OPW gauged flow, 2016–2025
Source: OPW Hydro-Data, `https://waterlevel.ie/hydro-data/data/internet/stations/0/<station>/Q/Discharge_complete.zip`
(15-min flow; I averaged it to daily means and kept days with 48 or more readings). Scripts and results are in `verification/`.

| town | OPW gauge | gauge mean | GloFAS mean | bias | r (daily) | KGE | gauge Q99 | GloFAS Q99 | flood days caught* | false highs** |
|---|---|---|---|---|---|---|---|---|---|---|
| Clonmel | 16011 Clonmel (0.7 km) | 50.3 | 33.3 | 0.66 | 0.85 | 0.41 | 195.7 | 127.2 | 89% | 8% |
| Fermoy | 18107 Fermoy Br D/S (0.4 km) | 46.8 | 32.4 | 0.69 | 0.79 | 0.36 | 253.6 | 124.6 | 79% | 16% |
| Mallow | 18055 Mallow Railway Br (1.6 km) | 35.0 | 18.5 | 0.53 | 0.74 | 0.16 | 197.0 | 70.6 | 79% | 11% |
| Bandon | 20002 Curranure (4.6 km D/S) | 17.5 | 8.2 | 0.47 | 0.76 | 0.17 | 90.2 | 38.0 | 87% | 11% |
| Enniscorthy | 12001 Scarawalsh (5.3 km U/S) | 23.8 | 17.0 | 0.71 | 0.81 | 0.49 | 100.2 | 69.6 | 87% | 5% |
| Ennis | 27002 Ballycorey (3.0 km U/S) | 12.0 | 13.0 | 1.08 | 0.83 | 0.78 | 41.6 | 45.2 | 89% | 32% |
| Athlone | 26027 Athlone (0.3 km) | 106.0 | 76.1 | 0.72 | 0.82 | 0.38 | 302.3 | 186.5 | 100% | 0% |
| Carrick-on-Shannon | 26085 Jamestown (4.7 km D/S), **960 days only** | 70.2 | 45.0 | 0.64 | 0.58 | 0.35 | 115.9 | 104.0 | 82% | 64% |

\* Share of gauge days above the gauge's Q99 where GloFAS was above its own Q95 within ±1 day.
\*\* Share of GloFAS days above its own Q99 where the gauge was below its Q90.

Findings:
1. **GloFAS rises and falls at the right time** (r 0.74–0.85; it caught 79–100% of gauged flood days). **It underestimates size**: mean flow by 30–50%, peaks by 35–60%. Ennis is the exception and is unbiased.
2. **Never compare GloFAS m³/s with gauge m³/s or published flood levels.** Set thresholds on each cell's own percentiles, or convert the forecast to gauge-equivalent m³/s by quantile mapping against the OPW record.
3. `flow_override_m3s`: if the Duty Officer types a reading from waterlevel.ie (gauge terms), it must be compared with gauge-scale thresholds, not GloFAS-scale ones. Decide the scale and label it.
4. **Cell choices confirmed:** Enniscorthy 52.475,-6.625 (KGE 0.49 vs 0.31), Clonmel 52.375,-7.675 (0.41 vs 0.29), Fermoy 52.125,-8.225 (0.36 vs 0.32), Ennis 52.825,-9.025 (0.78). Mallow, Bandon and Athlone alternatives are effectively tied, so keep the nearest cell.
5. **Weakest points:** Carrick-on-Shannon (short gauge record, r 0.58, 64% false highs; lake-regulated Shannon) and Ennis (32% false highs). Put both in the risk register.
6. Bonus: OPW also publishes **live 15-min flow** (`.../Q/Discharge_48h.csv`). It can show "observed now" next to the forecast, as a sanity check.
7. OPW quality codes vary (31, 36, 96, 101, 254, -1, ...). Confirm their meanings with OPW before filtering. `-1` dominates the Jamestown record.

## 2c. Stored history summary (Rule 2) and winter events (Rule 8)
Built by `verification/build_history_summary.py`, which writes `data/history_summary.json|csv`, `data/winter_events.csv` and `data/glofas_daily_2016_2025.json`.
Period: 2016-01-01 to 2025-12-31, 3,653 days, no missing values. Percentiles use linear interpolation.
Event runs are cut at the edges of the 1 Oct–31 Mar window.

| town | cell | mean | P95 | P99 | GloFAS events | first 4 / last 4 | OPW gauge events | gauge first 4 / last 4 |
|---|---|---|---|---|---|---|---|---|
| Clonmel | 52.375,-7.675 | 33.1 | 77.7 | 127.7 | 11 | 2 / 6 | 12 | 7 / 3 |
| Fermoy | 52.125,-8.225 | 32.4 | 77.2 | 127.8 | 10 | 1 / 6 | **22** | 9 / 9 |
| Mallow | 52.125,-8.625 | 18.5 | 44.6 | 71.3 | 13 | 2 / 8 | 21 | 8 / 9 |
| Bandon | 51.775,-8.725 | 8.2 | 22.0 | 38.7 | 11 | 1 / 8 | 19 | 4 / 9 |
| Enniscorthy | 52.475,-6.625 | 17.1 | 38.7 | 69.8 | 7 | 2 / 4 | 13 | 5 / 5 |
| Ennis | 52.825,-9.025 | 13.1 | 31.1 | 45.4 | **17** | 7 / 9 | 3 | 2 / 1 |
| Athlone | 53.425,-7.975 | 76.2 | 142.4 | 186.7 | 1 | 1 / 0 | 1 | 1 / 0 |
| Carrick-on-Shannon | 53.925,-8.075 | 27.4 | 62.2 | 88.8 | 12 | 4 / 3 | n/a (gauge record starts 2019) | n/a |

**The GloFAS and gauge rankings disagree.**
- GloFAS catches a very different share of each winter's peak flow (Mallow 0.19–0.75 of the gauged peak). It caught the most in 2023/24 and 2024/25, so its "recent increase" is at least partly an artefact of the model.
- GloFAS overstates Ennis peaks (1.0–2.2x the gauge) and makes the Fergus flashy, which splits floods into many short runs.

**Decision (2026-11-26): Rule 8 uses the OPW gauge record; tonight's levels (Rules 2–3) still use GloFAS P95/P99.**
Built by `verification/build_study_ranking.py`, which writes `data/study_ranking.json` and `data/study_events.csv`.
GloFAS event counts are kept for comparison only, in `verification/winter_events_glofas*.{csv,json}`. Carrick-on-Shannon uses GloFAS and is marked low confidence.

| town | source | P99 | events | first 4 / last 4 | days ≥ P99 | longest event (days) | winter days missing |
|---|---|---|---|---|---|---|---|
| **Fermoy** | OPW 18107 | 254.1 | **22** | 9 / 9 | 26 | 2 | 8 |
| Mallow | OPW 18055 | 197.5 | 21 | 8 / 9 | 23 | 2 | 0 |
| Bandon | OPW 20002 | 90.9 | 19 | 4 / 9 | 28 | 5 | 16 |
| Enniscorthy | OPW 12001 | 100.5 | 13 | 5 / 5 | 23 | 5 | 30 |
| Clonmel | OPW 16011 | 195.7 | 12 | 7 / 3 | 25 | 5 | 20 |
| Ennis | OPW 27002 | 41.7 | 3 | 2 / 1 | 28 | 13 | 6 |
| Athlone | OPW 26027 | 303.6 | 1 | 1 / 0 | 19 | 19 | 4 |
| Carrick-on-Shannon | GloFAS (low confidence) | 88.8 | 12 | 4 / 3 | 30 | 6 | 0 |

**Answer:**
- **Fermoy** has the most events (22), with Mallow on the same river at 21.
- Its last four winters did **not** have more events than its first four (9 vs 9).
- **What the count cannot tell:** how long events lasted. Ennis has 28 days at or above P99 but only 3 events, and Athlone has one 19-day flood.

**Sensitivity:** the margin between Fermoy and Mallow is a single event. Enniscorthy (30 missing winter days) and Bandon (16) could be undercounted.

## 3. Weather warnings (Met Éireann)
- Live JSON (official, data.gov.ie "Weather Warnings"): `https://www.met.ie/Open_Data/json/warning_IRELAND.json`. Returns `[]` when no land warnings are active (as on 2026-11-26).
- RSS + CAP XML: `https://www.met.ie/warningsxml/rss.xml` links to `https://cap.met.ie/<id>.xml`. Includes marine warnings (EI8xx).
- Format docs and examples: `https://www.met.ie/Open_Data/Warnings/Met_Eireann_Warning_description_June2020.pdf`,
  `https://opendata2.met.ie/opendata2/warningsAnnouncement/JSONExample.zip`, `.../CAPExample.zip`
- Meteoalarm feed (`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-ireland`) **keeps expired warnings**. Always filter on `expires`.
- Severity: Yellow = Moderate, Orange = Severe, Red = Extreme (stated in the RSS description). JSON has `level`.

### How the source names counties: `regions` / CAP `EMMA_ID` codes, not names
Codes EI01–EI31 are land counties; EI8xx are sea areas. **There is no published code→county table found.**
I worked the mapping out by matching official example warnings (code list + county names in the headline):

| county | code | status |
|---|---|---|
| Clare | EI03 | **proven** ({Clare,Galway,Mayo}={03,10,20}, with Galway=10, Mayo=20) |
| Galway | EI10 | **proven** |
| Mayo | EI20 | **proven** |
| Roscommon | EI24 | **proven** (Connacht+Donegal set minus Donegal/Leitrim/Mayo/Sligo set) |
| Donegal | EI06 | **proven** (absent from the 2026-11-25 fog warning that covered Leitrim and Sligo) |
| Cork | EI04 | consistent, not proven (is one of {04,11,27} = Cork/Kerry/Waterford) |
| Leitrim | EI14 | consistent, not proven (Leitrim/Sligo = {14,25}) |
| Tipperary | EI26 | consistent, not proven |
| Westmeath | EI29 | consistent, not proven |
| Wexford | EI30 | consistent, not proven |

All evidence fits the alphabetical FIPS 10-4 pattern (01 Carlow, 02 Cavan, 03 Clare, 04 Cork, 06 Donegal, 07 Dublin,
10 Galway, 11 Kerry, 12 Kildare, 13 Kilkenny, 14 Leitrim, 15 Laois, 16 Limerick, 18 Longford, 19 Louth, 20 Mayo,
21 Meath, 22 Monaghan, 23 Offaly, 24 Roscommon, 25 Sligo, 26 Tipperary, 27 Waterford, 29 Westmeath, 30 Wexford, 31 Wicklow).
**Mitigation:** cross-check codes against the county names in each warning's `headline`. Also treat "Connacht" as including
Leitrim and Roscommon (relevant to Athlone and Carrick-on-Shannon).

Counties River Watch needs: Tipperary (Clonmel), Cork (Fermoy, Mallow, Bandon), Wexford (Enniscorthy), Clare (Ennis),
Westmeath + Roscommon (Athlone), Leitrim + Roscommon (Carrick-on-Shannon).
