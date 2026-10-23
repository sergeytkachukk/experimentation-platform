import { describe, expect, it } from 'vitest'
import { analyze, computeCuped } from '../analysis.ts'
import { runAATests, simulate } from './simulate.ts'
import type { SimParams } from './simulate.ts'

const base: SimParams = {
  metric: 'conversion',
  users: 4000,
  baseline: 0.1,
  relativeEffect: 0,
  treatmentShare: 0.5,
  actualTreatmentShare: 0.5,
  avgOrderValue: 50,
  orderSigma: 1,
  preCorrelation: 0.5,
  seed: 1,
  alpha: 0.05,
  checkpoints: 20,
}

const opts = (p: SimParams, cuped = false) => ({ metric: p.metric, alpha: p.alpha, priorSd: null, cuped })
const run = (p: SimParams, cuped = false) => {
  const sim = simulate(p)
  return { sim, a: analyze(sim, opts(p, cuped), computeCuped(sim)) }
}

describe('simulate', () => {
  it('is reproducible for the same seed', () => {
    expect(run(base).a.freq.pValue).toBe(run(base).a.freq.pValue)
  })
  it('detects a large real effect (frequentist and Bayesian agree)', () => {
    const { a } = run({ ...base, users: 20000, relativeEffect: 0.3 })
    expect(a.freq.pValue).toBeLessThan(0.01)
    expect(a.bayes.chanceToWin).toBeGreaterThan(0.99)
  })
  it('flags SRM when actual split differs from intended', () => {
    const { sim } = run({ ...base, users: 20000, actualTreatmentShare: 0.55 })
    expect(sim.srmPValue).toBeLessThan(0.001)
  })
  it('A/A: peeking inflates false positives for both frequentist and Bayesian', () => {
    const fp = runAATests(base, 300)
    expect(fp.freqFixed).toBeLessThan(0.1)
    expect(fp.freqPeeking).toBeGreaterThan(fp.freqFixed)
    expect(fp.bayesPeeking).toBeGreaterThan(fp.bayesFixed)
  })
  it('revenue metric runs through Welch test', () => {
    const { a } = run({ ...base, metric: 'revenue', relativeEffect: 0.2, users: 20000 })
    expect(a.testName).toBe("Welch's t-test")
    expect(Number.isFinite(a.freq.pValue)).toBe(true)
  })
  it('CUPED shrinks the CI without moving the estimate much, variance reduction ~ rho^2', () => {
    const p: SimParams = { ...base, users: 30000, relativeEffect: 0.1, baseline: 0.3, preCorrelation: 0.7 }
    const sim = simulate(p)
    const cuped = computeCuped(sim)
    const raw = analyze(sim, opts(p, false), cuped)
    const adj = analyze(sim, opts(p, true), cuped)
    expect(adj.freq.ci[1] - adj.freq.ci[0]).toBeLessThan(raw.freq.ci[1] - raw.freq.ci[0])
    expect(cuped.varianceReduction).toBeGreaterThan(0.05) // binary outcomes lose most of the latent correlation
    expect(Math.abs(adj.freq.diff - raw.freq.diff)).toBeLessThan(0.02)
  })
})

describe('bucketing', () => {
  it('does not produce fake SRM across many seeds', () => {
    let flagged = 0
    for (let seed = 1; seed <= 100; seed++) {
      if (simulate({ ...base, users: 10000, seed }, { keepData: false }).srmPValue < 0.001) flagged++
    }
    expect(flagged).toBeLessThanOrEqual(1) // expected 0.1 on average
  })
})
