# How to use the A/B test sandbox

This is a learning sandbox. The main idea: **you set the truth** (for example, "variant B converts 10% better"), the app generates fake users, and then the statistics try to guess that truth. You see when they guess right, when they get it wrong, and why.

In a real test you can never know the truth. Here you can, and that is the whole value: you can always compare "what is really going on" with "what the test showed".

Run it with `nvm use` (Node 22 is required), then:

- `yarn dev`: UI with the simulator only, at http://localhost:3002;
- `yarn start`: UI plus the local BigQuery server (needed for the BigQuery source, see section 5).

---

## 1. Quick start (2 minutes)

1. Open the **Experiment** tab. Settings are on the left; on the right there are three sub-tabs: **Results**, **Peeking & A/A**, **CUPED & Bootstrap**.
2. Defaults: Simulator, conversion 10%, true effect +10% (that is, 10% → 11%), 10,000 users.
3. On **Results** you first see a plain-words verdict ("No clear difference") and a GrowthBook-style **result row**: control and treatment values, chance to win ≈ 86%, and a green/red chart of the change.
4. Below is the **Frequentist** card: p-value about 0.26, "not significant". The effect is real, and that is fine: the sample is small and the test lacks power (see exercise 1).
5. Next to it is the **Bayesian** card: chance to win about 86%. Same data, a different question.
6. Press **New run**. This changes the seed, i.e. the random users. The result is a bit different every time. That is what noise looks like.

---

## 2. The left panel: every control

Almost every slider has a **number box** next to it: drag the slider for a feel, or type an exact value (Enter or clicking away confirms; a value outside the range is clamped to the nearest limit).

**Main settings (always visible):**

| Control                                     | What it does                                                                                                           | What it affects                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Data source**                             | Where the data comes from: **Simulator** (generated in the browser) or **BigQuery** (read from a table, see section 5) | Which fields and tabs are shown                                            |
| **Metric**                                  | Metric type: Conversion, Click, Revenue per user (BigQuery supports Conversion and Revenue only)                       | Determines the statistical test (see below)                                |
| **Users**                                   | How many users take part (200 to **300,000**)                                                                          | More users: narrower intervals, less noise, more power                     |
| **Baseline rate**                           | The metric in control, where nothing was changed (called Purchase rate for revenue)                                    | The scale of the metric. The lower it is, the more users you need          |
| **True effect (relative)**                  | The real relative effect. +10% at a 10% baseline means 10% → 11%                                                       | This is the "truth" the test has to find. 0% gives an A/A test             |
| **Average order value**, **Tail heaviness** | Revenue only: mean order value and "tail heaviness" (sigma)                                                            | The larger the sigma, the more rare huge orders and the noisier the metric |
| **New run**                                 | Sets a random seed                                                                                                     | Everything in the results is recalculated                                  |

**Advanced settings** (a collapsible block, needed less often):

| Control                               | What it does                                                                                                                  | What it affects                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Treatment share (planned)**         | The plan: what share of traffic goes to treatment                                                                             | Also sets the actual share                                                                  |
| **Treatment share (actual, for SRM)** | The share that really landed in treatment (simulator only)                                                                    | If it differs from the plan, the SRM alert fires                                            |
| **Pre-experiment correlation**        | How similar a user's behaviour before the test is to their behaviour during it (simulator only)                               | CUPED only. The real correlation is shown in the CUPED panel and is lower                   |
| **Alpha**                             | Significance threshold (0.01 / 0.05 / 0.1)                                                                                    | The p-value threshold, interval width (1 − alpha), red lines on charts, A/A criteria, power |
| **Seed**                              | The "randomness" number. Same seed → same users (simulator only)                                                              | Reproducibility                                                                             |
| **Apply CUPED**                       | Switches the analysis to CUPED-adjusted data                                                                                  | Results and bootstrap                                                                       |
| **Informative Bayesian prior**        | Turns on a prior: "before the test I believe the effect is close to zero". The sd slider: the smaller, the stricter the prior | Bayesian numbers only                                                                       |

Good to know:

- **Conversion and Click** work the same way in the simulation (yes/no per user). The only difference is the name, so you can think about different metrics.
- **Revenue**: a user buys with probability baseline, and the order value is random with a heavy tail. The effect changes **only the purchase probability**, not the order value. Revenue per user is about rate × order value on average.
- At 300,000 users a recalculation takes a fraction of a second: the results dim briefly and then refresh.
- If you keep the seed and move the effect slider, the random numbers stay almost the same, so you see the change caused by the parameter and not by noise. To see noise, press New run.

---

## 3. Results: what every number means

### The Results tab, top to bottom

1. **Summary bar**: Source (Simulator or BigQuery), **Total users** (both groups together), CUPED (on or off), Prior (flat or with a given sd), SRM (OK or Problem).
2. **Verdict banner**: "Treatment wins", "Treatment loses", "No clear difference", or an SRM warning. A quick answer to "what did the test show?".
3. **GrowthBook-style result row** (values on top, a full-width chart below):

| Column                    | What it means                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal metric               | The metric name                                                                                                                                                                                                                                                                                                               |
| Control, Treatment        | The metric in the group and, underneath, "buyers / users" (for revenue and after CUPED: the number of users)                                                                                                                                                                                                                  |
| Chance to win             | The probability that treatment is better. Green at ≥ 95%, red at ≤ 5%                                                                                                                                                                                                                                                         |
| % change                  | The expected relative change with an up or down arrow (red when negative)                                                                                                                                                                                                                                                     |
| "Change vs control" chart | A "violin": the distribution of the relative change. **The red part to the left of zero**: treatment is worse. **The green part to the right of zero**: treatment is better. A white line marks zero and a short tick inside marks the expected value. The larger the area to the right of zero, the higher the chance to win |

A narrow, fully green violin means a confident result. A violin that straddles zero means there is not enough data.

4. The **Frequentist** and **Bayesian** cards with the detailed numbers, described below. Long explanations are folded behind "How to read this".

### The Frequentist card

The question it answers: _"If there is really no effect, how surprising is this data?"_

- **Control / Treatment (n=…)**: the metric and the group size. Groups are almost never exactly 50/50, and that is normal (hash-based assignment).
- **Uplift**: the relative difference (Treatment − Control) / Control. This is the **measured** effect and it is noisy. The true effect is what you set with the slider.
- **p-value**: the probability of seeing a difference at least as large as the observed one **if there is no real effect**. Green when p < alpha and treatment is better, red when it is significant but treatment is worse. The p-value is **not** the probability that variant B is better.
- **CI (absolute diff)**: the interval for the absolute difference (in metric points, not a percent of baseline). If the interval includes 0, then p ≥ alpha, and vice versa.
- **SRM p-value**: a check that the actual split matches the planned one. Red at p < 0.001. If it is red, **do not trust the results**: something is wrong with how users were assigned (in real life: a code bug, bots or redirects).
- The card title shows the test: **z-test** for conversion/click, **Welch t-test** for revenue and for CUPED-adjusted data.
- The line at the bottom estimates how many users you need to detect the chosen effect with 80% power. Compare it with your Users.

### The Bayesian card

The question: _"Given the data, what is the probability that B beats A, and how much do I lose if I am wrong?"_ The method is the same as in GrowthBook.

- **Chance to win**: the probability that treatment is better than control. Green at ≥ 95%, red at ≤ 5%.
- **Expected uplift**: the average expected relative effect. This is the "best estimate" taking the prior into account.
- **Credible interval**: with probability (1 − alpha) the true relative effect lies inside. Unlike a frequentist CI, you can read this literally.
- **Risk if you ship treatment**: how much you lose on average (as a % of the metric) if you ship B and it is actually worse. Green below 0.25% (the GrowthBook threshold).
- **Risk if you keep control**: how much you forgo if you keep A and B is better.
- **Verdict**: a plain-words reading of chance to win.

Why Bayesian is convenient: instead of a binary "significant / not significant" you get the price of the decision. For example, a chance to win of 86% with a risk of 0.4% may be acceptable in practice if the release is cheap and easy to roll back.

About the prior: an informative prior pulls estimates toward zero, especially with little data. Turn it on and you will see chance to win move closer to 50% and the interval narrow. With a lot of data the prior stops mattering.

### The CUPED & Bootstrap tab: the CUPED panel

CUPED uses what you knew about users **before** the test to subtract the predictable part of the noise from the metric.

- **corr(pre, post)**: the real correlation of the metric before and during the test. The higher it is, the stronger the effect.
- **theta**: the coefficient by which the "pre-test" metric is subtracted.
- **Variance removed**: the share of variance CUPED removed (roughly corr²).
- **CI width without / with CUPED**: the interval width. With CUPED it should be narrower: the same amount of data with less noise.

Important: the "Pre-experiment correlation" slider sets a "hidden" correlation. The real correlation for binary metrics (conversion) and for revenue is noticeably lower. For example, at slider 0.9 conversion ends up around 0.52 and revenue around 0.48.

### The Peeking & A/A tab: the "Results over time" chart

It shows how the result changed as users arrived (40 "peeks"). A switch at the top:

- **p-value**: a red dashed line at alpha. If the line dips below it, the test "looked significant" at that moment.
- **Chance to win**: a green line at 95% and a red one at 5%.

The point: **stopping the test at the first lucky moment**, called peeking, produces false wins. On data with no effect the line often crosses the threshold by chance. The chart uses raw data (no CUPED).

### The Bootstrap panel (same tab)

The **Run 1000 resamples** button (with very large samples the number of resamples is reduced, and the button says how many): 1000 times it draws a sample with replacement from each group and computes the difference of means. You get:

- **Bootstrap diff / percentile CI / p-value**: the same as in frequentist, but without assuming normality.
- **Parametric p-value**: for comparison, the p-value from the Frequentist card.
- **Histogram**: the distribution of differences. The red line is 0. The further the histogram sits to the right of zero, the stronger the effect.

It matters mostly for heavy-tailed revenue. If a "Parameters changed" message appears after you edit settings, press the button again.

### The A/A panel (Peeking & A/A tab)

The **Run 300 A/A tests** button runs 300 tests with **no real effect** using the current settings (baseline, metric, alpha; at most 20,000 users per test to keep it fast) and counts false wins. Progress is shown on the button (for example "Running… 120/300").

A typical result with default settings:

|                                        | Look once at the end                | Stop at the first significant peek |
| -------------------------------------- | ----------------------------------- | ---------------------------------- |
| Frequentist (p < alpha)                | ≈ 4–5% (as promised: that is alpha) | ≈ 30%                              |
| Bayesian (chance to win ≥ 95% or ≤ 5%) | ≈ 9% (two "tails", so twice alpha)  | ≈ 50%                              |

The takeaway: if you look once at a pre-planned time, you get exactly as many false wins as promised. If you peek and stop at the first lucky moment, you get many times more false wins, **and being Bayesian does not save you**.

---

## 4. How everything is connected

| What you change                  | What happens to the results                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ↑ **Users**                      | Narrower intervals, lower p-value (if there is an effect), chance to win closer to 100% or 0%, more power                                         |
| ↑ **True effect**                | Larger measured uplift on average, lower p-value, higher chance to win. A single run can still fall short                                         |
| True effect = 0                  | This is A/A. The p-value should look "random" and chance to win wanders around 50%. The ideal mode for checking peeking                           |
| ↓ **Baseline**                   | Fewer events → more noise → more users needed                                                                                                     |
| **Actual share** ≠ planned       | SRM p-value turns red. The other numbers may look fine, but they cannot be trusted                                                                |
| ↑ **Tail heaviness** (revenue)   | Huge variance, wide intervals, t-test and bootstrap disagree more                                                                                 |
| ↑ **Pre-experiment correlation** | A stronger CUPED effect (if "Apply CUPED" is on)                                                                                                  |
| **Alpha**                        | Changes the significance threshold and interval width. Chance to win itself does not change, but the credible interval and the A/A criterion do   |
| **Informative prior**            | Bayesian numbers and the chance-to-win chart only; frequentist is untouched                                                                       |
| **Apply CUPED**                  | Both cards and bootstrap use the adjusted data. The peeking chart stays on raw data                                                               |
| **New run** / **Seed**           | Same parameters, different random users                                                                                                           |
| **Data source = BigQuery**       | Users, Baseline, True effect, Seed, the peeking chart, A/A and bootstrap are unavailable: the data and the "truth" are already fixed in the table |

---

## 5. The BigQuery source

Besides the simulator you can analyse a **real table** in Google BigQuery.

```
 Browser ──► yarn dev :3002 ──/api──► yarn server :3003 ──SQL──► BigQuery (ab_sandbox.users)
    ▲                                        │
    └────── 2 rows: control and treatment ───┘   (n, mean, variance, covariance with the pre-test metric)
```

BigQuery computes the per-group totals itself with one `GROUP BY variant` query, so the browser receives just two rows instead of 100,000 users. Your Google keys stay on your computer and never reach the browser.

**How to set it up:**

1. Create a Google Cloud project and open BigQuery.
2. Run the script `docs/bigquery/setup.sql` in the BigQuery console. It creates 100,000 "users" and four tables with different built-in effects on the purchase rate:

| Table         | Built-in effect | What the app shows                                              |
| ------------- | --------------- | --------------------------------------------------------------- |
| `users`       | +15%            | a clear win                                                     |
| `users_loss`  | −15%            | a clear loss (red violin)                                       |
| `users_aa`    | 0%              | no real difference (A/A)                                        |
| `users_small` | +3%             | a real but tiny effect, usually "not significant" at 100k users |

3. Log in locally: `gcloud auth application-default login`.
4. Run `yarn start` (UI and server together).
5. In the app: **Data source → BigQuery**, type or pick a table name (suggestions appear), then **Load data**.

**What you will see** for the `users` table (numbers differ slightly each time the table is created): conversion around 10.1% in control and 11.4% in treatment, uplift ≈ +13%, p < 0.0001, chance to win 100%, "Treatment wins". On revenue the result is borderline (≈ +6%, p ≈ 0.045): revenue is noisy.

**What is unavailable in this mode:** the peeking chart and A/A (the table has no time dimension) and bootstrap (it needs per-user rows). CUPED works: it can be computed from the SQL totals.

**If something goes wrong:** "Cannot reach the BigQuery API" means `yarn server` is not running (or just run `yarn start`); "Google credentials not found" means you need to run `gcloud auth application-default login` and restart the server.

---

## 6. The Power calculator tab

It answers _"how many users do I need before launching the test?"_. This is the most important thing to do **before** an experiment.

- **Metric type**: Proportion (conversion, click) or Mean (revenue, time on site). For a mean, enter the mean and the standard deviation.
- **Baseline rate** (or mean + sd): the current value of the metric.
- **Minimum detectable effect (relative)**: the smallest effect you care about not missing. The smaller it is, the more users you need. Halving the MDE roughly quadruples the sample.
- **Alpha**: the acceptable rate of false positives (usually 0.05).
- **Power**: the probability of catching the effect if it exists (usually 80%).
- **Eligible users per day**: how many users per day you can put into the test (both variants together).

The results: **Per variant** and **Total** are the sample size; **Duration** is how many days the test must run; the **Power vs sample size chart** shows how power grows with the sample (the target is dashed); the **table** shows the same numbers for several MDEs at once.

A check against the Experiment tab: baseline 10%, MDE 10%, power 80% → ≈14,750 per variant, ≈29,500 in total. That is why, with the default 10,000 users, the test cannot see the effect.

---

## 7. Exercises

Press **New run** several times and look at the spread. A single value proves nothing.

1. **Not enough power.** Default settings. The effect is real (+10%), yet p ≈ 0.26. Raise Users to 30,000 and press New run several times: the test should come out significant in about 80% of runs. That is what "80% power" means.
2. **A/A.** Effect 0%. Press New run 10 times: how many times is p < 0.05? Then run the A/A panel and compare "look once at the end" with "peeking".
3. **Peeking live.** Effect 0%, Users 20,000, the **Peeking & A/A** tab. Press New run and watch the p-value chart: it sometimes dives under the red line and comes back by the end. If you had stopped the test there, you would have a false win.
4. **SRM.** Open **Advanced settings** and set Treatment share (actual) to 55%. The SRM p-value turns red (≈0.00000, groups of about 4,500 and 5,500) while the effect's p-value may still look respectable. Takeaway: check SRM first, then look at the result.
5. **CUPED.** Metric: Conversion, Users 20,000; in Advanced settings set Pre-experiment correlation to 0.9. With CUPED off, p ≈ 0.077; with it on, ≈ 0.019. Look at the CUPED & Bootstrap tab: the real correlation is ≈ 0.52 and ≈ 27% of the variance is removed. Same data, but the test became more sensitive.
6. **Heavy-tailed revenue.** Metric: Revenue, Users 3,000, Tail heaviness 2.0, Pre-experiment correlation 0.5. The measured uplift is huge (about +58%), yet p ≈ 0.15 and the interval runs from about −0.8 to +5.0. On the CUPED & Bootstrap tab press Run 1000 resamples: bootstrap gives a similar picture (p ≈ 0.14). Takeaway: revenue is a very noisy metric, and a "nice" number without an interval means nothing.
7. **Prior.** Default settings; in Advanced settings turn on Informative Bayesian prior and move sd from 1 down to 0.05: the smaller it is, the more chance to win and expected uplift are pulled toward 50% and 0%.
8. **A loss and a false win.** Simulator, Conversion, Baseline 10%, Seed 1 (Advanced settings).
   - _A clear loss:_ Users 40,000, True effect −15%. You get "Treatment loses", 10.04% → 8.38%, chance to win 0%, an all-red violin.
   - _A false win:_ Users 10,000, True effect 0%, Seed 26 (then 75). There is no real effect, yet the app declares a winner (+13.2%, p = 0.036). That is a type I error. About 5% of A/A runs behave like this.

---

## 8. Common interpretation mistakes

- **"p = 0.04, so B is better with 96% probability"**: no. That is the probability of such data when there is no effect. The probability that "B is better" comes from Bayesian.
- **"p = 0.26, so there is no effect"**: no. It means the test could not tell the effect from noise. Look at the interval and the power.
- **"Let's stop the test as soon as it becomes significant"**: that is peeking, and it inflates false wins (see the A/A panel).
- **"Bayesian does not suffer from peeking"**: it does, if you stop at a threshold.
- **One run is not a conclusion**: look at many runs (New run, the A/A panel).
- **Ignoring SRM**: if it is red, nothing else matters.
- **A big uplift without an interval**: see exercise 6.

---

## 9. Limitations

- The effect is the same for every user; there are no segments.
- There is no drift over time or seasonality: all users "arrive" from the same distribution.
- There are no multiple comparisons or several metrics at once.
- The Bayesian engine uses a Gaussian approximation (like GrowthBook), not an exact beta distribution, so it is rougher on very small samples (tens of users).
- The peeking chart and A/A use raw data; CUPED is not applied there.
- In BigQuery mode there is no time dimension, so there is no peeking, A/A or bootstrap; the metrics are defined by the columns of the tables (`converted`, `revenue`).
