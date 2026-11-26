"""Rule 8 event count repeated on OPW gauged daily flow (same method), as an independent check of the ranking."""
import json, datetime as dt, sys
G = json.load(open(sys.argv[1]))
gauges = {"Clonmel":"16011","Fermoy":"18107","Mallow":"18055","Bandon":"20002","Enniscorthy":"12001","Ennis":"27002","Athlone":"26027"}
def pct(v,p):
    v=sorted(v); k=(len(v)-1)*p; f=int(k); c=min(f+1,len(v)-1); return v[f]+(v[c]-v[f])*(k-f)
rows=[]
for t,s in gauges.items():
    g=G[s]; p99=pct(list(g.values()),.99); counts=[]; missing=0
    for y in range(2016,2025):
        d=dt.date(y,10,1); n=0; inrun=False
        while d<=dt.date(y+1,3,31):
            x=g.get(d.isoformat())
            if x is None: missing+=1
            hi = x is not None and x>=p99
            if hi and not inrun: n+=1
            inrun=hi; d+=dt.timedelta(days=1)
        counts.append(n)
    rows.append((sum(counts),t,p99,counts,missing))
for tot,t,p99,c,m in sorted(rows,reverse=True):
    print(f"{t:12s} gauge P99={p99:6.1f} events={tot:2d} first4={sum(c[:4])} last4={sum(c[-4:])} winter-days-missing={m} {c}")
