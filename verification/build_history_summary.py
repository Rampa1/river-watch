"""Build the stored history summary (Flood Plan Rule 2) and winter event counts (Rule 8).
Source: Open-Meteo Flood API (GloFAS v4), daily river_discharge, 2016-01-01..2025-12-31.
Percentiles: linear interpolation between closest ranks (same as numpy default / Excel PERCENTILE.INC).
GloFAS events (comparison only, not used for Rule 8): a run of consecutive days with flow >= town P99, counted only on days 1 Oct..31 Mar,
winters 2016/17..2024/25. Runs are cut at the winter window edges (no run crosses 1 Oct or 31 Mar)."""
import json, os, sys, time, urllib.request, datetime as dt, csv
OUT = sys.argv[1]; CACHE = sys.argv[2] if len(sys.argv) > 2 else OUT
TOWNS = [  # town, county, river, geocoded town lat/lon, chosen GloFAS cell, OPW check gauge
 ("Clonmel","Tipperary","Suir",52.35500,-7.70389,52.375,-7.675,"16011 Clonmel"),
 ("Fermoy","Cork","Blackwater",52.13583,-8.27583,52.125,-8.225,"18107 Fermoy Br D/S"),
 ("Mallow","Cork","Blackwater",52.13333,-8.63333,52.125,-8.625,"18055 Mallow Railway Br"),
 ("Bandon","Cork","Bandon",51.74694,-8.74250,51.775,-8.725,"20002 Curranure"),
 ("Enniscorthy","Wexford","Slaney",52.50083,-6.55778,52.475,-6.625,"12001 Scarawalsh"),
 ("Ennis","Clare","Fergus",52.84361,-8.98639,52.825,-9.025,"27002 Ballycorey"),
 ("Athlone","Westmeath","Shannon",53.42278,-7.93722,53.425,-7.975,"26027 Athlone"),
 ("Carrick-on-Shannon","Leitrim","Shannon",53.94694,-8.09000,53.925,-8.075,"26085 Jamestown"),
]
def series(la, lo):
    fn = os.path.join(CACHE, f"gf_{la}_{lo}.json")
    if not os.path.exists(fn):
        u = (f"https://flood-api.open-meteo.com/v1/flood?latitude={la}&longitude={lo}&daily=river_discharge"
             "&start_date=2016-01-01&end_date=2025-12-31&cell_selection=nearest")
        json.dump(json.load(urllib.request.urlopen(u, timeout=90)), open(fn, "w")); time.sleep(3)
    d = json.load(open(fn)); return d["daily"]["time"], d["daily"]["river_discharge"], (d["latitude"], d["longitude"])
def pct(v, p):
    v = sorted(v); k = (len(v)-1)*p; f = int(k); c = min(f+1, len(v)-1); return v[f] + (v[c]-v[f])*(k-f)
summary, events, raw, glofas_counts = [], [], {}, []
for town, county, river, tla, tlo, la, lo, gauge in TOWNS:
    days, vals, cell = series(la, lo)
    good = [x for x in vals if x is not None]
    p95, p99 = pct(good, .95), pct(good, .99)
    raw[town] = dict(zip(days, vals))
    # Rule 8 events
    per_winter = {}
    for y in range(2016, 2025):
        a, b = dt.date(y,10,1), dt.date(y+1,3,31); n=0; run=None; runs=[]
        d = a
        while d <= b:
            x = raw[town].get(d.isoformat())
            if x is not None and x >= p99:
                if run is None: run=[d,d,x]
                else: run[1]=d; run[2]=max(run[2],x)
            elif run: runs.append(run); run=None
            d += dt.timedelta(days=1)
        if run: runs.append(run)
        per_winter[f"{y}/{str(y+1)[2:]}"] = runs
        for r in runs: events.append(dict(town=town, winter=f"{y}/{str(y+1)[2:]}", start=r[0].isoformat(), end=r[1].isoformat(),
                                          days=(r[1]-r[0]).days+1, peak_m3s=round(r[2],1)))
    counts = {w: len(r) for w, r in per_winter.items()}
    ws = list(counts); first4 = sum(counts[w] for w in ws[:4]); last4 = sum(counts[w] for w in ws[-4:])
    evdays = sum(e["days"] for e in events if e["town"]==town)
    summary.append(dict(town=town, county=county, river=river, town_lat=tla, town_lon=tlo,
        cell_lat=cell[0], cell_lon=cell[1], period="2016-01-01..2025-12-31", n_days=len(good), missing=len(vals)-len(good),
        mean_m3s=round(sum(good)/len(good),1), p95_m3s=round(p95,1), p99_m3s=round(p99,1), max_m3s=round(max(good),1),
        max_date=days[vals.index(max(good))], check_gauge=gauge))
    glofas_counts.append(dict(town=town, events=sum(counts.values()), first4=first4, last4=last4, event_days=evdays, by_winter=counts))
json.dump(dict(source="Open-Meteo Flood API (GloFAS v4), river_discharge daily", built=dt.date.today().isoformat(),
               percentile_method="linear interpolation", towns=summary), open(os.path.join(OUT,"history_summary.json"),"w"), indent=1)
with open(os.path.join(OUT,"history_summary.csv"),"w",newline="") as f:
    cols=[k for k in summary[0] if k!="events_by_winter"]; w=csv.DictWriter(f,cols,extrasaction="ignore"); w.writeheader(); w.writerows(summary)
# GloFAS event counts are kept for comparison only; Rule 8 uses the OPW gauge record (build_study_ranking.py)
VER = os.path.dirname(os.path.abspath(__file__))
json.dump(glofas_counts, open(os.path.join(VER,"winter_events_glofas_counts.json"),"w"), indent=1)
with open(os.path.join(VER,"winter_events_glofas.csv"),"w",newline="") as f:
    w=csv.DictWriter(f,list(events[0])); w.writeheader(); w.writerows(events)
json.dump(raw, open(os.path.join(OUT,"glofas_daily_2016_2025.json"),"w"))
for s in summary:
    print(f"{s['town']:19s} cell {s['cell_lat']:.3f},{s['cell_lon']:.3f} n={s['n_days']} miss={s['missing']} mean={s['mean_m3s']:6.1f} P95={s['p95_m3s']:6.1f} P99={s['p99_m3s']:6.1f} max={s['max_m3s']:6.1f} ({s['max_date']})")
