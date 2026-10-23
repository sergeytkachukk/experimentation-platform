import { normalCdf, normalInv, tCdf, tInv } from './distributions.ts'

export interface ProportionSample {
  n: number
  successes: number
}

export interface MeanSample {
  n: number
  mean: number
  variance: number // sample variance (n - 1 denominator)
}

export interface TestResult {
  controlRate: number
  treatmentRate: number
  diff: number // treatment - control, absolute
  uplift: number // diff / control, relative
  statistic: number
  pValue: number // two-sided
  ci: [number, number] // CI for the absolute diff
}

// Two-proportion z-test with unpooled SE for the CI and pooled SE for the test statistic.
export function zTestProportions(control: ProportionSample, treatment: ProportionSample, alpha = 0.05): TestResult {
  const p1 = control.successes / control.n
  const p2 = treatment.successes / treatment.n
  const diff = p2 - p1
  const pooled = (control.successes + treatment.successes) / (control.n + treatment.n)
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / control.n + 1 / treatment.n))
  const z = sePooled === 0 ? 0 : diff / sePooled
  const seUnpooled = Math.sqrt((p1 * (1 - p1)) / control.n + (p2 * (1 - p2)) / treatment.n)
  const zCrit = normalInv(1 - alpha / 2)
  return {
    controlRate: p1,
    treatmentRate: p2,
    diff,
    uplift: p1 === 0 ? NaN : diff / p1,
    statistic: z,
    pValue: 2 * (1 - normalCdf(Math.abs(z))),
    ci: [diff - zCrit * seUnpooled, diff + zCrit * seUnpooled],
  }
}

// Welch's t-test for means (e.g. revenue per user), does not assume equal variances.
export function welchTTest(control: MeanSample, treatment: MeanSample, alpha = 0.05, withCi = true): TestResult {
  const v1 = control.variance / control.n
  const v2 = treatment.variance / treatment.n
  const diff = treatment.mean - control.mean
  const se = Math.sqrt(v1 + v2)
  const t = se === 0 ? 0 : diff / se
  const df = se === 0 ? 1 : (v1 + v2) ** 2 / (v1 ** 2 / (control.n - 1) + v2 ** 2 / (treatment.n - 1))
  // tInv is a bisection, so callers that only need the p-value (e.g. peeking paths) can skip it
  const tCrit = withCi ? tInv(1 - alpha / 2, df) : NaN
  return {
    controlRate: control.mean,
    treatmentRate: treatment.mean,
    diff,
    uplift: control.mean === 0 ? NaN : diff / control.mean,
    statistic: t,
    pValue: 2 * (1 - tCdf(Math.abs(t), df)),
    ci: [diff - tCrit * se, diff + tCrit * se],
  }
}

// Sample size per variant for a two-sided two-proportion test.
export function sampleSizePerVariant(baseline: number, mde: number, alpha = 0.05, power = 0.8): number {
  const p1 = baseline
  const p2 = baseline * (1 + mde)
  const zA = normalInv(1 - alpha / 2)
  const zB = normalInv(power)
  const pBar = (p1 + p2) / 2
  const num = (zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
  return Math.ceil(num / (p2 - p1) ** 2)
}

// Sample mean and unbiased variance via Welford's algorithm.
export function summarize(values: ArrayLike<number>): MeanSample {
  let n = 0
  let mean = 0
  let m2 = 0
  for (let i = 0; i < values.length; i++) {
    n++
    const delta = values[i] - mean
    mean += delta / n
    m2 += delta * (values[i] - mean)
  }
  return { n, mean, variance: n > 1 ? m2 / (n - 1) : 0 }
}

// Power of a two-sided two-proportion test with `n` users per variant.
export function powerProportions(n: number, baseline: number, mde: number, alpha = 0.05): number {
  const p1 = baseline
  const p2 = baseline * (1 + mde)
  const delta = Math.abs(p2 - p1)
  const zA = normalInv(1 - alpha / 2)
  const pBar = (p1 + p2) / 2
  const se0 = Math.sqrt((2 * pBar * (1 - pBar)) / n)
  const se1 = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / n)
  return normalCdf((delta - zA * se0) / se1) + normalCdf((-delta - zA * se0) / se1)
}

// Sample size per variant for a two-sided test on means with a common standard deviation.
export function sampleSizeMeans(sd: number, absDelta: number, alpha = 0.05, power = 0.8): number {
  const zA = normalInv(1 - alpha / 2)
  const zB = normalInv(power)
  return Math.ceil((2 * (zA + zB) ** 2 * sd ** 2) / absDelta ** 2)
}

export function powerMeans(n: number, sd: number, absDelta: number, alpha = 0.05): number {
  const zA = normalInv(1 - alpha / 2)
  const se = sd * Math.sqrt(2 / n)
  return normalCdf(absDelta / se - zA) + normalCdf(-absDelta / se - zA)
}
