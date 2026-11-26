import glob,json,collections,sys
base=sys.argv[1]; out={}
for st in "16011 18107 18055 18003 20002 12001 27002 26085 26027".split():
    f=glob.glob(f"{base}/c/{st}/*.csv")[0]; acc=collections.defaultdict(list); qc=collections.Counter()
    for line in open(f,encoding='utf-8',errors='replace'):
        if line[0]=='#' or line.startswith('Timestamp'): continue
        p=line.strip().split(';')
        if len(p)<3: continue
        d=p[0][:10]
        if not('2016-01-01'<=d<='2025-12-31'): continue
        qc[p[2]]+=1
        try: v=float(p[1])
        except: continue
        acc[d].append((v,p[2]))
    out[st]={d:sum(v for v,_ in l)/len(l) for d,l in acc.items() if len(l)>=48}
    print(st,"days(>=48 readings)=",len(out[st]),"qc=",dict(qc.most_common(6)))
json.dump(out,open(f"{base}/daily_2016_2025.json","w"))
