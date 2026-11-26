"""Flood Plan Rule 8: which town should be first in line for a flood-defence study.
Source: OPW Hydro-Data gauged discharge (waterlevel.ie/hydro-data), 15-min values averaged to daily means
(days with >=48 readings kept), 2016-01-01..2025-12-31. Decision (2026-11-26): Rule 8 uses the measured gauge
record, not GloFAS, because GloFAS event counts failed the gauge cross-check (see data_sources_verified.md 2c).
Method: P99 = town gauge's 99th percentile of daily flow 2016-2025 (linear interpolation).
Event = run of consecutive days >= P99 on days 1 Oct..31 Mar, winters 2016/17..2024/25; runs cut at window edges.
A missing gauge day neither starts nor ends a run (a gap inside a flood is not counted as two floods).
First four = 2016/17..2019/20, last four = 2021/22..2024/25 (2020/21 is in neither).
Carrick-on-Shannon has no full gauge record (Jamestown 26085 starts 2019): GloFAS used, marked low confidence."""
import json, csv, datetime as dt, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
G = json.load(open(os.path.join(HERE, "opw_daily_2016_2025.json")))
F = json.load(open(os.path.join(ROOT, "data", "glofas_daily_2016_2025.json")))
SRC = {"Clonmel":("OPW","16011 Clonmel"),"Fermoy":("OPW","18107 Fermoy Br D/S"),"Mallow":("OPW","18055 Mallow Railway Br"),
 "Bandon":("OPW","20002 Curranure"),"Enniscorthy":("OPW","12001 Scarawalsh"),"Ennis":("OPW","27002 Ballycorey"),
 "Athlone":("OPW","26027 Athlone"),"Carrick-on-Shannon":("GloFAS","cell 53.925,-8.075 (no full gauge record)")}
WINTERS = [f"{y}/{str(y+1)[2:]}" for y in range(2016, 2025)]
def pct(v,p):
    v=sorted(v); k=(len(v)-1)*p; f=int(k); c=min(f+1,len(v)-1); return v[f]+(v[c]-v[f])*(k-f)
rows, events = [], []
for town,(kind,label) in SRC.items():
    s = G[label.split()[0]] if kind=="OPW" else {k:v for k,v in F[town].items() if v is not None}
    p99 = pct(list(s.values()), .99); by = {}; miss = 0
    for i,y in enumerate(range(2016,2025)):
        d=dt.date(y,10,1); run=None; n=0
        while d<=dt.date(y+1,3,31):
            x=s.get(d.isoformat())
            if x is None: miss+=1
            elif x>=p99:
                if run is None: run=[d,d,x,1]; n+=1
                else: run[1]=d; run[2]=max(run[2],x); run[3]+=1
            elif run:
                events.append(dict(town=town,source=kind,winter=WINTERS[i],start=run[0].isoformat(),end=run[1].isoformat(),days_at_or_above=run[3],peak_m3s=round(run[2],1))); run=None
            d+=dt.timedelta(days=1)
        if run: events.append(dict(town=town,source=kind,winter=WINTERS[i],start=run[0].isoformat(),end=run[1].isoformat(),days_at_or_above=run[3],peak_m3s=round(run[2],1)))
        by[WINTERS[i]]=n
    ev=[e for e in events if e["town"]==town]
    rows.append(dict(town=town, source=kind, series=label, p99_m3s=round(p99,1), events=sum(by.values()),
        first4=sum(by[w] for w in WINTERS[:4]), last4=sum(by[w] for w in WINTERS[-4:]),
        days_at_or_above=sum(e["days_at_or_above"] for e in ev), longest_event_days=max([e["days_at_or_above"] for e in ev] or [0]),
        winter_days_missing=miss, confidence="low" if kind=="GloFAS" else "normal", by_winter=by))
rows.sort(key=lambda r:(r["confidence"]=="low", -r["events"]))
top=rows[0]; second=rows[1]
answer=dict(
  question="Which town should be first in line for a full flood-defence study?",
  town=top["town"], events=top["events"], runner_up=second["town"], runner_up_events=second["events"],
  last4_more_than_first4=top["last4"]>top["first4"], first4=top["first4"], last4=top["last4"],
  cannot_tell=("The count treats a one-day spike and a two-week flood the same: it says nothing about how long events "
               "lasted, the damage they did, or the defences already in place. Athlone shows 1 event because the Shannon "
               "floods slowly over weeks, not because Athlone is safe."),
  caveats=["Rule 8 uses measured OPW gauge flow; tonight's levels use GloFAS. The two P99 values are on different scales.",
           "Carrick-on-Shannon has no full gauge record for 2016-2025; its count comes from GloFAS (low confidence, failed gauge check elsewhere).",
           "OPW quality codes were not filtered; days with fewer than 48 readings were dropped."])
out=dict(rule="Flood Plan Rule 8", built=dt.date.today().isoformat(), winters=WINTERS,
         source="OPW Hydro-Data gauged discharge (waterlevel.ie/hydro-data); Carrick-on-Shannon: Open-Meteo GloFAS",
         answer=answer, ranking=rows)
json.dump(out, open(os.path.join(ROOT,"data","study_ranking.json"),"w"), indent=1)
with open(os.path.join(ROOT,"data","study_events.csv"),"w",newline="") as f:
    w=csv.DictWriter(f,list(events[0])); w.writeheader(); w.writerows(events)
for r in rows: print(f"{r['town']:19s} {r['source']:6s} P99={r['p99_m3s']:6.1f} events={r['events']:2d} first4={r['first4']} last4={r['last4']} days={r['days_at_or_above']:2d} longest={r['longest_event_days']} miss={r['winter_days_missing']} conf={r['confidence']} {list(r['by_winter'].values())}")
print(json.dumps(answer, indent=1))
