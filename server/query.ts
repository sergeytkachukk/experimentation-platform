export type BqMetric = 'conversion' | 'revenue'

// Column mapping for the dummy table created by the setup SQL (ab_sandbox.users).
const COLUMNS: Record<BqMetric, { y: string; x: string }> = {
  conversion: { y: 'CAST(converted AS INT64)', x: 'CAST(pre_converted AS INT64)' },
  revenue: { y: 'revenue', x: 'pre_revenue' },
}

const IDENT = /^[A-Za-z0-9_]{1,128}$/
const PROJECT = /^[a-z][a-z0-9:.-]{4,100}$/

export function isMetric(value: string): value is BqMetric {
  return value in COLUMNS
}

export function isIdentifier(value: string): boolean {
  return IDENT.test(value)
}

// Names go into the SQL text (BigQuery cannot parameterize table names), so they are strictly validated.
export function buildSummarySql(project: string, dataset: string, table: string, metric: BqMetric): string {
  if (!PROJECT.test(project) || !IDENT.test(dataset) || !IDENT.test(table)) throw new Error('Invalid project, dataset or table name')
  const { y, x } = COLUMNS[metric]
  return `SELECT
  variant,
  COUNT(*) AS n,
  AVG(y) AS mean,
  VAR_SAMP(y) AS variance,
  AVG(x) AS mean_x,
  VAR_SAMP(x) AS var_x,
  COVAR_SAMP(x, y) AS cov_xy
FROM (SELECT variant, ${y} AS y, ${x} AS x FROM \`${project}.${dataset}.${table}\`)
GROUP BY variant
ORDER BY variant`
}
