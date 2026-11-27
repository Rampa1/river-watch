# Task 1: Find and check the data

All sources below were found and checked on **26 Nov 2026**. The full working notes and scripts are in `data_sources_verified.md` and `verification/` in the repository (https://github.com/Rampa1/river-watch).

## 1. Sources, licences and the fields used

| Source | Publisher and address | Licence and attribution line | Fields used |
|---|---|---|---|
| River flow forecast (live) and 10-year history | Open-Meteo Flood API, data from GloFAS (Copernicus Emergency Management Service). `https://flood-api.open-meteo.com/v1/flood` | CC BY 4.0. "Weather data by Open-Meteo.com" (linked) and "Flood forecasts from Global Flood Awareness System GloFAS". | `daily.time`, `daily.river_discharge` (m³/s), `latitude`, `longitude` |
| Weather warnings (live) | Met Éireann. `https://www.met.ie/Open_Data/json/warning_IRELAND.json` (data.gov.ie "Weather Warnings") | Met Éireann Custom Open Data Licence (CC BY 4.0 plus conditions). "Copyright Met Éireann. Source: met.ie. This data is published under a Creative Commons Attribution 4.0 International (CC BY 4.0). Met Éireann does not accept any liability whatsoever for any error or omission in the data." | `type`, `level`, `status`, `onset`, `expiry`, `headline`, `regions` |
| Team Sheet (live) | Our Google Sheet, read as a CSV export at each question | Our own data | All 11 columns |
| Gauged river flow (check and Rule 8) | Office of Public Works, Hydro-Data. `https://waterlevel.ie/hydro-data/` | CC BY 4.0. "Contains Irish Public Sector Information licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (source http://waterlevel.ie - provided by the Office of Public Works.)" Data is provisional (waterlevel.ie disclaimer). | `Timestamp`, `Value` (m³/s), `Quality Code` |
| Town locations | Open-Meteo Geocoding API, data from GeoNames. `https://geocoding-api.open-meteo.com/v1/search` | CC BY 4.0. "Location data based on GeoNames". | `latitude`, `longitude`, `name`, `admin2` (county) |

**Conditions that shaped the build:**
- Open-Meteo's free API is for non-commercial use (10,000 calls a day).
- Met Éireann warning text must not be altered, and expired warnings must be removed.
- OPW data is provisional, and derived work must refer to waterlevel.ie and its disclaimer.

All attribution lines are shown in the page footer.

**Changes made (CC BY asks us to say so):**
- GloFAS: the tool uses the nearest main-river grid cell, not the town's own point, and computes P95/P99 from 2016–2025.
- OPW: 15-minute flow is averaged to daily means, and days with fewer than 48 readings are dropped.
- Met Éireann: warnings are filtered (rain only, within 48 hours, by county) but never edited.

## 2. Coordinates, and checking the flow belongs to each town's river

**How the coordinates were found:**
1. Each town was looked up with the Open-Meteo Geocoding API, filtered to Ireland. The result was kept only if both the name and the county matched. "Clonmel" also returns Clonmellon (Westmeath), and "Ennis" returns Enniskean, Enniskerry and Ennistimon.
2. The forecast is not taken at the town point. Doing that put **4 of the 8 towns on grid cells that are not the river**. Fermoy, Bandon and Athlone came back under 1 m³/s, and Ennis at 3 m³/s, which is impossible for the Blackwater, Bandon or Shannon rivers.
3. So I scanned the 5 × 5 neighbouring GloFAS cells (0.05° grid) and chose the main-channel cell nearest each town.

**How I made sure the flow belongs to the named river:** each river cell's 2016–2025 daily flow was compared with the nearest **OPW flow gauge on the same river**.

| Town | River | Town coordinates (geocoder) | River cell used (km from town) | OPW gauge on the same river | Gauge mean / GloFAS mean (m³/s) | Daily correlation r | Gauged flood days the model also flagged |
|---|---|---|---|---|---|---|---|
| Clonmel | Suir | 52.35500, −7.70389 | 52.375, −7.675 (3.0 km) | 16011 Clonmel | 50.3 / 33.3 | 0.85 | 89% |
| Fermoy | Blackwater | 52.13583, −8.27583 | 52.125, −8.225 (3.7 km) | 18107 Fermoy Br D/S | 46.8 / 32.4 | 0.79 | 79% |
| Mallow | Blackwater | 52.13333, −8.63333 | 52.125, −8.625 (1.1 km) | 18055 Mallow Railway Br | 35.0 / 18.5 | 0.74 | 79% |
| Bandon | Bandon | 51.74694, −8.74250 | 51.775, −8.725 (3.3 km) | 20002 Curranure | 17.5 / 8.2 | 0.76 | 87% |
| Enniscorthy | Slaney | 52.50083, −6.55778 | 52.475, −6.625 (5.4 km) | 12001 Scarawalsh | 23.8 / 17.0 | 0.81 | 87% |
| Ennis | Fergus | 52.84361, −8.98639 | 52.825, −9.025 (3.3 km) | 27002 Ballycorey | 12.0 / 13.0 | 0.83 | 89% |
| Athlone | Shannon | 53.42278, −7.93722 | 53.425, −7.975 (2.5 km) | 26027 Athlone | 106.0 / 76.1 | 0.82 | 100% |
| Carrick-on-Shannon | Shannon | 53.94694, −8.09000 | 53.925, −8.075 (2.6 km) | 26085 Jamestown (2019 on only) | 70.2 / 45.0 | 0.58 | 82% |

**What the check shows:**
- **Every cell rises and falls with its own river's gauge** (r 0.74–0.85; Carrick 0.58 on a short record).
- **In 7 of the 8 records, the largest day matches a known flood:** Storm Bert (24 Nov 2024) on the Suir, Blackwater and Fergus; Storm Babet (19 Oct 2023) on the Bandon; and the winter floods of 2015–16 and Feb 2020 on the Shannon. Enniscorthy's largest day (15 Nov 2025) was not matched to a named event.
- **GloFAS reads lower than the gauges** (mean flow 30–50% low; Ennis is the exception and is unbiased). That is why each town's thresholds come from **its own GloFAS history**, never from gauge levels.
- **Carrick-on-Shannon is the weakest match:** a lake-regulated river and a short gauge record.

## 3. History: period and the stored summary

**Period:** 1 Jan 2016 to 31 Dec 2025: ten full years, 3,653 days per town, with no missing values (Open-Meteo Flood API, GloFAS).
- **Computed once and stored** in `data/history_summary.json`. The tool reads this file and never sends years of daily values to the model.
- Percentiles use linear interpolation.

| Town | River | River cell | Days | Mean m³/s | P95 m³/s | P99 m³/s | 10-year maximum (date) |
|---|---|---|---|---|---|---|---|
| Clonmel | Suir | 52.375, −7.675 | 3,653 | 33.1 | 77.7 | 127.7 | 291.4 (24 Nov 2024) |
| Fermoy | Blackwater | 52.125, −8.225 | 3,653 | 32.4 | 77.2 | 127.8 | 316.0 (24 Nov 2024) |
| Mallow | Blackwater | 52.125, −8.625 | 3,653 | 18.5 | 44.6 | 71.3 | 207.4 (24 Nov 2024) |
| Bandon | Bandon | 51.775, −8.725 | 3,653 | 8.2 | 22.0 | 38.7 | 99.7 (19 Oct 2023) |
| Enniscorthy | Slaney | 52.475, −6.625 | 3,653 | 17.1 | 38.7 | 69.8 | 144.2 (15 Nov 2025) |
| Ennis | Fergus | 52.825, −9.025 | 3,653 | 13.1 | 31.1 | 45.4 | 65.2 (24 Nov 2024) |
| Athlone | Shannon | 53.425, −7.975 | 3,653 | 76.2 | 142.4 | 186.7 | 254.3 (6 Jan 2016) |
| Carrick-on-Shannon | Shannon | 53.925, −8.075 | 3,653 | 27.4 | 62.2 | 88.8 | 133.6 (10 Feb 2020) |

**Rule 8 (study ranking):** this uses measured **OPW gauge** flow, stored in `data/study_ranking.json`. The GloFAS event counts failed the gauge check: for example, they gave Ennis 17 events where the gauge shows 3.

| Town | Source | P99 m³/s | High-flow events, winters 2016/17–2024/25 | First 4 / last 4 winters |
|---|---|---|---|---|
| Fermoy | OPW 18107 | 254.1 | **22** | 9 / 9 |
| Mallow | OPW 18055 | 197.5 | 21 | 8 / 9 |
| Bandon | OPW 20002 | 90.9 | 19 | 4 / 9 |
| Enniscorthy | OPW 12001 | 100.5 | 13 | 5 / 5 |
| Clonmel | OPW 16011 | 195.7 | 12 | 7 / 3 |
| Ennis | OPW 27002 | 41.7 | 3 | 2 / 1 |
| Athlone | OPW 26027 | 303.6 | 1 | 1 / 0 |
| Carrick-on-Shannon | GloFAS (low confidence) | 88.8 | 12 | 4 / 3 |

## 4. Warnings: how the source names counties, and how the tool matches them

- **Counties are named by codes, not names.** Met Éireann's `regions` field (the CAP `EMMA_ID`) uses codes EI01–EI31 for land counties and EI8xx for sea areas. **No published code-to-county table was found.**
- **Working out the codes:** I matched the code lists in Met Éireann's own example warnings against the county names in their headlines. Five codes are proven this way. The rest fit every warning seen and the alphabetical FIPS 10-4 pattern.

| County needed | Town(s) | Code | Status |
|---|---|---|---|
| Tipperary | Clonmel | EI26 | consistent with all evidence |
| Cork | Fermoy, Mallow, Bandon | EI04 | consistent with all evidence |
| Wexford | Enniscorthy | EI30 | consistent with all evidence |
| Clare | Ennis | EI03 | **proven** |
| Westmeath | Athlone | EI29 | consistent with all evidence |
| Roscommon | Athlone, Carrick-on-Shannon (from the notes) | EI24 | **proven** |
| Leitrim | Carrick-on-Shannon | EI14 | consistent with all evidence |

**How the tool matches warnings to the plan (Rule 4):**
- **Rain only.** A warning counts as rain if its `type` *or* `headline` says rain. Met Éireann's own "Rain and Low Temperature" example has `type: "low-temperature"`, so checking `type` alone would miss it.
- **Orange or red raises a town one level.** Yellow is shown but changes nothing, and advisories are ignored.
- **In force at any time in the next 48 hours:** onset ≤ now + 48 h, and expiry later than now. Expired warnings are removed.
- **Both counties for two-county towns.** The town's county plus any county named in its notes, so Athlone and Carrick-on-Shannon also count Roscommon.
- **Each code match is cross-checked against the counties named in the headline**, with "Connacht" and "Ireland" expanded. Any disagreement is shown, not guessed.
- **Rehearsal values.** `warning_override` "orange" or "red" (any case) acts as a live warning and is labelled as a rehearsal value.

## 5. The AI brain

- **Provider, model and tier:** Anthropic Claude API, **Claude Sonnet 5.5** (`claude-sonnet-5-5`), standard global routing, on the Start usage tier. Settings also lets a user choose OpenAI, Google Gemini or Groq, but Sonnet 5.5 is the default and the documented choice.
- **Price per answer:** **≈ $0.02**, from Anthropic's pricing page checked **26 Nov 2026** ($2 per million input tokens, $10 per million output). That assumed about 4,000 input and 1,500 output tokens. Task 3 measured **$0.023–0.027**.
- **Why this level of brain fits:**
  - Code computes every level, crew place and flag. The brain only explains them, reads free-text notes such as the Mallow crew restriction, re-runs the plan for "what if" questions, and declines out-of-scope ones.
  - That needs reliable instruction-following, which a mid-tier model does well. A top model (Opus 5.5) costs twice as much for reasoning the code already does.
  - The smallest model (Haiku 5.5) is cheaper, but more likely to misread a note.
- **Where the key lives:**
  - Each user pastes their own key into the page's Settings box (paste, save, forget). It is kept only in that browser's `localStorage` and sent only to the chosen provider (default `api.anthropic.com`).
  - It is **never** in the repository, the page source, the Google Sheet or any file, and the page never displays it.
- **What limit stops a leak costing more than was funded:**
  - The key is created in a **dedicated River Watch workspace** with its own **monthly spend limit** (e.g. $10), and there is an **organisation spend limit** as a second ceiling. Once a limit is reached, Anthropic stops the requests until the next month.
  - `max_tokens: 4000` caps any single answer at about $0.05.
  - A leaked key is revoked in the Console and replaced. Nothing on the site changes, because the site never contained it.

## 6. Architecture: one picture and five lines

![River Watch architecture](architecture.png)

1. **Who asks:** the Duty Officer (tonight's plan by 16:00, "why", "what if") and the Area Manager (study ranking), on a static GitHub Pages site. The site shows every number with its source and date, labels rehearsal values, and states "AI can make mistakes; a person makes the final decision."
2. **The page and the Sheet:** the page code runs in the user's browser, with no server. At each question it reads the Google team Sheet live (resources, notes, overrides), so editing a cell changes the next answer.
3. **Each source:** the page also reads the Open-Meteo GloFAS forecast and Met Éireann warnings live. It reads stored files computed once: P95/P99 from GloFAS 2016–2025, and the Rule 8 counts from OPW gauges. It then applies the Flood Plan in code.
4. **The brain:** the page sends the computed plan and the question, never raw history, to Claude Sonnet 5.5 (≈ $0.02–0.03 per answer). Claude explains, and the Duty Officer decides and records the reason.
5. **The key:** the user's own key is kept in Settings in their browser only, never in the repository or page. It comes from a dedicated workspace whose spend limit caps what a copied key can cost.
