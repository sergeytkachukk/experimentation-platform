import type { Analysis } from '../analysis.ts'
import type { PathPoint, SimParams } from '../sim/simulate.ts'

export type DataSource = 'simulator' | 'bigquery'

// Everything the result panels need, computed once in ExperimentTab.
export interface Workspace {
  source: DataSource
  params: SimParams
  prior: number | null
  useCuped: boolean
  srmPValue: number
  path: PathPoint[] // empty for BigQuery data (no time dimension in the table)
  cuped: { theta: number; correlation: number; varianceReduction: number }
  raw: Analysis
  adjusted: Analysis
  active: Analysis // raw or adjusted, depending on "Apply CUPED"
}
