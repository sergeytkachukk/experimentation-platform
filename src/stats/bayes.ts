import { normalCdf, normalInv, normalPdf } from './distributions.ts'
import type { MeanSample } from './tests.ts'

export interface BayesOptions {
  priorSd?: number | null // sd of a N(0, priorSd^2) prior on the relative effect; null/undefined = flat prior
  alpha?: number // credible interval is (1 - alpha)
}

export interface BayesResult {
  relativeEffect: number // posterior mean of relative lift, treatment vs control
  sd: number // posterior sd
  chanceToWin: number // P(treatment > control)
  riskTreatment: number // expected relative loss if we ship treatment and it is actually worse
  riskControl: number // expected relative loss if we keep control and treatment is actually better
  ci: [number, number] // credible interval for relative lift
}

// GrowthBook-style Bayesian analysis: the sampling distribution of the relative lift
// (treatment / control - 1) is approximated as Gaussian via the delta method, then combined
// with an optional Gaussian prior. Everything is closed-form, so it is cheap to run at every peek.
export function bayesianRelative(control: MeanSample, treatment: MeanSample, opts: BayesOptions = {}): BayesResult {
  const alpha = opts.alpha ?? 0.05
  const neutral: BayesResult = { relativeEffect: 0, sd: Infinity, chanceToWin: 0.5, riskTreatment: NaN, riskControl: NaN, ci: [NaN, NaN] }
  const mc = control.mean
  if (control.n < 2 || treatment.n < 2 || mc === 0) return neutral

  const vC = control.variance / control.n
  const vT = treatment.variance / treatment.n
  const effect = treatment.mean / mc - 1
  const variance = vT / mc ** 2 + (treatment.mean ** 2 * vC) / mc ** 4
  if (!(variance > 0)) return neutral

  let mean = effect
  let v = variance
  if (opts.priorSd) {
    const precision = 1 / variance + 1 / opts.priorSd ** 2
    v = 1 / precision
    mean = (effect / variance) * v
  }
  const sd = Math.sqrt(v)
  const z = mean / sd
  const zCrit = normalInv(1 - alpha / 2)
  return {
    relativeEffect: mean,
    sd,
    chanceToWin: normalCdf(z),
    // E[max(-X, 0)] and E[max(X, 0)] for X ~ N(mean, sd^2)
    riskTreatment: sd * normalPdf(z) - mean * normalCdf(-z),
    riskControl: sd * normalPdf(z) + mean * normalCdf(z),
    ci: [mean - zCrit * sd, mean + zCrit * sd],
  }
}
