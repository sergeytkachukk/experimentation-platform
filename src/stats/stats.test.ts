import { describe, expect, it } from 'vitest'
import { normalCdf, normalInv, tCdf } from './distributions.ts'
import { sampleSizePerVariant, summarize, welchTTest, zTestProportions } from './tests.ts'

describe('distributions', () => {
  it('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4)
  })
  it('normalInv inverts normalCdf', () => {
    expect(normalInv(0.975)).toBeCloseTo(1.95996, 4)
    expect(normalCdf(normalInv(0.3))).toBeCloseTo(0.3, 6)
  })
  it('tCdf matches known values', () => {
    expect(tCdf(0, 10)).toBeCloseTo(0.5, 8)
    expect(tCdf(2.228, 10)).toBeCloseTo(0.975, 3) // t_{0.975,10} = 2.228
    expect(tCdf(1.96, 100000)).toBeCloseTo(0.975, 3)
  })
})

describe('tests', () => {
  it('z-test: 10% vs 12% with n=2000 each', () => {
    const r = zTestProportions({ n: 2000, successes: 200 }, { n: 2000, successes: 240 })
    expect(r.diff).toBeCloseTo(0.02, 10)
    expect(r.uplift).toBeCloseTo(0.2, 10)
    expect(r.statistic).toBeCloseTo(2.0213, 3)
    expect(r.pValue).toBeCloseTo(0.0432, 3)
  })
  it('z-test: identical groups give p = 1', () => {
    const r = zTestProportions({ n: 1000, successes: 100 }, { n: 1000, successes: 100 })
    expect(r.pValue).toBeCloseTo(1, 6)
  })
  it('Welch t-test: known example', () => {
    const r = welchTTest({ n: 30, mean: 10, variance: 4 }, { n: 30, mean: 11, variance: 4 })
    expect(r.statistic).toBeCloseTo(1.9365, 3)
    expect(r.pValue).toBeCloseTo(0.0577, 2)
  })
  it('sample size: 10% baseline, 10% relative MDE, ~14.7k per variant', () => {
    const n = sampleSizePerVariant(0.1, 0.1)
    expect(n).toBeGreaterThan(14000)
    expect(n).toBeLessThan(15500)
  })
  it('summarize computes mean and variance', () => {
    const s = summarize([2, 4, 4, 4, 5, 5, 7, 9])
    expect(s.mean).toBe(5)
    expect(s.variance).toBeCloseTo(32 / 7, 10)
  })
})
