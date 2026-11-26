# Task 3: Test log (River Watch)

Site: https://rampa1.github.io/river-watch/ · Team Sheet: https://docs.google.com/spreadsheets/d/17rEoTPrySBwY3lQngmYzxDQPWpAAM0UuSqYL8bN5xMo/edit

**How the expected answers were worked out (before asking):** from The Flood Plan, the Sheet and the live sources, using an independent Python script, `verification/expected_plan.py`. It does not use the site's code. It recomputes P95/P99 with Python's `statistics.quantiles` and reads the Sheet, Open-Meteo and Met Éireann itself. Expected values below were produced on **26 Nov 2026 at 21:52**.

> Re-run `python -I verification/expected_plan.py` immediately before your test session. Forecasts change daily, so replace the expected numbers below with that run's output. Keep the script output as evidence.

## Test log

| # | Question asked (and set-up) | Expected answer (worked out before asking) | Tool's answer | Match? |
|---|---|---|---|---|
| 1a | **Rehearsal, BEFORE.** Sheet at starter values. Ask: "What is tonight's plan?" | All 8 towns **Normal** (every peak below its own P95; Met Éireann feed has 0 warnings). No crews needed. Mallow crew noted as Mallow-only. No rehearsal values. | *(paste / summarise)* | ✅ / ❌ |
| 1b | **Rehearsal, AFTER.** Set **Fermoy `flow_override_m3s` = 140** and **Athlone `warning_override` = orange**. Ask: "What is tonight's plan?" | **Fermoy → Barriers**: 140 ≥ P99 127.8 (+9.5%). The **Clonmel crew** goes to Fermoy, because the Mallow crew is Mallow-only tonight (notes). **Athlone → Standby**: flow Normal (45.03 < P95 142.4), raised one level by the orange warning. Staff on call 6, 5 pumps, 2,500 sandbags. Both are **labelled rehearsal values**. All other towns Normal. | | |
| 2 | **Forecast check.** Ask: "What is Clonmel's forecast for each day and where does it come from?" Then open the town's **forecast source ↗** link in the browser. | Clonmel (Suir, cell 52.375, −7.675): 26 Nov **29.13**, 27 Nov **29.13**, 28 Nov **29.83** m³/s; peak 29.83 on 28 Nov. Source: Open-Meteo Flood API (GloFAS). The browser JSON `daily.river_discharge` shows the same three numbers. | | |
| 3 | **P99 recomputed a second way.** Ask: "What is Clonmel's 99th percentile and how was it computed?" Recompute in Excel from `verification/clonmel_p99_check.csv`. | **127.7 m³/s** (GloFAS daily flow, 2016-01-01 to 2025-12-31, 3,653 days). By hand from the sorted column: position 1 + 0.99 × (3653 − 1) = 3616.48. Value #3616 = 127.23 and #3617 = 128.12, so P99 = 127.23 + 0.48 × 0.89 = **127.66 ≈ 127.7**. Excel `=PERCENTILE.INC(B2:B3654,0.99)` gives the same. | | |
| 4 | **Area Manager.** Ask: "Which town should be first in line for a flood-defence study?" | **Fermoy**: 22 high-flow events (runs of days ≥ its P99), winters 2016/17–2024/25, OPW gauge 18107. Mallow on the same river has 21, so the Blackwater is the priority. Last four winters **not** more than first four (**9 vs 9**). Limit: the count ignores how long events lasted (Athlone had one 19-day flood), damage and existing defences. | | |
| 5 | **Out of scope.** Ask: "Will my house in Mallow flood tonight?" | Declines to predict for an individual home (Flood Plan Rule 9) and refers the person to the **council's area office**. It may mention Mallow's town-level status, but makes no house-level claim. | | |

**After test 1b, put the Sheet back to its starter values** (clear both override cells). The brief requires this before submission.

## Evidence to capture

| Test | Screenshots / files |
|---|---|
| 1a | (i) Sheet showing empty override cells; (ii) page plan table + the AI answer |
| 1b | (i) Sheet with Fermoy 140 and Athlone orange visible; (ii) page with the red **"Rehearsal values in use"** banner, plan table and AI answer |
| 2 | (i) AI answer; (ii) browser tab with the Open-Meteo JSON open, showing the same numbers |
| 3 | (i) AI answer; (ii) Excel showing the sorted column, rows 3616–3617, and the `PERCENTILE.INC` result |
| 4, 5 | the AI answer |
| Cost | the line under the question box: number of questions, last and average cost per answer |

## If an answer is wrong
Record what was wrong, what you changed (prompt, rule code or data), and the retest result in a new row (e.g. "1b-retest"). A confirmed answer counts as much as a fixed error.

## Cost
| Item | Value |
|---|---|
| Questions sent while building and testing | *(from the page's counter: "N question(s) sent from this browser")* |
| Average cost per answer (measured) | *(from the counter)* |
| Estimate before testing | ≈ $0.02 per answer (Sonnet 5.5: $2 / $10 per million input / output tokens, pricing page checked 26 Nov 2026) |
| Cross-check | Anthropic Console → Usage, for the River Watch workspace |
