# Ensemble Meteogram

A static, installable weather tool for exploring forecast uncertainty. It compares several global ensemble prediction systems and renders either a traditional fan meteogram or side-by-side box–whisker plots.

## Features

- ECMWF IFS and AIFS, NOAA GEFS, DWD ICON EPS and CMC GEPS
- Fan charts with 10–90% and 25–75% ranges, ensemble median and control run
- Comparative box–whisker charts (10–90% whiskers, interquartile box and median), shown at 3–12-hour intervals
- Optional combined multi-model boxes with equal weighting per forecasting system
- Temperature, precipitation, sustained wind and gusts, wind direction, cloud, pressure, snowfall and freezing level
- Configurable rain probability thresholds
- 48-hour, 7-day and 15-day views with synchronized pointer, touch and keyboard inspection
- Daily ensemble summaries, model selection and explicit primary-model control
- Disambiguated place search, geolocation, a clickable global map, favourites and recents
- Metric, UK and US units; location-local or UTC display
- Shareable URLs, member-level CSV export and PNG export
- Explicit ERA5 reanalysis history mode
- Accessible data table, responsive layout, offline shell and stale-data fallback

Models retain their own ensemble distributions. Members from different forecasting centres are not pooled: fan mode shows the primary model distribution with peer medians, while box–whisker mode places the selected models alongside one another.

Combined box mode is an explicit exception: it constructs an equal-model-weight mixture by sampling the same quantile grid from each available model. This prevents larger ensembles from dominating simply because they contain more members. It is useful consensus guidance, not a calibrated grand ensemble.

The primary model supplies the fan distribution, daily cards, detailed tooltip and master time axis. Other selected models are comparison overlays in fan mode and peers in box mode.

## Run locally

No build step is required. ES modules and the service worker do require an HTTP origin rather than opening `index.html` directly:

```sh
npm run serve
```

Open <http://localhost:8080>. Run the pure data/statistics tests with:

```sh
npm test
```

## Structure

- `index.html` — semantic application shell
- `styles.css` — responsive presentation
- `app.js` — API, state, interaction and canvas rendering
- `lib.mjs` — model definitions and testable statistics/data helpers
- `sw.js` / `manifest.webmanifest` — installable offline shell
- `test/` — Node test suite

## Data interpretation

Forecasts come from the [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api). Model output is natively produced at varying intervals; Open-Meteo may interpolate it to an hourly time series. The control member is drawn separately and is not included in perturbed-member quantiles.

History explicitly requests ERA5. Reanalysis combines a numerical model with observations to reconstruct past conditions; it is not a direct station observation record and generally has several days of latency.

Forecast data is cached for one hour in IndexedDB. When a refresh fails, an older cached response can be displayed and is clearly marked stale.

## Licence and use

Underlying ECMWF open data is CC-BY-4.0. Open-Meteo's free API is intended for non-commercial use; review its current terms before commercial deployment. This project is forecast guidance, not an official meteorological warning service.
