import { useDeferredValue, useMemo, useState } from 'react'
import { analyze, computeCuped } from '../analysis.ts'
import { simulate } from '../sim/simulate.ts'
import type { FalsePositiveStats, MetricType, SimParams } from '../sim/simulate.ts'
import { MAX_USERS } from './format.ts'
import AdvancedPanel from './panels/AdvancedPanel.tsx'
import type { BootState } from './panels/AdvancedPanel.tsx'
import PeekingPanel from './panels/PeekingPanel.tsx'
import ResultsPanel from './panels/ResultsPanel.tsx'
import { Field } from './ui.tsx'
import type { Workspace } from './workspace.ts'

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
const SUBS: { id: Sub; label: string }[] = [
  { id: 'results', label: 'Results' },
  { id: 'peeking', label: 'Peeking & A/A' },
  { id: 'advanced', label: 'CUPED & Bootstrap' },
]

export default function ExperimentTab() {
  const [params, setParams] = useState<SimParams>(initial)
  const [useCuped, setUseCuped] = useState(false)
  const [usePrior, setUsePrior] = useState(false)
  const [priorSd, setPriorSd] = useState(0.3)
  const [sub, setSub] = useState<Sub>('results')
  const [aa, setAa] = useState<FalsePositiveStats | null>(null)
  const [boot, setBoot] = useState<BootState | null>(null)
  const set = <K extends keyof SimParams>(key: K, value: SimParams[K]) => setParams((p) => ({ ...p, [key]: value }))

  // Inputs stay snappy; the heavy simulation follows with the deferred copy (matters at 300k users).
  const deferred = useDeferredValue(params)
  const stale = deferred !== params
  const prior = usePrior ? priorSd : null

  const ws = useMemo<Workspace>(() => {
    const sim = simulate(deferred, { priorSd: prior })
    const cuped = computeCuped(sim)
    const o = { metric: deferred.metric, alpha: deferred.alpha, priorSd: prior }
    const raw = analyze(sim, { ...o, cuped: false }, cuped)
    const adjusted = analyze(sim, { ...o, cuped: true }, cuped)
    return { params: deferred, prior, useCuped, sim, cuped, raw, adjusted, active: useCuped ? adjusted : raw }
  }, [deferred, prior, useCuped])

  const isRevenue = params.metric === 'revenue'

  return (
    <div className="layout">
      <div className="panel setup">
        <h2>Experiment setup</h2>
        <div className="field">
          <div className="field-head"><span>Metric</span></div>
          <select value={params.metric} onChange={(e) => set('metric', e.target.value as MetricType)}>
            <option value="conversion">Conversion rate</option>
            <option value="click">Click rate</option>
            <option value="revenue">Revenue per user</option>
          </select>
        </div>
        <Field label="Users" value={params.users} onChange={(v) => set('users', Math.round(v))} min={200} max={MAX_USERS} step={200} />
        <Field label={isRevenue ? 'Purchase rate' : 'Baseline rate'} value={params.baseline} onChange={(v) => set('baseline', v)} min={0.01} max={0.5} step={0.005} scale={100} suffix="%" decimals={1} />
        <Field label="True effect (relative)" value={params.relativeEffect} onChange={(v) => set('relativeEffect', v)} min={-0.3} max={0.5} step={0.01} scale={100} suffix="%" decimals={0} />
        {isRevenue && (
          <>
            <Field label="Average order value" value={params.avgOrderValue} onChange={(v) => set('avgOrderValue', v)} min={1} max={1000} step={1} slider={false} />
            <Field label="Tail heaviness (sigma)" value={params.orderSigma} onChange={(v) => set('orderSigma', v)} min={0.1} max={2} step={0.1} decimals={1} />
          </>
        )}

        <details className="adv">
          <summary>Advanced settings</summary>
          <Field label="Treatment share (planned)" value={params.treatmentShare} onChange={(v) => setParams((p) => ({ ...p, treatmentShare: v, actualTreatmentShare: v }))} min={0.1} max={0.9} step={0.05} scale={100} suffix="%" />
          <Field label="Treatment share (actual, for SRM)" value={params.actualTreatmentShare} onChange={(v) => set('actualTreatmentShare', v)} min={0.1} max={0.9} step={0.01} scale={100} suffix="%" />
          <Field label="Pre-experiment correlation" value={params.preCorrelation} onChange={(v) => set('preCorrelation', v)} min={0} max={0.95} step={0.05} decimals={2} />
          <div className="field">
            <div className="field-head"><span>Alpha</span></div>
            <select value={params.alpha} onChange={(e) => set('alpha', +e.target.value)}>
              <option value={0.01}>0.01</option>
              <option value={0.05}>0.05</option>
              <option value={0.1}>0.1</option>
            </select>
          </div>
          <Field label="Seed" value={params.seed} onChange={(v) => set('seed', Math.round(v))} min={0} max={999999999} step={1} slider={false} />
          <label className="check">
            <input type="checkbox" checked={useCuped} onChange={(e) => setUseCuped(e.target.checked)} /> Apply CUPED
          </label>
          <label className="check">
            <input type="checkbox" checked={usePrior} onChange={(e) => setUsePrior(e.target.checked)} /> Informative Bayesian prior
          </label>
          {usePrior && <Field label="Prior sd (relative effect)" value={priorSd} onChange={setPriorSd} min={0.02} max={1} step={0.01} decimals={2} />}
        </details>

        <button onClick={() => set('seed', Math.floor(Math.random() * 1e6))}>New run</button>
      </div>

      <div className={stale ? 'stale' : undefined}>
        <nav className="subtabs">
          {SUBS.map((s) => (
            <button key={s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSub(s.id)}>{s.label}</button>
          ))}
        </nav>
        {sub === 'results' && <ResultsPanel w={ws} />}
        {sub === 'peeking' && <PeekingPanel w={ws} aa={aa} setAa={setAa} />}
        {sub === 'advanced' && <AdvancedPanel w={ws} boot={boot} setBoot={setBoot} />}
      </div>
    </div>
  )
}
