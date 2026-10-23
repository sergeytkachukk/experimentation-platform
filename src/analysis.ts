import { bayesianRelative } from './stats/bayes.ts'
import type { BayesResult } from './stats/bayes.ts'
import { cupedAdjust } from './stats/cuped.ts'
import type { CupedResult } from './stats/cuped.ts'
import { summarize, welchTTest, zTestProportions } from './stats/tests.ts'
import type { MeanSample, TestResult } from './stats/tests.ts'
import type { MetricType, SimResult } from './sim/simulate.ts'

export interface AnalysisOptions {
  metric: MetricType
  alpha: number
  priorSd: number | null
  cuped: boolean
}

export interface Analysis {
  testName: string
  control: MeanSample
  treatment: MeanSample
  freq: TestResult
  bayes: BayesResult
  // The values the analysis ran on (CUPED-adjusted when enabled), reused by the bootstrap.
  controlValues: ArrayLike<number>
  treatmentValues: ArrayLike<number>
}

export function analyze(sim: SimResult, o: AnalysisOptions, cuped: CupedResult | null): Analysis {
  const useAdjusted = o.cuped && cuped !== null
  const controlValues = useAdjusted ? cuped.control : sim.control.y
  const treatmentValues = useAdjusted ? cuped.treatment : sim.treatment.y
  const control = summarize(controlValues)
  const treatment = summarize(treatmentValues)
  // Raw binary metrics get the classic z-test; revenue and CUPED-adjusted values are not Bernoulli, so use Welch.
  const binary = o.metric !== 'revenue' && !useAdjusted
  const freq = binary
    ? zTestProportions(
        { n: control.n, successes: Math.round(control.mean * control.n) },
        { n: treatment.n, successes: Math.round(treatment.mean * treatment.n) },
        o.alpha,
      )
    : welchTTest(control, treatment, o.alpha)
  return {
    testName: binary ? 'Two-proportion z-test' : "Welch's t-test",
    control,
    treatment,
    freq,
    bayes: bayesianRelative(control, treatment, { priorSd: o.priorSd, alpha: o.alpha }),
    controlValues,
    treatmentValues,
  }
}

export function computeCuped(sim: SimResult): CupedResult {
  return cupedAdjust(sim.control, sim.treatment)
}
