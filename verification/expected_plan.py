"""Task 3: work out the EXPECTED plan independently of the website's code (src/plan.js).

A second implementation in Python. It reads the same live sources and recomputes P95/P99 itself
from the stored daily series, using statistics.quantiles (not the site's percentile code).
Run it just before asking River Watch, and record its output as "expected".

  python -I verification/expected_plan.py                               # live Sheet as it is now
  python -I verification/expected_plan.py --flow Fermoy=140 --warn Athlone=orange   # preview a rehearsal

--flow and --warn only preview what the Sheet WILL say once you type those values; the live
Sheet values are used for everything else. Override cells already in the Sheet are applied automatically.
"""
import csv, io, json, sys, statistics, urllib.request, datetime as dt, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = "https://docs.google.com/spreadsheets/d/17rEoTPrySBwY3lQngmYzxDQPWpAAM0UuSqYL8bN5xMo/export?format=csv&gid=0"
WARN = "https://www.met.ie/Open_Data/json/warning_IRELAND.json"
CODES = {"EI03": "Clare", "EI04": "Cork", "EI14": "Leitrim", "EI24": "Roscommon", "EI26": "Tipperary",
         "EI29": "Westmeath", "EI30": "Wexford"}
COUNTIES = ["Clare", "Cork", "Leitrim", "Roscommon", "Tipperary", "Westmeath", "Wexford"]
CREWS = {"Clonmel": ["Clonmel", "Fermoy", "Enniscorthy"], "Mallow": ["Mallow", "Fermoy", "Bandon"],
         "Athlone": ["Athlone", "Carrick-on-Shannon", "Ennis"]}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "RiverWatch-test"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8-sig")

flow_preview = dict(x.split("=") for x in sys.argv[sys.argv.index("--flow") + 1].split(",")) if "--flow" in sys.argv else {}
warn_preview = dict(x.split("=") for x in sys.argv[sys.argv.index("--warn") + 1].split(",")) if "--warn" in sys.argv else {}

now = dt.datetime.now(dt.timezone.utc)
rows = list(csv.DictReader(io.StringIO(get(SHEET))))
summary = {t["town"]: t for t in json.load(open(os.path.join(ROOT, "data", "history_summary.json")))["towns"]}
daily = json.load(open(os.path.join(ROOT, "data", "glofas_daily_2016_2025.json")))
warnings = json.loads(get(WARN))
print(f"Read at {now.astimezone().strftime('%d %b %Y %H:%M')} | Sheet rows {len(rows)} | Met Éireann warnings in feed: {len(warnings)}")

out = []
for r in rows:
    t = r["town"]; s = summary[t]
    vals = [v for v in daily[t].values() if v is not None]
    q = statistics.quantiles(vals, n=100, method="inclusive")   # independent percentile computation
    p95, p99 = round(q[94], 1), round(q[98], 1)
    fc = json.loads(get(f"https://flood-api.open-meteo.com/v1/flood?latitude={s['cell_lat']}&longitude={s['cell_lon']}"
                        "&daily=river_discharge&forecast_days=3&timezone=Europe%2FDublin&cell_selection=nearest"))
    days = list(zip(fc["daily"]["time"], fc["daily"]["river_discharge"]))
    peak = max(v for _, v in days)
    flow_ov = flow_preview.get(t) or r["flow_override_m3s"].strip()
    note = ""
    if flow_ov:
        peak, note = float(flow_ov), f" (REHEARSAL flow {flow_ov})"
    level = 2 if peak >= p99 else 1 if peak >= p95 else 0
    counties = {r["county"]} | {c for c in COUNTIES if re.search(rf"\b{c}\b", r["notes"])}
    live = [w for w in warnings if w.get("level", "").lower() in ("orange", "red")
            and re.search(r"\brain", (w.get("type", "") + " " + w.get("headline", "")), re.I)
            and dt.datetime.fromisoformat(w["onset"]) <= now + dt.timedelta(hours=48)
            and dt.datetime.fromisoformat(w["expiry"]) > now
            and counties & {CODES.get(c) for c in w.get("regions", [])}]
    w_ov = (warn_preview.get(t) or r["warning_override"]).strip().lower()
    raised = bool(live) or w_ov in ("orange", "red")
    if raised:
        level = min(level + 1, 2)
        note += f" (+1: {'REHEARSAL ' + w_ov if w_ov in ('orange','red') else 'live'} warning)"
    lvl = ["Normal", "Standby", "Barriers"][level]
    barrier_ok = int(r["barrier_sets"] or 0) > 0 and not re.search(r"barrier[^.]*\b(on loan|unavailable|damaged)", r["notes"], re.I)
    pct = round((peak - p99) / p99 * 100, 1)
    out.append((t, lvl, peak, p95, p99, pct, barrier_ok, days, note, sorted(counties)))
    print(f"{t:19s} {lvl:8s} peak {peak:7.2f} | P95 {p95:6.1f} P99 {p99:6.1f} | {pct:+6.1f}% vs P99 | "
          f"barrier set {'yes' if barrier_ok else 'NO'} | counties {'+'.join(sorted(counties))}{note}")
    print(f"{'':19s} forecast days: " + ", ".join(f"{d} {v}" for d, v in days))

bars = sorted([o for o in out if o[1] == "Barriers"], key=lambda o: (-o[5], -o[2]))
print("\nBarriers towns ranked for crews (% above P99, tie: higher peak):")
for o in bars:
    print(f"  {o[0]}: {o[5]:+.1f}%  barrier set: {'yes' if o[6] else 'NO -> Standby measures + flag (Rule 7)'}")
print("Crew areas:", CREWS, "| each crew max 2 towns | check notes for crew restrictions (Mallow crew: Mallow only)")
