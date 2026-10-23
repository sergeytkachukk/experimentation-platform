import { createRng } from '../sim/rng.ts'

export interface BootstrapResult {
  diff: number
  ci: [number, number] // percentile CI for the difference in means
  pValue: number // two-sided, from the share of resampled diffs on each side of zero
  diffs: Float64Array // sorted resampled differences (for histograms)
}

function resampleMean(values: ArrayLike<number>, rng: () => number): number {
  const n = values.length
  let sum = 0
  for (let i = 0; i < n; i++) sum += values[Math.floor(rng() * n)]
  return sum / n
}

function mean(values: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < values.length; i++) s += values[i]
  return s / values.length
}

// Percentile bootstrap for the difference in means (treatment - control).
// Makes no normality assumption, which matters for skewed metrics like revenue.
export function bootstrapMeanDiff(
  control: ArrayLike<number>,
  treatment: ArrayLike<number>,
  opts: { resamples?: number; alpha?: number; seed?: number } = {},
): BootstrapResult {
  const resamples = opts.resamples ?? 1000
  const alpha = opts.alpha ?? 0.05
  const rng = createRng(opts.seed ?? 1)
  const diffs = new Float64Array(resamples)
  for (let b = 0; b < resamples; b++) diffs[b] = resampleMean(treatment, rng) - resampleMean(control, rng)
  diffs.sort()
  const q = (p: number) => diffs[Math.min(resamples - 1, Math.max(0, Math.floor(p * resamples)))]
  let le = 0
  let ge = 0
  for (const d of diffs) {
    if (d <= 0) le++
    if (d >= 0) ge++
  }
  const pValue = Math.min(1, (2 * (Math.min(le, ge) + 1)) / (resamples + 1))
  return { diff: mean(treatment) - mean(control), ci: [q(alpha / 2), q(1 - alpha / 2)], pValue, diffs }
}
