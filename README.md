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

## Using BigQuery (optional)

1. Create a Google Cloud project and open BigQuery (the free tier is plenty).
2. Run [`docs/bigquery/setup.sql`](docs/bigquery/setup.sql) in the BigQuery console. It creates 100,000 dummy users and four
   tables with different built-in effects on purchase rate: `users` (+15%), `users_loss` (-15%), `users_aa` (0%), `users_small` (+3%).
   Pick a table in the app to compare a win, a loss, a null result and a small effect.
3. Log in locally so the API can read the table:
   ```bash
   gcloud auth application-default login
   ```
4. `yarn start`, then choose **Data source → BigQuery** and press **Load data**.

**No Google account? Nothing to set up.** If BigQuery is not connected, the BigQuery view automatically falls back to pre-computed
aggregates for the same four tables from [`src/bq/demo-summaries.json`](src/bq/demo-summaries.json), generated locally with the recipe
of `setup.sql` (`yarn demo-data`). It says so in the UI, nothing leaves your machine, and it also works on a static host. The
**Use bundled sample data** checkbox forces this mode.

The API resolves the project from your Application Default Credentials. Override with `BQ_PROJECT`, `BQ_DATASET`
(default `ab_sandbox`) or `PORT` (default `3003`). Credentials stay in `~/.config/gcloud`, never in the repo or the browser.

## How it fits together

```
 Browser (React)  ──►  Vite dev server :3002  ──/api──►  server/index.ts :3003  ──SQL──►  BigQuery
   │                                                          │
   │ z-test, Welch, Bayesian, CUPED run here                  └─ returns per-variant aggregates only
   ▼                                                             (n, mean, variance, cov with pre-period)
 Simulator generates users in the browser
```

BigQuery does the heavy lifting with one `GROUP BY variant`. The browser receives two rows and runs the same
statistics code as in simulator mode.

## Project structure

```
src/
  stats/        z-test, Welch, Bayesian, CUPED, bootstrap, power (pure TypeScript, unit tested)
  sim/          seeded RNG, bucketing, user simulation, A/A runner
  bq/           client for the local API
  components/   Experiment / Power tabs, result row, panels
server/         local BigQuery API (aggregates only) and SQL builder
docs/           Russian guide (GUIDE.ru.md + PDF), BigQuery setup SQL, PDF build scripts (GUIDE.md, the English guide, is in the repo root)
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

## Learning material

[`GUIDE.md`](GUIDE.md) walks through every control and number, with exercises (a Russian version is in
[`docs/GUIDE.ru.md`](docs/GUIDE.ru.md)). A Russian PDF version with charts and a glossary is in
[`docs/AB-sandbox-guide.pdf`](docs/AB-sandbox-guide.pdf).
