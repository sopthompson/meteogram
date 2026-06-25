# Ensemble Meteogram

A 51-member **ECMWF ensemble meteogram** for fixed locations — temperature,
precipitation, wind (+ gust), cloud cover and pressure, with the full ensemble
spread (min–max / 10–90 / 25–75%), median and control run, over a 15-day forecast.

Currently set up for **Sheffield (S11 9LP)**.

It's a single static `index.html` served from GitHub Pages; a scheduled GitHub
Action does the heavy lifting (downloads the latest ENS run, extracts each
location's grid point, writes the data JSON) so there's no server to run.

## How it works

- **`generate.py`** — pulls the latest IFS ENS run from
  [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data)
  (0.25°, GRIB2) for a few surface variables, extracts the nearest grid point for
  each location in `locations.json`, and writes `data/<id>.json`.
- **`.github/workflows/meteogram.yml`** — runs twice daily (after the 00z and 12z
  runs disseminate) plus on demand, then deploys `index.html` + `data/` to Pages.
- **`index.html`** — loads the JSON and draws the meteogram in the browser
  (canvas, no dependencies).

## Add / change locations

Edit `locations.json` and add the `id` to the `LOCS` array near the top of
`index.html`'s script:

```json
{ "id": "york", "name": "York", "lat": 53.96, "lon": -1.08 }
```

Coordinates anywhere in the 0.25° (~25 km) grid cell give the same forecast.

## Data & licence

Forecast data: ECMWF Open Data, IFS ENS, CC-BY-4.0 — free including commercial
use, with attribution to ECMWF. These are raw model forecasts for personal use,
**not** a substitute for an official meteorological service, and this project is
not affiliated with or endorsed by ECMWF.

## Run the data step locally (optional)

Needs the eccodes C library:

```bash
brew install eccodes          # macOS
pip install -r requirements.txt
python generate.py            # writes data/sheffield.json
python -m http.server         # then open http://localhost:8000
```
