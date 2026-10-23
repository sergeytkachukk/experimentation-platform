import { summarize } from './tests.ts'

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
