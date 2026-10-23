import { summarize } from './tests.ts'
import type { MeanSample } from './tests.ts'

export interface PairedData {
  y: ArrayLike<number> // in-experiment metric
  x: ArrayLike<number> // pre-experiment covariate for the same users
}

export interface CupedResult {
  control: number[]
  treatment: number[]
  theta: number
  correlation: number
  varianceReduction: number // 0..1, share of variance removed
}

// CUPED: Y_adj = Y - theta * (X - mean(X)), theta = cov(X, Y) / var(X) over both groups pooled.
// The adjustment has expectation zero under randomization, so the lift stays unbiased while variance shrinks by ~rho^2.
export function cupedAdjust(control: PairedData, treatment: PairedData): CupedResult {
  let n = 0
  let sx = 0
  let sy = 0
  for (const g of [control, treatment]) {
    for (let i = 0; i < g.y.length; i++) {
      n++
      sx += g.x[i]
      sy += g.y[i]
    }
  }
  const mx = sx / n
  const my = sy / n
  let cxy = 0
  let cxx = 0
  let cyy = 0
  for (const g of [control, treatment]) {
    for (let i = 0; i < g.y.length; i++) {
      const dx = g.x[i] - mx
      const dy = g.y[i] - my
      cxy += dx * dy
      cxx += dx * dx
      cyy += dy * dy
    }
  }
  const theta = cxx === 0 ? 0 : cxy / cxx
  const correlation = cxx === 0 || cyy === 0 ? 0 : cxy / Math.sqrt(cxx * cyy)
  const adjust = (g: PairedData) => Array.from({ length: g.y.length }, (_, i) => g.y[i] - theta * (g.x[i] - mx))
  const adjC = adjust(control)
  const adjT = adjust(treatment)
  const before = summarize(control.y).variance + summarize(treatment.y).variance
  const after = summarize(adjC).variance + summarize(adjT).variance
  return { control: adjC, treatment: adjT, theta, correlation, varianceReduction: before === 0 ? 0 : 1 - after / before }
}

export interface GroupSummary {
  n: number
  mean: number // mean of y
  variance: number // var of y
  meanX: number
  varX: number
  cov: number // cov(x, y) within the group
}

export interface CupedSummaryResult {
  control: MeanSample
  treatment: MeanSample
  theta: number
  correlation: number
  varianceReduction: number
}

// CUPED from per-group aggregates only (what a SQL query returns), so no user-level rows are needed.
// Pooled sums of squares combine the within-group and between-group parts; the adjusted group variance is
// Var(Y - theta * X) = var_y - 2 * theta * cov + theta^2 * var_x. Matches cupedAdjust on the same data.
export function cupedFromSummaries(c: GroupSummary, t: GroupSummary): CupedSummaryResult {
  const n = c.n + t.n
  const mx = (c.n * c.meanX + t.n * t.meanX) / n
  const my = (c.n * c.mean + t.n * t.mean) / n
  const pooled = (g: GroupSummary) => ({
    sxx: (g.n - 1) * g.varX + g.n * (g.meanX - mx) ** 2,
    sxy: (g.n - 1) * g.cov + g.n * (g.meanX - mx) * (g.mean - my),
    syy: (g.n - 1) * g.variance + g.n * (g.mean - my) ** 2,
  })
  const pc = pooled(c)
  const pt = pooled(t)
  const sxx = pc.sxx + pt.sxx
  const sxy = pc.sxy + pt.sxy
  const syy = pc.syy + pt.syy
  const theta = sxx === 0 ? 0 : sxy / sxx
  const correlation = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
  const adjust = (g: GroupSummary): MeanSample => ({
    n: g.n,
    mean: g.mean - theta * (g.meanX - mx),
    variance: g.variance - 2 * theta * g.cov + theta * theta * g.varX,
  })
  const control = adjust(c)
  const treatment = adjust(t)
  const before = c.variance + t.variance
  return { control, treatment, theta, correlation, varianceReduction: before === 0 ? 0 : 1 - (control.variance + treatment.variance) / before }
}
