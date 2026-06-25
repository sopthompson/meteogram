# Ensemble Meteogram

A 51-member **ECMWF ensemble meteogram** — temperature, precipitation, wind
(+ gust), cloud cover and pressure, with the full ensemble spread
(min–max / 10–90 / 25–75%), median and control run, hourly over 15 days, plus
day/night shading.

Set up for **Sheffield (S11 9LP)**, with a lat/lon box for any location.

## How it works

It's a **single static `index.html`** — no backend, no build step, no scheduled
jobs. The page fetches the
[Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api) directly
in the browser (CORS-enabled, ~0.3 s) for the **ECMWF IFS 0.25°** model, which is
derived from [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data).
Always shows the latest run; nothing to maintain.

> Earlier this pulled raw GRIB from ECMWF in a GitHub Action, but a point
> meteogram needs every member × step × variable as whole-globe fields (~10 GB),
> which is far too slow to download in CI. Open-Meteo already serves the same
> ECMWF ensemble as a point time series, so the browser fetches it directly.

## Add / change locations

Edit the `LOCS` array near the top of the script in `index.html`:

```js
const LOCS = [
  { id: 'sheffield', name: 'Sheffield (S11 9LP)', lat: 53.365, lon: -1.50 },
  { id: 'york',      name: 'York',                lat: 53.96,  lon: -1.08 },
];
```

Or just type a lat/lon into the box on the page.

## Data & licence

Forecast: ECMWF IFS ensemble via Open-Meteo; underlying data ECMWF Open Data,
CC-BY-4.0 (attribute ECMWF). Open-Meteo is free for non-commercial use. These are
raw model forecasts for personal use — **not** a substitute for an official
meteorological service, and not affiliated with ECMWF or Open-Meteo.
