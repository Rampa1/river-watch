# Task 3: Test log

Site: https://rampa1.github.io/river-watch/ · Brain: Anthropic `claude-sonnet-5-5` · Tests run 27 Nov 2026, 07:24–08:52.

Expected answers were worked out at 06:28, before any question, by an independent script (`verification/expected_plan.py`). It reads the Sheet and live sources itself and recomputes P95/P99 without the site's code. Screenshots are in the Evidence section.

## Test log

| # | Question asked (and set-up) | Expected answer (worked out before asking) | Tool's answer | Match? | Evidence |
|---|---|---|---|---|---|
| 1a | **Rehearsal, without overrides.** Override cells empty. "What is tonight's plan?" (07:31) | All 8 towns **Normal** (each peak below its own P95), 0 Met Éireann warnings, no crews needed. Mallow crew noted as Mallow-only. No rehearsal values. | All eight towns Normal, each with its peak, date and P95/P99. For example, Ennis 21.65 m³/s (27 Nov) vs P95 31.1, and Athlone 45.45 (29 Nov) vs P95 142.4. Met Éireann feed (read 07:31) has 0 warnings. "No crew places are needed." Mallow crew Mallow-only noted. Bandon's barrier set on loan noted. "No rehearsal values are in use. All figures are live." Tiles: 0 Barriers / 0 Standby / 8 Normal / 0/6 crew places. | ✅ Match | `1a-sheet`, `1a-answer` |
| 1b | **Rehearsal, with overrides.** Fermoy `flow_override_m3s` = **140**, Athlone `warning_override` = **Orange**. "What is tonight's plan?" (07:29) | **Fermoy → Barriers**: 140 ≥ P99 127.8 (+9.5%). **Clonmel crew** goes to Fermoy, because the Mallow crew is Mallow-only (notes). **Athlone → Standby**: flow Normal (45.45 < P95 142.4), raised one level by the orange warning. Both labelled rehearsal values. Others Normal. | "**Fermoy: Barriers.** … 140 m³/s is 9.5% above the P99 of 127.8. **This uses a rehearsal value.** The live forecast peak was 29.9 m³/s." "**Clonmel crew**: recommended to go to Fermoy … rank 1 of 1." "**Mallow crew**: no town recommended. Its van is in repair, so it can work in Mallow only tonight." "**Athlone: Standby.** … flow is Normal (peak 45.45 … against a P95 of 142.4). It is raised one level by an orange rain warning for Westmeath/Roscommon. **That warning is a rehearsal value.**" Other six towns Normal. It closes by noting that without the rehearsal values every town would be Normal. Tiles: 1 Barriers / 1 Standby / 6 Normal / 1/6 crew places; "rehearsal" tags in the table. | ✅ Match (see note A) | `1b-sheet`, `1b-answer` |
| 2 | **Forecast check.** "What is Clonmel's river forecast for each of the next three days, and where does it come from?" (07:24). Then open the **forecast source ↗** link. | Clonmel (Suir, cell 52.375, −7.675): 27 Nov **29.13**, 28 Nov **29.83**, 29 Nov **29.34** m³/s; peak 29.83 on 28 Nov. Source: Open-Meteo Flood API (GloFAS). Level Normal (below P95 77.7). | "27 Nov: 29.13 m³/s · 28 Nov: 29.83 m³/s (the highest of the three days, so this is the forecast peak) · 29 Nov: 29.34 m³/s", "from the Open-Meteo Flood API (GloFAS), daily river_discharge, fetched 27 Nov 2026 at 07:24". Below P95 77.7 and P99 127.7, so Normal. It says the rehearsal values apply to Fermoy and Athlone only, and warns not to compare GloFAS with OPW gauge readings. **Browser source** (`flood-api.open-meteo.com/v1/flood?latitude=52.375&longitude=-7.674988&…`): `"time":["2026-11-27","2026-11-28","2026-11-29"]`, `"river_discharge":[29.13,29.83,29.34]`. | ✅ Match: all three values identical to the source | `2-answer`, `2-source` |
| 3 | **P99 recomputed a second way.** "What is Clonmel's 99th percentile and how was it computed?" (07:37). Recomputed in Excel from `verification/clonmel_p99_check.csv`. | **127.7 m³/s** (GloFAS daily, 2016-01-01 to 2025-12-31, 3,653 days). Position 1 + 0.99 × 3652 = 3616.48. Sorted #3616 = 127.23 and #3617 = 128.12, so P99 = 127.23 + 0.48 × 0.89 = **127.66**. | Tool: "Clonmel's 99th percentile (P99) is **127.7 m³/s**", from the stored thresholds file, GloFAS v4 daily discharge 1 Jan 2016 – 31 Dec 2025, linear interpolation. It says honestly that it cannot show the daily values, and adds that the OPW-gauge P99 (195.7) is on a different scale. **Excel:** days `=COUNT(B2:B3654)` = **3653**; `=PERCENTILE.INC(B2:B3654,0.99)` = **127.6572**; position **3616.48**; sorted rank 3616 = 127.23, rank 3617 = 128.12; by hand `=E3617+0.48*(E3618-E3617)` = **127.6572**. | ✅ Match: tool, Excel and hand calculation all give 127.66 → 127.7 | `3-answer`, `3-excel` |
| 4 | **Area Manager.** "Which town should be first in line for a flood-defence study?" (08:15) | **Fermoy**: 22 high-flow events, winters 2016/17–2024/25, OPW gauge 18107. Mallow 21. Last four winters **not** more than first four (**9 vs 9**). Limit: ignores event length, damage and existing defences. | "**Fermoy** should be first in line … from the stored Rule 8 ranking … measured OPW gauge flow." "Fermoy: 22 high-flow events … OPW gauge 18107 Fermoy Br D/S." "Runner-up: Mallow, with 21 events … very close." "The last four winters did not have more events than the first four. Fermoy had 9 in each period." Cannot tell: "a one-day spike and a two-week flood" are counted the same; no information on damage or defences already in place; Athlone's single event lasted weeks. Caveats: GloFAS vs gauge scale, 8 missing winter days, Carrick from GloFAS with low confidence. | ✅ Match | `4-answer` |
| 5 | **Out of scope.** "Will my house in Mallow flood tonight?" (08:28) | Declines to predict for an individual home (Flood Plan Rule 9) and refers to the **council's area office**. May mention Mallow's town-level status. No house-level claim. | "I can't say whether your house will flood. Anything about an individual home is outside what River Watch covers (Rule 9). Please contact the council's area office." It then gives only town-level river data (Mallow Normal; peak 16.14 m³/s on 28 Nov vs P95 44.6), and says it "doesn't cover coastal or tidal flooding, local surface water or road conditions, or conditions at your address." | ✅ Match | `5-answer` |

**Note A:** test 1b matched, except that the Standby action did not list Athlone's resource numbers (fixed in R1).

**Order and reset:** the rehearsal values were in the Sheet for tests 2, 1b, 3, 4 and 5, which concern towns or data they do not affect; 1a ran with them cleared. Afterwards both cells were cleared, and the live Sheet was checked identical to the starter values.

## Errors found and fixed

| # | What was wrong | What was changed | Retest |
|---|---|---|---|
| R1 | Test 1b: the Standby action did not show the Sheet's resource numbers. | `src/plan.js`: the Standby action now reads e.g. "Standby: 6 staff on call confirmed, 5 pumps checked, 2500 sandbags staged". New unit test added; all 29 tests pass. | ✅ **Retest 08:52** (`R1-answer`), still with Fermoy 140 and Athlone orange. The table action reads "Standby: 6 staff on call confirmed, 5 pumps checked, 2500 sandbags staged". The answer reads "Athlone: Standby (rehearsal). The recommended measures are 6 staff on call confirmed, 5 pumps checked and 2,500 sandbags staged." Everything else is unchanged from 1b (Fermoy Barriers with the Clonmel crew). **Fixed.** |
| R2 | **Cost.** In 4 of 6 answers (tests 2, 3, 4, 5) the cost was ≈ $0.004 higher than tokens × price. The whole prompt was being written to Anthropic's 5-minute prompt cache (1.25 × input price). Every question carries new live data, so the cached copy was never read back: about 20% extra cost for nothing. | `src/providers.js`: automatic prompt caching removed. Unit test added to check it is not sent. | ✅ **Retest 08:52** (`R1-answer`): 8,255 in + 998 out. 8,255 × $2/M + 998 × $10/M = $0.01651 + $0.00998 = **$0.0265**, exactly the cost shown, with no cache premium. **Fixed.** |

## Cost

| Test | Time | Input tokens | Output tokens | Cost shown | Tokens × price only |
|---|---|---|---|---|---|
| 2 | 07:24 | 8,263 | 424 | $0.0249 | $0.0208 |
| 1b | 07:29 | 8,249 | 976 | $0.0263 | $0.0263 |
| 1a | 07:31 | 8,033 | 841 | $0.0245 | $0.0245 |
| 3 | 07:37 | 8,257 | 438 | $0.0250 | $0.0209 |
| 4 | 08:15 | 8,253 | 574 | $0.0264 | $0.0222 |
| 5 | 08:28 | 8,251 | 492 | $0.0255 | $0.0214 |
| R1/R2 retest | 08:52 | 8,255 | 998 | $0.0265 | $0.0265 ✅ |
| **Average of tests 1–5** | | **≈ 8,200** | **≈ 620** | **$0.0254** | **$0.0227** (after fix R2) |

| Measure | Value |
|---|---|
| Questions sent while building and testing | **15**, total **$0.400** (page counter, `cost.png`) |
| Cost per answer, measured | **$0.025** before fix R2, **$0.023** after (about 8,200 input and 620 output tokens) |
| Estimate before testing | $0.02 (Anthropic pricing page, 26 Nov 2026: $2 / $10 per million input / output tokens) |
| At 1,000 questions a month | about $23 after fix R2 |

Input was twice the estimate because each question sends the whole computed plan with its sources.
