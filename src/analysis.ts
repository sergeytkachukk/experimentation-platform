import { bayesianRelative } from './stats/bayes.ts'
import type { BayesResult } from './stats/bayes.ts'
import { cupedAdjust, cupedFromSummaries } from './stats/cuped.ts'
import type { CupedResult, CupedSummaryResult, GroupSummary } from './stats/cuped.ts'
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
  // User-level values the analysis ran on (CUPED-adjusted when enabled), reused by the bootstrap.
  // Absent when the data came from aggregates (BigQuery).
  controlValues?: ArrayLike<number>
  treatmentValues?: ArrayLike<number>
}

// Frequentist + Bayesian analysis from group summaries; shared by simulator and BigQuery data.
function fromSamples(control: MeanSample, treatment: MeanSample, o: Omit<AnalysisOptions, 'cuped'>, binary: boolean): Analysis {
  // Raw binary metrics get the classic z-test; revenue and CUPED-adjusted values are not Bernoulli, so use Welch.
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
  }
}

export function analyze(sim: SimResult, o: AnalysisOptions, cuped: CupedResult | null): Analysis {
  const useAdjusted = o.cuped && cuped !== null
  const controlValues = useAdjusted ? cuped.control : sim.control.y
  const treatmentValues = useAdjusted ? cuped.treatment : sim.treatment.y
  const binary = o.metric !== 'revenue' && !useAdjusted
  return { ...fromSamples(summarize(controlValues), summarize(treatmentValues), o, binary), controlValues, treatmentValues }
}

export function computeCuped(sim: SimResult): CupedResult {
  return cupedAdjust(sim.control, sim.treatment)
}

// Same analysis from per-group aggregates (one row per variant), e.g. a BigQuery GROUP BY.
export function analyzeSummaries(control: GroupSummary, treatment: GroupSummary, o: AnalysisOptions, cuped: CupedSummaryResult): Analysis {
  if (o.cuped) return fromSamples(cuped.control, cuped.treatment, o, false)
  const toSample = (g: GroupSummary): MeanSample => ({ n: g.n, mean: g.mean, variance: g.variance })
  return fromSamples(toSample(control), toSample(treatment), o, o.metric !== 'revenue')
}

export { cupedFromSummaries }
