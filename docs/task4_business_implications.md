# Task 4: Business implications

**To:** Area Manager · **Re:** What River Watch changes, and what it must never decide alone

Each afternoon the Duty Officer reads four websites and a spreadsheet to make the same call. River Watch does that reading in seconds, applies The Flood Plan consistently, and shows where every number came from. For a team that twice last winter put barriers in the wrong town, the gain is an audit trail: each recommendation can be checked against the data behind it. It also answers your study question from data, not from whoever shouted loudest. On OPW gauge records for 2016–2025, Fermoy has had the most high-flow events (22), with Mallow on the same river close behind (21).

This fits what Ireland is building. Met Éireann's Flood Forecasting Centre has run since early 2024 with 36 river-catchment models, but it advises local authorities and emergency responders. Localised public warnings are a later phase that had not begun by January 2026 [1][2]. Dublin City Council is piloting an AI early-warning system this winter that gave 13–21 hours' notice in trials, presented as helping engineers "make better decisions" [3]. River Watch likewise supports the 16:00 decision on levels and crews. It must never make that decision alone, send a crew or judge an individual home.

**Cost.** Testing measured about $0.02 per answer, so 1,000 questions a month cost about $23 on Claude Sonnet 5.5. A cheaper brain (Claude Haiku 5.5, about $1 a month) is more likely to misread a note such as the Mallow crew restriction. A dearer one (Claude Opus 5.5, about $46) adds little, because the rules are computed in code, not by the model. The data is free, but Open-Meteo's free tier is non-commercial (10,000 calls a day), so council use needs its paid plan.

**Risks, and what goes in place before the team relies on it:**
- *A wrong number from the wrong place.* Four of the eight towns first landed on a non-river grid cell. Each point is now checked against an OPW gauge.
- *A forecast that misses.* The global flood model times floods well but underestimates peaks, and is weakest at Carrick-on-Shannon. Keep gauge checks and local knowledge in the loop.
- *A source going down.* The tool shows "Unknown" instead of guessing, and the manual routine remains the fallback.
- *A leaked key.* Keys stay in each user's browser, carry a monthly spend cap, and are revoked if exposed.
- *Over-trust.* The page states that a person decides. The Duty Officer records each decision and reason, and we compare recommendations with outcomes monthly.

I recommend a supervised winter trial alongside the current process first.

---
**Sources**
1. Met Éireann, *Flood Forecasting Centre* (accessed 26 Nov 2026). https://www.met.ie/about-us/specialised-services/flood-forecasting-centre
2. RTÉ Prime Time, "Met Éireann clarifies communication after Minister raises concerns", 29–30 Jan 2026. https://www.rte.ie/news/primetime/2026/0129/1555851-met-eireann-defends-communication-after-minister-raises-concerns
3. Irish Examiner, "New AI early warning system for major floods to pilot in Dublin City", 16 Nov 2026. https://www.irishexaminer.com/news/arid-41938083.html

*Cost basis:* Anthropic pricing page, checked 26 Nov 2026. Per answer ≈ 4,000 input and 1,500 output tokens: Sonnet 5.5 at $2/$10 per million gives $0.023; Haiku 5.5 at $0.10/$0.50 gives $0.0012; Opus 5.5 at $4/$20 gives $0.046. **Replace "$0.02" with the average measured in Task 3 before submitting.**
