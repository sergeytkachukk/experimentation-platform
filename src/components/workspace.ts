import type { Analysis } from '../analysis.ts'
import type { SimParams, SimResult } from '../sim/simulate.ts'
import type { CupedResult } from '../stats/cuped.ts'

// Everything the result panels need, computed once in ExperimentTab.
export interface Workspace {
  params: SimParams
  prior: number | null
  useCuped: boolean
  sim: SimResult
  cuped: CupedResult
  raw: Analysis
  adjusted: Analysis
  active: Analysis // raw or adjusted, depending on "Apply CUPED"
}
