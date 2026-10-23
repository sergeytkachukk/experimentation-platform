import { describe, expect, it } from 'vitest'
import { bayesianRelative } from './bayes.ts'
import { bootstrapMeanDiff } from './bootstrap.ts'
import { cupedAdjust } from './cuped.ts'
import { createRng, normalSample } from '../sim/rng.ts'
import { powerMeans, powerProportions, sampleSizeMeans, sampleSizePerVariant } from './tests.ts'

describe('bayesian', () => {
  const sample = (mean: number) => ({ n: 5000, mean, variance: mean * (1 - mean) })
  it('equal groups: chance to win is 0.5 and CI is centered at zero', () => {
    const b = bayesianRelative(sample(0.1), sample(0.1))
    expect(b.chanceToWin).toBeCloseTo(0.5, 6)
    expect(b.relativeEffect).toBeCloseTo(0, 10)
  })
  it('clear winner: high chance to win, low risk for treatment', () => {
    const b = bayesianRelative(sample(0.1), sample(0.13))
    expect(b.chanceToWin).toBeGreaterThan(0.99)
    expect(b.riskTreatment).toBeLessThan(0.001)
    expect(b.riskControl).toBeGreaterThan(0.2)
  })
  it('informative prior shrinks the estimate toward zero', () => {
    const flat = bayesianRelative(sample(0.1), sample(0.12))
    const shrunk = bayesianRelative(sample(0.1), sample(0.12), { priorSd: 0.05 })
    expect(Math.abs(shrunk.relativeEffect)).toBeLessThan(Math.abs(flat.relativeEffect))
    expect(shrunk.sd).toBeLessThan(flat.sd)
  })
  it('risk of shipping + risk of keeping are consistent with E|X| identities', () => {
    const b = bayesianRelative(sample(0.1), sample(0.11))
    // E[max(X,0)] - E[max(-X,0)] = mean
    expect(b.riskControl - b.riskTreatment).toBeCloseTo(b.relativeEffect, 10)
  })
})

describe('cuped', () => {
  it('removes about rho^2 of the variance and preserves the mean', () => {
    const rng = createRng(7)
    const rho = 0.8
    const gen = (n: number, shift: number) => {
      const x: number[] = []
      const y: number[] = []
      for (let i = 0; i < n; i++) {
        const xi = normalSample(rng)
        x.push(xi)
        y.push(shift + rho * xi + Math.sqrt(1 - rho * rho) * normalSample(rng))
      }
      return { x, y }
    }
    const c = gen(20000, 0)
    const t = gen(20000, 0.1)
    const r = cupedAdjust(c, t)
    expect(r.varianceReduction).toBeCloseTo(rho * rho, 1)
    expect(r.correlation).toBeCloseTo(rho, 1)
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    expect(mean(r.treatment) - mean(r.control)).toBeCloseTo(0.1, 1)
  })
})

describe('bootstrap', () => {
  it('detects a clear difference and brackets the true diff', () => {
    const rng = createRng(3)
    const a = Array.from({ length: 2000 }, () => normalSample(rng))
    const b = Array.from({ length: 2000 }, () => normalSample(rng) + 0.3)
    const r = bootstrapMeanDiff(a, b, { resamples: 500 })
    expect(r.pValue).toBeLessThan(0.01)
    expect(r.ci[0]).toBeLessThan(0.3)
    expect(r.ci[1]).toBeGreaterThan(0.3)
  })
  it('no difference: p-value is large', () => {
    const rng = createRng(5)
    const a = Array.from({ length: 1000 }, () => normalSample(rng))
    const b = Array.from({ length: 1000 }, () => normalSample(rng))
    expect(bootstrapMeanDiff(a, b, { resamples: 500 }).pValue).toBeGreaterThan(0.05)
  })
})

describe('power', () => {
  it('power at the computed sample size is ~80%', () => {
    const n = sampleSizePerVariant(0.1, 0.1)
    expect(powerProportions(n, 0.1, 0.1)).toBeCloseTo(0.8, 2)
  })
  it('means: power at computed n is ~80%', () => {
    const n = sampleSizeMeans(10, 1)
    expect(powerMeans(n, 10, 1)).toBeCloseTo(0.8, 2)
  })
  it('power equals alpha when there is no effect', () => {
    expect(powerProportions(1000, 0.1, 0)).toBeCloseTo(0.05, 3)
  })
})

describe('cupedFromSummaries', () => {
  it('matches cupedAdjust computed from user-level rows', async () => {
    const { cupedFromSummaries } = await import('./cuped.ts')
    const { summarize } = await import('./tests.ts')
    const rng = createRng(11)
    const gen = (n: number, shift: number) => {
      const x: number[] = []
      const y: number[] = []
      for (let i = 0; i < n; i++) {
        const xi = 3 + normalSample(rng)
        x.push(xi)
        y.push(shift + 0.6 * xi + normalSample(rng))
      }
      return { x, y }
    }
    const c = gen(5000, 0)
    const t = gen(6000, 0.2)
    const summary = (g: { x: number[]; y: number[] }) => {
      const sx = summarize(g.x)
      const sy = summarize(g.y)
      let cov = 0
      for (let i = 0; i < g.x.length; i++) cov += (g.x[i] - sx.mean) * (g.y[i] - sy.mean)
      return { n: sx.n, mean: sy.mean, variance: sy.variance, meanX: sx.mean, varX: sx.variance, cov: cov / (sx.n - 1) }
    }
    const fromRows = cupedAdjust(c, t)
    const fromAgg = cupedFromSummaries(summary(c), summary(t))
    expect(fromAgg.theta).toBeCloseTo(fromRows.theta, 8)
    expect(fromAgg.correlation).toBeCloseTo(fromRows.correlation, 8)
    expect(fromAgg.varianceReduction).toBeCloseTo(fromRows.varianceReduction, 8)
    expect(fromAgg.control.mean).toBeCloseTo(summarize(fromRows.control).mean, 8)
    expect(fromAgg.treatment.variance).toBeCloseTo(summarize(fromRows.treatment).variance, 8)
  })
})
