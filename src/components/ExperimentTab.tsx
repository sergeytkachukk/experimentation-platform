import { useDeferredValue, useMemo, useState } from 'react'
import { analyze, analyzeSummaries, computeCuped, cupedFromSummaries } from '../analysis.ts'
import { fetchSummary } from '../bq/client.ts'
import type { BqMetric, BqSummary } from '../bq/client.ts'
import { simulate, srmPValue } from '../sim/simulate.ts'
import type { FalsePositiveStats, MetricType, SimParams } from '../sim/simulate.ts'
import { MAX_USERS } from './format.ts'
import AdvancedPanel from './panels/AdvancedPanel.tsx'
import type { BootState } from './panels/AdvancedPanel.tsx'
import PeekingPanel from './panels/PeekingPanel.tsx'
import ResultsPanel from './panels/ResultsPanel.tsx'
import { Field } from './ui.tsx'
import type { DataSource, Workspace } from './workspace.ts'

const initial: SimParams = {
  metric: 'conversion',
  users: 10000,
  baseline: 0.1,
  relativeEffect: 0.1,
  treatmentShare: 0.5,
  actualTreatmentShare: 0.5,
  avgOrderValue: 50,
  orderSigma: 1,
  preCorrelation: 0.5,
  seed: 1,
  alpha: 0.05,
  checkpoints: 40,
}

type Sub = 'results' | 'peeking' | 'advanced'
const SUBS: { id: Sub; label: string; bigquery: boolean }[] = [
  { id: 'results', label: 'Results', bigquery: true },
  { id: 'peeking', label: 'Peeking & A/A', bigquery: false },
  { id: 'advanced', label: 'CUPED & Bootstrap', bigquery: true },
]

type BqState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: BqSummary }

export default function ExperimentTab() {
  const [params, setParams] = useState<SimParams>(initial)
  const [source, setSource] = useState<DataSource>('simulator')
  const [useCuped, setUseCuped] = useState(false)
  const [usePrior, setUsePrior] = useState(false)
  const [priorSd, setPriorSd] = useState(0.3)
  const [sub, setSub] = useState<Sub>('results')
  const [aa, setAa] = useState<FalsePositiveStats | null>(null)
  const [boot, setBoot] = useState<BootState | null>(null)
  const [bq, setBq] = useState<BqState>({ status: 'idle' })
  const [bqTable, setBqTable] = useState('users')
  const set = <K extends keyof SimParams>(key: K, value: SimParams[K]) => setParams((p) => ({ ...p, [key]: value }))

  const loadBq = async (table: string, metric: MetricType) => {
    if (metric === 'click') return
    setBq({ status: 'loading' })
    try {
      setBq({ status: 'ok', data: await fetchSummary(table, metric as BqMetric) })
    } catch (e) {
      setBq({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const chooseSource = (next: DataSource) => {
    setSource(next)
    if (next === 'bigquery') {
      const metric = params.metric === 'click' ? 'conversion' : params.metric
      set('metric', metric)
      if (bq.status === 'idle') void loadBq(bqTable, metric)
    }
  }

  const changeMetric = (metric: MetricType) => {
    set('metric', metric)
    if (source === 'bigquery') void loadBq(bqTable, metric)
  }

  // Inputs stay snappy; the heavy simulation follows with the deferred copy (matters at 300k users).
  const deferred = useDeferredValue(params)
  const stale = deferred !== params
  const prior = usePrior ? priorSd : null

  const ws = useMemo<Workspace | null>(() => {
    const o = { metric: deferred.metric, alpha: deferred.alpha, priorSd: prior }
    if (source === 'bigquery') {
      if (bq.status !== 'ok') return null
      const { control, treatment } = bq.data
      const cuped = cupedFromSummaries(control, treatment)
      const raw = analyzeSummaries(control, treatment, { ...o, cuped: false }, cuped)
      const adjusted = analyzeSummaries(control, treatment, { ...o, cuped: true }, cuped)
      return {
        source, params: deferred, prior, useCuped, cuped, raw, adjusted, active: useCuped ? adjusted : raw, path: [],
        srmPValue: srmPValue(control.n, treatment.n, deferred.treatmentShare),
      }
    }
    const sim = simulate(deferred, { priorSd: prior })
    const cuped = computeCuped(sim)
    const raw = analyze(sim, { ...o, cuped: false }, cuped)
    const adjusted = analyze(sim, { ...o, cuped: true }, cuped)
    return { source, params: deferred, prior, useCuped, cuped, raw, adjusted, active: useCuped ? adjusted : raw, path: sim.path, srmPValue: sim.srmPValue }
  }, [deferred, prior, useCuped, source, bq])

  const isRevenue = params.metric === 'revenue'
  const isBq = source === 'bigquery'
  const visibleSubs = SUBS.filter((s) => !isBq || s.bigquery)
  const activeSub = visibleSubs.some((s) => s.id === sub) ? sub : 'results'

  return (
    <div className="layout">
      <div className="panel setup">
        <h2>Experiment setup</h2>
        <div className="field">
          <div className="field-head"><span>Data source</span></div>
          <div className="seg wide">
            <button className={!isBq ? 'on' : ''} onClick={() => chooseSource('simulator')}>Simulator</button>
            <button className={isBq ? 'on' : ''} onClick={() => chooseSource('bigquery')}>BigQuery</button>
          </div>
        </div>

        <div className="field">
          <div className="field-head"><span>Metric</span></div>
          <select value={params.metric} onChange={(e) => changeMetric(e.target.value as MetricType)}>
            <option value="conversion">Conversion rate</option>
            {!isBq && <option value="click">Click rate</option>}
            <option value="revenue">Revenue per user</option>
          </select>
        </div>

        {isBq ? (
          <div className="field">
            <div className="field-head"><span>Table (dataset ab_sandbox)</span></div>
            <input
              type="text"
              value={bqTable}
              onChange={(e) => setBqTable(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && void loadBq(bqTable, params.metric)}
            />
            <button style={{ marginTop: 8 }} onClick={() => void loadBq(bqTable, params.metric)} disabled={bq.status === 'loading'}>
              {bq.status === 'loading' ? 'Loading…' : 'Load data'}
            </button>
            {bq.status === 'ok' && <p className="note">Loaded {bq.data.project}.{bq.data.dataset}.{bq.data.table}: control {bq.data.control.n.toLocaleString()}, treatment {bq.data.treatment.n.toLocaleString()} users.</p>}
            {bq.status === 'error' && <p className="note bad">{bq.message}</p>}
          </div>
        ) : (
          <>
            <Field label="Users" value={params.users} onChange={(v) => set('users', Math.round(v))} min={200} max={MAX_USERS} step={200} />
            <Field label={isRevenue ? 'Purchase rate' : 'Baseline rate'} value={params.baseline} onChange={(v) => set('baseline', v)} min={0.01} max={0.5} step={0.005} scale={100} suffix="%" decimals={1} />
            <Field label="True effect (relative)" value={params.relativeEffect} onChange={(v) => set('relativeEffect', v)} min={-0.3} max={0.5} step={0.01} scale={100} suffix="%" decimals={0} />
            {isRevenue && (
              <>
                <Field label="Average order value" value={params.avgOrderValue} onChange={(v) => set('avgOrderValue', v)} min={1} max={1000} step={1} slider={false} />
                <Field label="Tail heaviness (sigma)" value={params.orderSigma} onChange={(v) => set('orderSigma', v)} min={0.1} max={2} step={0.1} decimals={1} />
              </>
            )}
          </>
        )}

        <details className="adv">
          <summary>Advanced settings</summary>
          {isBq ? (
            <Field label="Treatment share (planned, for SRM)" value={params.treatmentShare} onChange={(v) => set('treatmentShare', v)} min={0.1} max={0.9} step={0.05} scale={100} suffix="%" />
          ) : (
            <>
              <Field label="Treatment share (planned)" value={params.treatmentShare} onChange={(v) => setParams((p) => ({ ...p, treatmentShare: v, actualTreatmentShare: v }))} min={0.1} max={0.9} step={0.05} scale={100} suffix="%" />
              <Field label="Treatment share (actual, for SRM)" value={params.actualTreatmentShare} onChange={(v) => set('actualTreatmentShare', v)} min={0.1} max={0.9} step={0.01} scale={100} suffix="%" />
              <Field label="Pre-experiment correlation" value={params.preCorrelation} onChange={(v) => set('preCorrelation', v)} min={0} max={0.95} step={0.05} decimals={2} />
            </>
          )}
          <div className="field">
            <div className="field-head"><span>Alpha</span></div>
            <select value={params.alpha} onChange={(e) => set('alpha', +e.target.value)}>
              <option value={0.01}>0.01</option>
              <option value={0.05}>0.05</option>
              <option value={0.1}>0.1</option>
            </select>
          </div>
          {!isBq && <Field label="Seed" value={params.seed} onChange={(v) => set('seed', Math.round(v))} min={0} max={999999999} step={1} slider={false} />}
          <label className="check">
            <input type="checkbox" checked={useCuped} onChange={(e) => setUseCuped(e.target.checked)} /> Apply CUPED
          </label>
          <label className="check">
            <input type="checkbox" checked={usePrior} onChange={(e) => setUsePrior(e.target.checked)} /> Informative Bayesian prior
          </label>
          {usePrior && <Field label="Prior sd (relative effect)" value={priorSd} onChange={setPriorSd} min={0.02} max={1} step={0.01} decimals={2} />}
        </details>

        {!isBq && <button onClick={() => set('seed', Math.floor(Math.random() * 1e6))}>New run</button>}
      </div>

      <div className={stale ? 'stale' : undefined}>
        <nav className="subtabs">
          {visibleSubs.map((s) => (
            <button key={s.id} className={activeSub === s.id ? 'on' : ''} onClick={() => setSub(s.id)}>{s.label}</button>
          ))}
        </nav>
        {ws === null ? (
          <div className="panel">
            <h2>BigQuery data</h2>
            <p className="note">
              {bq.status === 'loading' ? 'Loading aggregates from BigQuery…' : bq.status === 'error' ? bq.message : 'Press "Load data" to pull the experiment from BigQuery.'}
            </p>
          </div>
        ) : (
          <>
            {activeSub === 'results' && <ResultsPanel w={ws} />}
            {activeSub === 'peeking' && <PeekingPanel w={ws} aa={aa} setAa={setAa} />}
            {activeSub === 'advanced' && <AdvancedPanel w={ws} boot={boot} setBoot={setBoot} />}
          </>
        )}
      </div>
    </div>
  )
}
