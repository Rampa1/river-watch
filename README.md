# River Watch

Decision support for a flood response team serving eight Irish towns. Each afternoon it recommends each town's level for tonight (Normal, Standby or Barriers) and where the three crews go, applying The Flood Plan (fictional, 2026/27). It also answers the Area Manager's question on which town should be first in line for a flood-defence study.

**AI can make mistakes; a person makes the final decision.**

## How it works
- **Static GitHub Pages site, no server.** At the moment of each question the page reads, live:
  - the team Google Sheet;
  - the Open-Meteo Flood API (GloFAS) forecast;
  - Met Éireann weather warnings.
- **Code computes, the brain explains.** `src/plan.js` applies every Flood Plan rule: levels, warnings, rehearsal values, crews and barrier sets. Anthropic Claude Sonnet 5.5 explains the result, and can re-run the engine for "what if" questions.
- **The key** is pasted by each user into the settings box. It is stored only in their browser (`localStorage`), sent only to `api.anthropic.com`, and never stored in this repository.
- **Stored once, offline** (`data/`):
  - P95/P99 thresholds from 2016–2025 GloFAS daily flow;
  - the Rule 8 study ranking from OPW gauged flow.

  The scripts and checks that produced them are in `verification/`, and the evidence is in `data_sources_verified.md`.

## Run and test locally
```
python -m http.server 8000     # then open http://localhost:8000
npm test                       # 25 tests: Flood Plan engine, warning filter, API client (simulated)
```

## Sources and licences
- Open-Meteo.com (CC BY 4.0), including GloFAS (Copernicus Emergency Management Service) and GeoNames.
- Met Éireann warnings: Copyright Met Éireann, CC BY 4.0 with Met Éireann's conditions.
- OPW hydrometric data via waterlevel.ie (CC BY 4.0, provisional data).

Full attribution lines and the list of changes made are in `data_sources_verified.md` and in the page footer.
