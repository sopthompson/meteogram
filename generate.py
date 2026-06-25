#!/usr/bin/env python3
"""Build ensemble-meteogram JSON for each configured location from ECMWF Open Data.

Pulls the latest IFS ENS (50 perturbed members) + HRES deterministic run for a few
surface variables, all steps, and extracts the nearest grid point per location.
Point extraction is done message-by-message with eccodes `find_nearest` (in C, so
it never materialises a full global field — safe for CI RAM). Writes
data/<id>.json that the static frontend renders.
"""
import os, sys, json, datetime as dt
import numpy as np
import eccodes
from ecmwf.opendata import Client

# ENS native cadence: 3-hourly to 144h, then 6-hourly to 360h (15 days)
STEPS = list(range(0, 145, 3)) + list(range(150, 361, 6))
SIDX = {s: i for i, s in enumerate(STEPS)}
SOURCE = os.environ.get("ECMWF_SOURCE", "ecmwf")   # 'ecmwf' | 'azure' | 'aws'
PARAMS = ["2t", "10u", "10v", "10fg", "tcc", "msl", "tp"]

def load_locations():
    locs = json.load(open("locations.json"))
    for l in locs:
        l["lon360"] = l["lon"] % 360            # ENS grid is 0..359.75
    return locs

def extract_points(path, locs):
    """{loc_id: {(number, step): value}} via per-message nearest-point lookup."""
    res = {l["id"]: {} for l in locs}
    with open(path, "rb") as f:
        while True:
            gid = eccodes.codes_grib_new_from_file(f)
            if gid is None:
                break
            try:
                step = int(eccodes.codes_get(gid, "step"))
                number = int(eccodes.codes_get(gid, "number")) if eccodes.codes_is_defined(gid, "number") else 0
                for l in locs:
                    near = eccodes.codes_grib_find_nearest(gid, l["lat"], l["lon360"])[0]
                    res[l["id"]][(number, step)] = near.value
            finally:
                eccodes.codes_release(gid)
    return res

def to_matrix(pts):
    """{(number, step): value} -> rows-by-number x len(STEPS) array (steps in STEPS order)."""
    numbers = sorted({k[0] for k in pts})
    if not numbers:
        return None
    nidx = {nm: i for i, nm in enumerate(numbers)}
    mat = np.full((len(numbers), len(STEPS)), np.nan)
    for (nm, step), v in pts.items():
        if step in SIDX:
            mat[nidx[nm], SIDX[step]] = v
    return mat

def main():
    locs = load_locations()
    client = Client(source=SOURCE)
    run = client.latest(stream="enfo", type="pf", param="2t", step=360)  # newest full-range run
    print(f"latest run: {run} (source={SOURCE})", flush=True)

    raw = {p: {l["id"]: {} for l in locs} for p in PARAMS}
    for param in PARAMS:
        for label, req, key in [("ENS", dict(stream="enfo", type="pf", number=list(range(1, 51))), "members"),
                                ("HRES", dict(stream="oper", type="fc"), "hres")]:
            target = f"/tmp/{param}_{key}.grib2"
            try:
                client.retrieve(date=run, param=param, step=STEPS, target=target, **req)
                pts = extract_points(target, locs)
                for l in locs:
                    raw[param][l["id"]][key] = to_matrix(pts[l["id"]])
                print(f"  {param} {label}: ok", flush=True)
            except Exception as e:
                print(f"  {param} {label}: FAILED {e}", file=sys.stderr, flush=True)
            finally:
                if os.path.exists(target):
                    os.remove(target)

    os.makedirs("data", exist_ok=True)
    valid = [(run + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in STEPS]
    for l in locs:
        i = l["id"]
        def M(p): return raw[p][i].get("members")        # 50 x N or None
        def H(p): return raw[p][i].get("hres")           # 1 x N or None
        V = {}
        def put(key, label, unit, m, h, dp=2):
            if m is None: return
            d = {"label": label, "unit": unit, "members": np.round(m, dp).tolist()}
            if h is not None: d["hres"] = np.round(h[0], dp).tolist()
            V[key] = d
        put("t2m", "2 m temperature", "°C",
            None if M("2t") is None else M("2t") - 273.15,
            None if H("2t") is None else H("2t") - 273.15, 1)
        if M("10u") is not None and M("10v") is not None:
            hwind = np.hypot(H("10u"), H("10v")) if (H("10u") is not None and H("10v") is not None) else None
            put("wind", "10 m wind", "m/s", np.hypot(M("10u"), M("10v")), hwind, 1)
        put("gust", "Wind gust", "m/s", M("10fg"), H("10fg"), 1)
        put("cloud", "Cloud cover", "%",
            None if M("tcc") is None else M("tcc") * 100,
            None if H("tcc") is None else H("tcc") * 100, 0)
        put("mslp", "Pressure", "hPa",
            None if M("msl") is None else M("msl") / 100,
            None if H("msl") is None else H("msl") / 100, 1)
        if M("tp") is not None:
            inc = lambda a: np.clip(np.diff(a * 1000.0, axis=1, prepend=a[:, :1] * 0), 0, None)  # m->mm, per interval
            put("precip", "Precipitation", "mm", inc(M("tp")), inc(H("tp")) if H("tp") is not None else None, 2)
        out = {"location": {k: l[k] for k in ("id", "name", "lat", "lon")},
               "run": run.strftime("%Y-%m-%dT%H:%M:%SZ"),
               "model": "ECMWF ENS (50) + HRES",
               "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "steps": STEPS, "valid": valid, "vars": V}
        json.dump(out, open(f"data/{i}.json", "w"))
        print(f"wrote data/{i}.json ({len(V)} vars)", flush=True)

if __name__ == "__main__":
    main()
