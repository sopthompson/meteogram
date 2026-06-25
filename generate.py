#!/usr/bin/env python3
"""Build ensemble-meteogram JSON for each configured location from ECMWF Open Data.

Pulls the latest IFS ENS (51-member) run for a handful of surface variables, all
steps, extracts the nearest grid point per location, and writes data/<id>.json
that the static frontend renders. Designed to run in CI (GitHub Actions); the
heavy GRIB download/decode happens there, not in the browser.
"""
import os, sys, json, datetime as dt
import numpy as np
import xarray as xr
from ecmwf.opendata import Client

# ENS native cadence: 3-hourly to 144h, then 6-hourly to 360h (15 days)
STEPS = list(range(0, 145, 3)) + list(range(150, 361, 6))
SOURCE = os.environ.get("ECMWF_SOURCE", "ecmwf")   # 'ecmwf' | 'azure' | 'aws'

# ECMWF short name -> (our key). Wind speed/gust derived after download.
PARAMS = ["2t", "10u", "10v", "10fg", "tcc", "msl", "tp"]

def load_locations():
    locs = json.load(open("locations.json"))
    for l in locs:
        l["lon360"] = l["lon"] % 360            # ENS grid is 0..359.75
    return locs

def retrieve(client, run, param):
    """Download control + 50 perturbed members for one param; return 51 x nstep array
    aligned to STEPS, plus the loaded datasets keyed by (lat,lon) later."""
    cf_t, pf_t = f"/tmp/{param}_cf.grib2", f"/tmp/{param}_pf.grib2"
    client.retrieve(date=run, stream="enfo", type="cf", param=param, step=STEPS, target=cf_t)
    client.retrieve(date=run, stream="enfo", type="pf", param=param, step=STEPS,
                    number=list(range(1, 51)), target=pf_t)
    kw = {"engine": "cfgrib", "backend_kwargs": {"indexpath": ""}}
    cf = xr.open_dataset(cf_t, **kw)
    pf = xr.open_dataset(pf_t, **kw)
    return cf, pf

def point_members(cf, pf, lat, lon360):
    """51 x nstep array (row 0 = control) at the nearest grid point."""
    vcf = list(cf.data_vars)[0]; vpf = list(pf.data_vars)[0]
    c = cf[vcf].sel(latitude=lat, longitude=lon360, method="nearest").values  # (step,)
    p = pf[vpf].sel(latitude=lat, longitude=lon360, method="nearest").values  # (number, step)
    if c.ndim == 0:
        c = np.array([float(c)])
    return np.vstack([np.asarray(c)[None, :], np.asarray(p)])

def main():
    locs = load_locations()
    client = Client(source=SOURCE)
    # newest run that has the full 360h range (only 00z/12z go that far)
    run = client.latest(stream="enfo", type="pf", param="2t", step=360)
    print(f"latest ENS run: {run} (source={SOURCE})", flush=True)

    raw = {}  # param -> {loc_id: 51xN array}
    for param in PARAMS:
        try:
            cf, pf = retrieve(client, run, param)
            raw[param] = {l["id"]: point_members(cf, pf, l["lat"], l["lon360"]) for l in locs}
            print(f"  {param}: ok", flush=True)
        except Exception as e:
            print(f"  {param}: FAILED {e}", file=sys.stderr, flush=True)
        finally:
            for s in ("cf", "pf"):
                f = f"/tmp/{param}_{s}.grib2"
                if os.path.exists(f): os.remove(f)

    os.makedirs("data", exist_ok=True)
    valid = [(run + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in STEPS]
    for l in locs:
        i = l["id"]
        def arr(param): return raw.get(param, {}).get(i)
        vars_out = {}
        if arr("2t") is not None:
            vars_out["t2m"] = {"label": "2 m temperature", "unit": "°C",
                               "members": np.round(arr("2t") - 273.15, 2).tolist()}
        if arr("10u") is not None and arr("10v") is not None:
            ws = np.hypot(arr("10u"), arr("10v"))
            vars_out["wind"] = {"label": "10 m wind", "unit": "m/s", "members": np.round(ws, 2).tolist()}
        if arr("10fg") is not None:
            vars_out["gust"] = {"label": "Wind gust", "unit": "m/s", "members": np.round(arr("10fg"), 2).tolist()}
        if arr("tcc") is not None:
            vars_out["cloud"] = {"label": "Cloud cover", "unit": "%",
                                 "members": np.round(arr("tcc") * 100, 1).tolist()}
        if arr("msl") is not None:
            vars_out["mslp"] = {"label": "Pressure", "unit": "hPa",
                                "members": np.round(arr("msl") / 100, 1).tolist()}
        if arr("tp") is not None:
            tp = arr("tp") * 1000.0                                   # m -> mm, accumulated
            inc = np.diff(tp, axis=1, prepend=tp[:, :1] * 0)          # per-interval mm
            vars_out["precip"] = {"label": "Precipitation", "unit": "mm",
                                  "members": np.round(np.clip(inc, 0, None), 2).tolist()}
        out = {"location": {k: l[k] for k in ("id", "name", "lat", "lon")},
               "run": run.strftime("%Y-%m-%dT%H:%M:%SZ"),
               "model": "ECMWF IFS ENS · 51 members",
               "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "steps": STEPS, "valid": valid, "vars": vars_out}
        json.dump(out, open(f"data/{i}.json", "w"))
        print(f"wrote data/{i}.json ({len(vars_out)} vars)", flush=True)

if __name__ == "__main__":
    main()
