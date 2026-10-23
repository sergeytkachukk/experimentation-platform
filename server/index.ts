import { BigQuery } from '@google-cloud/bigquery'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildSummarySql, isIdentifier, isMetric } from './query.ts'

// Small local API: the browser never sees Google credentials, this process reads them from
// Application Default Credentials (gcloud auth application-default login) and returns only aggregates.
const PORT = Number(process.env.PORT ?? 3003)
const DATASET = process.env.BQ_DATASET ?? 'ab_sandbox'

// The Google client cannot always infer the project from user credentials, so resolve it ourselves:
// BQ_PROJECT env, then GOOGLE_CLOUD_PROJECT, then the quota project saved by `gcloud auth application-default login`.
function resolveProject(): string | undefined {
  if (process.env.BQ_PROJECT) return process.env.BQ_PROJECT
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? join(homedir(), '.config', 'gcloud', 'application_default_credentials.json')
  try {
    const creds = JSON.parse(readFileSync(file, 'utf8')) as { quota_project_id?: string; project_id?: string }
    return creds.quota_project_id ?? creds.project_id
  } catch {
    return undefined
  }
}

const PROJECT = resolveProject()
const bigquery = new BigQuery(PROJECT ? { projectId: PROJECT } : {})

function send(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (url.pathname === '/api/bq/health') {
      return send(res, 200, { ok: true, project: await bigquery.getProjectId(), dataset: DATASET })
    }
    if (url.pathname === '/api/bq/summary') {
      const table = url.searchParams.get('table') ?? 'users'
      const metric = url.searchParams.get('metric') ?? 'conversion'
      if (!isIdentifier(table)) return send(res, 400, { error: 'Invalid table name' })
      if (!isMetric(metric)) return send(res, 400, { error: 'Metric must be conversion or revenue' })
      const project = await bigquery.getProjectId()
      const [rows] = await bigquery.query({ query: buildSummarySql(project, DATASET, table, metric), location: process.env.BQ_LOCATION ?? 'US' })
      const groups = rows.map((r: Record<string, unknown>) => ({
        variant: String(r.variant),
        n: Number(r.n),
        mean: Number(r.mean),
        variance: Number(r.variance),
        meanX: Number(r.mean_x),
        varX: Number(r.var_x),
        cov: Number(r.cov_xy),
      }))
      return send(res, 200, { project, dataset: DATASET, table, metric, groups })
    }
    send(res, 404, { error: 'Not found' })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    console.error(raw)
    // The Google library's auth errors are cryptic; point at the actual fix.
    const needsLogin = /Project Id|default credentials|invalid_grant|reauth/i.test(raw)
    send(res, needsLogin ? 401 : 500, {
      error: needsLogin ? 'Google credentials not found. Run in a terminal: gcloud auth application-default login' : raw,
    })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`BigQuery API on http://127.0.0.1:${PORT} (project ${PROJECT ?? 'unknown'}, dataset ${DATASET})`))
