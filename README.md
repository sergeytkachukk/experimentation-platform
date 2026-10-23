# A/B test sandbox

A pet project for learning how A/B tests behave. You set a "true" effect, the app simulates users (or reads a real table
from BigQuery), and shows what frequentist and Bayesian statistics make of the data, including the traps that produce
false wins: peeking, sample ratio mismatch (SRM), noisy revenue metrics.

> No back end is needed for the simulator. The BigQuery mode adds a tiny local API so Google credentials never reach the browser.

## What it does

| Area | Details |
|---|---|
| **Simulator** | Hash-based bucketing, conversion / click / revenue metrics (heavy-tailed order values), optional SRM injection, up to 300,000 users, seeded and reproducible |
| **Frequentist** | Two-proportion z-test, Welch's t-test, confidence intervals, uplift, SRM chi-square check |
| **Bayesian** | GrowthBook-style engine: Gaussian posterior of the relative lift (delta method), chance to win, expected loss ("risk"), credible interval, optional informative prior |
| **Variance reduction** | CUPED, from raw rows or from SQL aggregates |
| **Bootstrap** | Percentile CI and p-value for the difference in means (sanity check for revenue) |
| **Peeking and A/A** | p-value / chance-to-win over time; 300 A/A tests comparing "look once" vs "stop at first win" for both frameworks |
| **Power calculator** | Sample size, duration, power curve for proportions and means |
| **BigQuery source** | Load an experiment table (`control` / `treatment`) and run the same analysis on real aggregates; bundled sample data lets anyone try it without a Google account |

The result row mimics GrowthBook: control and treatment values, chance to win, and a violin of the relative change
(red below zero, green above).

## Quick start

Requirements: **Node 22** (`nvm use` reads `.nvmrc`) and Yarn.

```bash
yarn install
yarn dev        # simulator only, http://localhost:3002
```

To use the BigQuery source as well, run the UI and the local API together:

```bash
yarn start      # UI on :3002 and API on :3003
```

## BigQuery (optional)

The BigQuery view works out of the box: when BigQuery is not connected it automatically falls back to bundled sample data
([`src/bq/demo-summaries.json`](src/bq/demo-summaries.json), `yarn demo-data`), so no Google account or keys are needed.
The UI says so whenever sample data is shown.

To use your own project: run [`docs/bigquery/setup.sql`](docs/bigquery/setup.sql) in the BigQuery console (it creates four
dummy tables: `users` +15%, `users_loss` -15%, `users_aa` 0%, `users_small` +3%), run `gcloud auth application-default login`,
then `yarn start` and pick **Data source → BigQuery**. Credentials stay in `~/.config/gcloud`, never in the repo or the browser.
Step-by-step details are in [`GUIDE.md`](GUIDE.md#5-the-bigquery-source).

## Project structure

```
src/
  stats/        z-test, Welch, Bayesian, CUPED, bootstrap, power (pure TypeScript, unit tested)
  sim/          seeded RNG, bucketing, user simulation, A/A runner
  bq/           client for the local API
  components/   Experiment / Power tabs, result row, panels
server/         local BigQuery API (aggregates only) and SQL builder
docs/bigquery/  setup.sql for the dummy tables
GUIDE.md        walkthrough of every control and number, with exercises
```

## Scripts

| Command | Purpose |
|---|---|
| `yarn dev` | UI only (simulator) |
| `yarn server` | BigQuery API only |
| `yarn start` | UI and API together |
| `yarn demo-data` | Regenerate the bundled sample data (`src/bq/demo-summaries.json`) |
| `yarn test` | Vitest (statistics, simulator, SQL builder, rendering) |
| `yarn lint` / `yarn build` | ESLint / type-check and production build |

## Limitations and ideas

- The effect is the same for every user; no segments, seasonality or multiple metrics at once.
- The Bayesian engine is Gaussian (like GrowthBook), so it is rougher for samples of a few dozen users.
- BigQuery mode has no time dimension, so peeking, A/A and bootstrap are simulator-only.
- Ideas: sequential testing (always-valid p-values), multiple-comparison corrections, real GA4 export as the source,
  timestamps in the dummy table so peeking works on real data.
