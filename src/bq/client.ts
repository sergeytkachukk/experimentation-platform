import type { GroupSummary } from '../stats/cuped.ts'

export type BqMetric = 'conversion' | 'revenue'

export interface BqSummary {
  project: string
  dataset: string
  table: string
  metric: BqMetric
  control: GroupSummary
  treatment: GroupSummary
}

interface RawGroup extends GroupSummary {
  variant: string
}

// Ask the local API (server/index.ts) for per-variant aggregates of an experiment table.
export async function fetchSummary(table: string, metric: BqMetric): Promise<BqSummary> {
  let res: Response
  try {
    res = await fetch(`/api/bq/summary?table=${encodeURIComponent(table)}&metric=${metric}`)
  } catch {
    throw new Error('Cannot reach the BigQuery API. Start it in a second terminal with: yarn server')
  }
  const body = (await res.json().catch(() => null)) as { error?: string; project: string; dataset: string; table: string; metric: BqMetric; groups: RawGroup[] } | null
  if (!res.ok || !body) {
    if (res.status >= 500 && !body?.error) throw new Error('The BigQuery API is not running. Start it in a second terminal with: yarn server')
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  const control = body.groups.find((g) => g.variant === 'control')
  const treatment = body.groups.find((g) => g.variant === 'treatment')
  if (!control || !treatment) throw new Error(`Table needs variants "control" and "treatment", found: ${body.groups.map((g) => g.variant).join(', ') || 'none'}`)
  return { project: body.project, dataset: body.dataset, table: body.table, metric: body.metric, control, treatment }
}
