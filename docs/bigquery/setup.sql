-- Dummy A/B experiment for the sandbox. Run the whole script in the BigQuery console
-- (project selector must show your project). Creates dataset ab_sandbox with a table `users`.

CREATE SCHEMA IF NOT EXISTS ab_sandbox;

-- Step A: random numbers per user, stored once (RAND() would be re-evaluated inside a CTE).
-- propensity: every user has their own tendency to buy (mean 10%), so behaviour before the test
-- predicts behaviour during the test. That correlation is what CUPED exploits.
CREATE OR REPLACE TABLE ab_sandbox.users_raw AS
SELECT
  id,
  CONCAT('u', CAST(id AS STRING)) AS user_id,
  IF(RAND() < 0.5, 'treatment', 'control') AS variant,
  LEAST(0.9, 0.10 * EXP(0.8 * (SQRT(-2 * LN(1 - RAND())) * COS(2 * ACOS(-1) * RAND())) - 0.32)) AS propensity,
  RAND() AS u_pre,
  RAND() AS u_post,
  SQRT(-2 * LN(1 - RAND())) * COS(2 * ACOS(-1) * RAND()) AS n_pre,
  SQRT(-2 * LN(1 - RAND())) * COS(2 * ACOS(-1) * RAND()) AS n_post
FROM UNNEST(GENERATE_ARRAY(1, 100000)) AS id;

-- Step B: the experiment table. True effect: treatment buys 15% more often.
-- Order value is lognormal with mean ~50 (sigma = 1), i.e. heavy-tailed like real revenue.
CREATE OR REPLACE TABLE ab_sandbox.users AS
SELECT
  user_id,
  variant,
  u_pre < propensity AS pre_converted,
  u_post < LEAST(1, propensity * IF(variant = 'treatment', 1.15, 1.0)) AS converted,
  IF(u_pre < propensity, EXP(LN(50) - 0.5 + n_pre), 0) AS pre_revenue,
  IF(u_post < LEAST(1, propensity * IF(variant = 'treatment', 1.15, 1.0)), EXP(LN(50) - 0.5 + n_post), 0) AS revenue
FROM ab_sandbox.users_raw;

-- Step C: the same 100,000 users, different "truths". Only the treatment multiplier differs, so any difference
-- between the tables comes from the effect (plus how the random draws fall), not from different people.
--   users        +15% purchase rate  -> clear win
--   users_loss   -15%                -> clear loss (treatment is worse)
--   users_aa     0%                  -> A/A, no real difference
--   users_small  +3%                 -> real but tiny effect, usually "not significant" at 100k users
CREATE OR REPLACE TABLE ab_sandbox.users_loss AS
SELECT
  user_id, variant, u_pre < propensity AS pre_converted,
  u_post < LEAST(1, propensity * IF(variant = 'treatment', 0.85, 1.0)) AS converted,
  IF(u_pre < propensity, EXP(LN(50) - 0.5 + n_pre), 0) AS pre_revenue,
  IF(u_post < LEAST(1, propensity * IF(variant = 'treatment', 0.85, 1.0)), EXP(LN(50) - 0.5 + n_post), 0) AS revenue
FROM ab_sandbox.users_raw;

CREATE OR REPLACE TABLE ab_sandbox.users_aa AS
SELECT
  user_id, variant, u_pre < propensity AS pre_converted,
  u_post < LEAST(1, propensity) AS converted,
  IF(u_pre < propensity, EXP(LN(50) - 0.5 + n_pre), 0) AS pre_revenue,
  IF(u_post < LEAST(1, propensity), EXP(LN(50) - 0.5 + n_post), 0) AS revenue
FROM ab_sandbox.users_raw;

CREATE OR REPLACE TABLE ab_sandbox.users_small AS
SELECT
  user_id, variant, u_pre < propensity AS pre_converted,
  u_post < LEAST(1, propensity * IF(variant = 'treatment', 1.03, 1.0)) AS converted,
  IF(u_pre < propensity, EXP(LN(50) - 0.5 + n_pre), 0) AS pre_revenue,
  IF(u_post < LEAST(1, propensity * IF(variant = 'treatment', 1.03, 1.0)), EXP(LN(50) - 0.5 + n_post), 0) AS revenue
FROM ab_sandbox.users_raw;

-- Sanity check (table `users`): ~50k users per variant, conversion ~0.100 (control) vs ~0.115 (treatment).
-- Check the others by changing the table name: users_loss ~0.085 for treatment, users_aa ~0.100 for both.
SELECT
  variant,
  COUNT(*) AS users,
  ROUND(AVG(CAST(converted AS INT64)), 4) AS conversion,
  ROUND(AVG(revenue), 2) AS revenue_per_user
FROM ab_sandbox.users
GROUP BY variant;
