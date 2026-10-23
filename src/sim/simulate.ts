import { bayesianRelative } from '../stats/bayes.ts'
import { normalCdf } from '../stats/distributions.ts'
import { RunningStats } from '../stats/running.ts'
import { welchTTest, zTestProportions } from '../stats/tests.ts'
import type { MeanSample } from '../stats/tests.ts'
import { createRng, hashToUnit, normalSample } from './rng.ts'

export type MetricType = 'conversion' | 'click' | 'revenue'

export interface SimParams {
  metric: MetricType
  users: number
  baseline: number // baseline probability (conversion / click / purchase rate)
  relativeEffect: number // e.g. 0.1 = +10% relative lift in treatment
  treatmentShare: number // intended share of traffic in treatment
  actualTreatmentShare: number // share the assignment really produces (differs => SRM)
  avgOrderValue: number // revenue only: mean order value of a purchase
  orderSigma: number // revenue only: lognormal sigma, controls the heavy tail
  preCorrelation: number // correlation between a user's pre-experiment and in-experiment behaviour (drives CUPED)
  seed: number
  alpha: number
  checkpoints: number // number of "peeks" for the p-value path
}

export interface GroupData {
  y: number[] // in-experiment metric
  x: number[] // pre-experiment metric (same user, no treatment effect)
}

export interface PathPoint {
  n: number
  pValue: number
  diff: number
  chanceToWin: number
}

export interface SimResult {
  control: GroupData
  treatment: GroupData
  srmPValue: number
  path: PathPoint[]
}

export interface SimOptions {
  keepData?: boolean // false skips storing users and pre-period data (used for bulk A/A runs)
  priorSd?: number | null // Bayesian prior used for the chance-to-win path
}

// One draw of a user's metric. A Gaussian copula links this draw to the user's latent factors (u, u2),
// so pre- and in-experiment values correlate by `preCorrelation` regardless of the metric type.
function draw(p: SimParams, rate: number, rng: () => number, u: number, u2: number): number {
  const rho = p.preCorrelation
  const s = Math.sqrt(1 - rho * rho)
  const bought = normalCdf(rho * u + s * normalSample(rng)) < rate
  if (p.metric !== 'revenue') return bought ? 1 : 0
  if (!bought) return 0
  // Lognormal order value with mean = avgOrderValue: mu = ln(mean) - sigma^2 / 2
  const mu = Math.log(p.avgOrderValue) - (p.orderSigma * p.orderSigma) / 2
  return Math.exp(mu + p.orderSigma * (rho * u2 + s * normalSample(rng)))
}

function pathPoint(p: SimParams, c: MeanSample, t: MeanSample, priorSd: number | null | undefined): PathPoint {
  const r =
    p.metric === 'revenue'
      ? welchTTest(c, t, p.alpha, false)
      : zTestProportions({ n: c.n, successes: Math.round(c.mean * c.n) }, { n: t.n, successes: Math.round(t.mean * t.n) }, p.alpha)
  return { n: c.n + t.n, pValue: r.pValue, diff: r.diff, chanceToWin: bayesianRelative(c, t, { priorSd, alpha: p.alpha }).chanceToWin }
}

// Chi-square goodness-of-fit (1 df) p-value for the observed split vs the intended one.
function srmPValue(controlN: number, treatmentN: number, intendedTreatmentShare: number): number {
  const n = controlN + treatmentN
  const expT = n * intendedTreatmentShare
  const expC = n - expT
  const chi = (treatmentN - expT) ** 2 / expT + (controlN - expC) ** 2 / expC
  // chi-square with 1 df: P(X > chi) = 2 * (1 - Phi(sqrt(chi)))
  return 2 * (1 - normalCdf(Math.sqrt(chi)))
}

export function simulate(p: SimParams, opts: SimOptions = {}): SimResult {
  const keepData = opts.keepData ?? true
  const rng = createRng(p.seed)
  const control: GroupData = { y: [], x: [] }
  const treatment: GroupData = { y: [], x: [] }
  const cStats = new RunningStats()
  const tStats = new RunningStats()
  const path: PathPoint[] = []
  const step = Math.max(2, Math.floor(p.users / p.checkpoints))

  for (let i = 0; i < p.users; i++) {
    // Hash of the user id decides the bucket; actualTreatmentShare lets us inject a sample ratio mismatch.
    const inTreatment = hashToUnit(`user-${p.seed}-${i}`) < p.actualTreatmentShare
    const u = normalSample(rng)
    const u2 = normalSample(rng)
    const y = draw(p, inTreatment ? p.baseline * (1 + p.relativeEffect) : p.baseline, rng, u, u2)
    const group = inTreatment ? treatment : control
    ;(inTreatment ? tStats : cStats).push(y)
    if (keepData) {
      group.y.push(y)
      group.x.push(draw(p, p.baseline, rng, u, u2))
    }

    const seen = i + 1
    if ((seen % step === 0 || seen === p.users) && cStats.n > 1 && tStats.n > 1) {
      path.push(pathPoint(p, cStats.toSample(), tStats.toSample(), opts.priorSd))
    }
  }

  return { control, treatment, srmPValue: srmPValue(cStats.n, tStats.n, p.treatmentShare), path }
}

export interface FalsePositiveStats {
  runs: number
  freqFixed: number // share of A/A tests with p < alpha at the final look
  freqPeeking: number // share with p < alpha at ANY look
  bayesFixed: number // share where chance to win is >= 1 - alpha or <= alpha at the final look
  bayesPeeking: number // same, at ANY look
}

export interface AARunFlags {
  freqFixed: boolean
  freqPeeking: boolean
  bayesFixed: boolean
  bayesPeeking: boolean
}

// A single A/A test (no real effect): did it produce a false win at the final look / at any look?
export function runSingleAA(base: SimParams, index: number, priorSd?: number | null): AARunFlags {
  const decisive = (c: number) => c >= 1 - base.alpha || c <= base.alpha
  const { path } = simulate(
    { ...base, relativeEffect: 0, actualTreatmentShare: base.treatmentShare, seed: base.seed + index + 1 },
    { keepData: false, priorSd },
  )
  const last = path[path.length - 1]
  return {
    freqFixed: last.pValue < base.alpha,
    freqPeeking: path.some((pt) => pt.pValue < base.alpha),
    bayesFixed: decisive(last.chanceToWin),
    bayesPeeking: path.some((pt) => decisive(pt.chanceToWin)),
  }
}

export function summarizeAA(flags: AARunFlags[]): FalsePositiveStats {
  const share = (key: keyof AARunFlags) => flags.filter((f) => f[key]).length / flags.length
  return {
    runs: flags.length,
    freqFixed: share('freqFixed'),
    freqPeeking: share('freqPeeking'),
    bayesFixed: share('bayesFixed'),
    bayesPeeking: share('bayesPeeking'),
  }
}

// Run many A/A tests and compare fixed-horizon vs peeking false positive rates.
export function runAATests(base: SimParams, runs: number, priorSd?: number | null): FalsePositiveStats {
  return summarizeAA(Array.from({ length: runs }, (_, i) => runSingleAA(base, i, priorSd)))
}
