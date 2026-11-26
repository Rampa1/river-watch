import json,urllib.request,time,statistics as st,os,sys
base=sys.argv[1]; G=json.load(open(f"{base}/gauges/daily_2016_2025.json"))
plan={"Clonmel":("16011",[(52.375,-7.675),(52.375,-7.725)]),
"Fermoy":("18107",[(52.125,-8.225),(52.175,-8.275),(52.125,-8.325)]),
"Mallow":("18055",[(52.125,-8.625),(52.125,-8.575)]),
"Bandon":("20002",[(51.775,-8.725),(51.725,-8.675),(51.725,-8.775)]),
"Enniscorthy":("12001",[(52.475,-6.625),(52.525,-6.625),(52.525,-6.575)]),
"Ennis":("27002",[(52.825,-9.025),(52.875,-9.025),(52.775,-8.975)]),
"Athlone":("26027",[(53.425,-7.975),(53.375,-7.975)]),
"Carrick-on-Shannon":("26085",[(53.925,-8.075),(53.875,-8.025)])}
def glofas(la,lo):
    fn=f"{base}/gf_{la}_{lo}.json"
    if not os.path.exists(fn):
        for i in range(5):
            try:
                d=json.load(urllib.request.urlopen(f"https://flood-api.open-meteo.com/v1/flood?latitude={la}&longitude={lo}&daily=river_discharge&start_date=2016-01-01&end_date=2025-12-31&cell_selection=nearest",timeout=90)); break
            except Exception as e: time.sleep(20)
        json.dump(d,open(fn,"w")); time.sleep(3)
    d=json.load(open(fn)); return dict(zip(d["daily"]["time"],d["daily"]["river_discharge"]))
def q(v,p): v=sorted(v); return v[int(p*(len(v)-1))]
res={}
for t,(stn,cells) in plan.items():
    g=G[stn]; print(f"\n{t}  gauge {stn}  ({len(g)} days)")
    for la,lo in cells:
        m=glofas(la,lo); days=[d for d in g if m.get(d) is not None]
        o=[g[d] for d in days]; s=[m[d] for d in days]
        r=st.correlation(o,s); a=st.stdev(s)/st.stdev(o); b=st.mean(s)/st.mean(o)
        kge=1-((r-1)**2+(a-1)**2+(b-1)**2)**.5
        # flood detection: gauge days above gauge Q99 -> is GloFAS above its own Q95 within +-1 day?
        gq99=q(o,.99); sq95=q(s,.95); idx={d:i for i,d in enumerate(days)}
        hits=[d for d in days if g[d]>=gq99]
        det=sum(any(s[j]>=sq95 for j in range(max(0,idx[d]-1),min(len(days),idx[d]+2))) for d in hits)/len(hits)
        # false alarms: GloFAS days above its Q99 where gauge is below its Q90
        sq99=q(s,.99); gq90=q(o,.90); fa=[d for d in days if m[d]>=sq99]; far=sum(g[d]<gq90 for d in fa)/len(fa)
        print(f"  cell {la},{lo}: gaugeMean={st.mean(o):6.1f} glofasMean={st.mean(s):6.1f} bias={b:4.2f} r={r:4.2f} KGE={kge:5.2f} | gauge Q99={gq99:6.1f} glofas Q99={sq99:6.1f} | flood-days caught={det:4.0%} false-high={far:4.0%}")
        res.setdefault(t,[]).append(dict(cell=[la,lo],gauge=stn,n=len(days),gmean=st.mean(o),smean=st.mean(s),bias=b,r=r,kge=kge,gq99=gq99,sq99=sq99,caught=det,falsehigh=far))
json.dump(res,open(f"{base}/compare_results.json","w"),indent=1)
