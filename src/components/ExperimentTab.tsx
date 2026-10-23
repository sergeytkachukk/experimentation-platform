import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { analyze, computeCuped } from '../analysis.ts'
import { runAATests, simulate } from '../sim/simulate.ts'
import type { FalsePositiveStats, MetricType, SimParams } from '../sim/simulate.ts'
import { bootstrapMeanDiff } from '../stats/bootstrap.ts'
import type { BootstrapResult } from '../stats/bootstrap.ts'
import { sampleSizePerVariant } from '../stats/tests.ts'

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

const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '–')
const fmtP = (p: number) => (p < 0.0001 ? '<0.0001' : p.toFixed(4))
const GRID = '#2a3140'
const TOOLTIP = { background: '#181d27', border: `1px solid ${GRID}` }

// GrowthBook's default decision thresholds.
const WIN_THRESHOLD = 0.95
const RISK_THRESHOLD = 0.0025

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: 'good' | 'bad'; small?: boolean }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b className={tone} style={small ? { fontSize: 15 } : undefined}>{value}</b>
    </div>
  )
}

export default function ExperimentTab() {
  const [params, setParams] = useState<SimParams>(initial)
  const [useCuped, setUseCuped] = useState(false)
  const [usePrior, setUsePrior] = useState(false)
  const [priorSd, setPriorSd] = useState(0.3)
  const [chart, setChart] = useState<'p' | 'bayes'>('p')
  const [aa, setAa] = useState<FalsePositiveStats | null>(null)
  const [boot, setBoot] = useState<{ result: BootstrapResult; key: string } | null>(null)
  const [bootBusy, setBootBusy] = useState(false)
  const set = <K extends keyof SimParams>(key: K, value: SimParams[K]) => setParams((p) => ({ ...p, [key]: value }))

  const prior = usePrior ? priorSd : null
  const sim = useMemo(() => simulate(params, { priorSd: prior }), [params, prior])
  const cuped = useMemo(() => computeCuped(sim), [sim])
  const raw = useMemo(() => analyze(sim, { metric: params.metric, alpha: params.alpha, priorSd: prior, cuped: false }, cuped), [sim, cuped, params.metric, params.alpha, prior])
  const adjusted = useMemo(() => analyze(sim, { metric: params.metric, alpha: params.alpha, priorSd: prior, cuped: true }, cuped), [sim, cuped, params.metric, params.alpha, prior])
  const a = useCuped ? adjusted : raw

  const { freq, bayes } = a
  const isRevenue = params.metric === 'revenue'
  const significant = freq.pValue < params.alpha
  const fmtVal = (x: number) => (isRevenue || useCuped ? x.toFixed(4) : pct(x))
  const ciWidth = (r: { ci: [number, number] }) => r.ci[1] - r.ci[0]
  const needed = sampleSizePerVariant(params.baseline, Math.max(Math.abs(params.relativeEffect), 0.001), params.alpha) * 2

  const verdict =
    bayes.chanceToWin >= WIN_THRESHOLD ? { text: 'Treatment is winning', tone: 'good' as const }
    : bayes.chanceToWin <= 1 - WIN_THRESHOLD ? { text: 'Control is winning', tone: 'bad' as const }
    : { text: 'Not enough evidence yet', tone: undefined }

  const bootKey = JSON.stringify([params, useCuped])
  const bootFresh = boot?.key === bootKey
  const runBootstrap = () => {
    setBootBusy(true)
    // Let the "running" state paint before the (synchronous) resampling loop blocks the thread.
    setTimeout(() => {
      setBoot({ result: bootstrapMeanDiff(a.controlValues, a.treatmentValues, { resamples: 1000, alpha: params.alpha, seed: params.seed }), key: bootKey })
      setBootBusy(false)
    }, 20)
  }

  const histogram = useMemo(() => {
    if (!boot) return []
    const { diffs } = boot.result
    const bins = 30
    const lo = diffs[0]
    const width = (diffs[diffs.length - 1] - lo) / bins || 1
    const counts = new Array<number>(bins).fill(0)
    for (const d of diffs) counts[Math.min(bins - 1, Math.floor((d - lo) / width))]++
    return counts.map((count, i) => ({ x: lo + (i + 0.5) * width, count }))
  }, [boot])

  return (
    <div className="layout">
      <div className="panel">
        <h2>Experiment setup</h2>
        <label>
          Metric
          <select value={params.metric} onChange={(e) => set('metric', e.target.value as MetricType)}>
            <option value="conversion">Conversion rate</option>
            <option value="click">Click rate</option>
            <option value="revenue">Revenue per user</option>
          </select>
        </label>
        <label>
          Users <span>{params.users.toLocaleString()}</span>
          <input type="range" min={200} max={100000} step={200} value={params.users} onChange={(e) => set('users', +e.target.value)} />
        </label>
        <label>
          {isRevenue ? 'Purchase rate' : 'Baseline rate'} <span>{pct(params.baseline, 1)}</span>
          <input type="range" min={0.01} max={0.5} step={0.005} value={params.baseline} onChange={(e) => set('baseline', +e.target.value)} />
        </label>
        <label>
          True effect (relative) <span>{pct(params.relativeEffect, 1)}</span>
          <input type="range" min={-0.3} max={0.5} step={0.01} value={params.relativeEffect} onChange={(e) => set('relativeEffect', +e.target.value)} />
        </label>
        <label>
          Treatment share (planned) <span>{pct(params.treatmentShare, 0)}</span>
          <input
            type="range" min={0.1} max={0.9} step={0.05} value={params.treatmentShare}
            onChange={(e) => setParams((p) => ({ ...p, treatmentShare: +e.target.value, actualTreatmentShare: +e.target.value }))}
          />
        </label>
        <label>
          Treatment share (actual, for SRM) <span>{pct(params.actualTreatmentShare, 0)}</span>
          <input type="range" min={0.1} max={0.9} step={0.01} value={params.actualTreatmentShare} onChange={(e) => set('actualTreatmentShare', +e.target.value)} />
        </label>
        {isRevenue && (
          <>
            <label>
              Average order value <span>{params.avgOrderValue}</span>
              <input type="number" min={1} value={params.avgOrderValue} onChange={(e) => set('avgOrderValue', Math.max(1, +e.target.value))} />
            </label>
            <label>
              Tail heaviness (sigma) <span>{params.orderSigma.toFixed(1)}</span>
              <input type="range" min={0.1} max={2} step={0.1} value={params.orderSigma} onChange={(e) => set('orderSigma', +e.target.value)} />
            </label>
          </>
        )}
        <label>
          Pre-experiment correlation <span>{params.preCorrelation.toFixed(2)}</span>
          <input type="range" min={0} max={0.95} step={0.05} value={params.preCorrelation} onChange={(e) => set('preCorrelation', +e.target.value)} />
        </label>
        <label>
          Alpha <span>{params.alpha}</span>
          <select value={params.alpha} onChange={(e) => set('alpha', +e.target.value)}>
            <option value={0.01}>0.01</option>
            <option value={0.05}>0.05</option>
            <option value={0.1}>0.1</option>
          </select>
        </label>
        <label>
          Seed
          <input type="number" value={params.seed} onChange={(e) => set('seed', +e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={useCuped} onChange={(e) => setUseCuped(e.target.checked)} /> Apply CUPED
        </label>
        <label className="check">
          <input type="checkbox" checked={usePrior} onChange={(e) => setUsePrior(e.target.checked)} /> Informative Bayesian prior
        </label>
        {usePrior && (
          <label>
            Prior sd (relative effect) <span>{priorSd.toFixed(2)}</span>
            <input type="range" min={0.02} max={1} step={0.01} value={priorSd} onChange={(e) => setPriorSd(+e.target.value)} />
          </label>
        )}
        <button onClick={() => set('seed', Math.floor(Math.random() * 1e6))}>New run</button>
      </div>

      <div>
        <div className="cols">
          <div className="panel">
            <h2>Frequentist <span className="tag">{a.testName}</span></h2>
            <div className="stats">
              <Stat label={`Control (n=${a.control.n.toLocaleString()})`} value={fmtVal(a.control.mean)} />
              <Stat label={`Treatment (n=${a.treatment.n.toLocaleString()})`} value={fmtVal(a.treatment.mean)} />
              <Stat label="Uplift" value={pct(freq.uplift)} />
              <Stat label="p-value" value={fmtP(freq.pValue)} tone={significant ? 'good' : undefined} />
              <Stat label={`${pct(1 - params.alpha, 0)} CI (absolute diff)`} value={`[${fmtVal(freq.ci[0])}, ${fmtVal(freq.ci[1])}]`} small />
              <Stat label="SRM p-value" value={fmtP(sim.srmPValue)} tone={sim.srmPValue < 0.001 ? 'bad' : undefined} />
            </div>
            <p className="note">
              {significant ? 'Statistically significant' : 'Not significant'} at alpha={params.alpha}.{' '}
              {sim.srmPValue < 0.001 && 'SRM detected: the actual split does not match the plan, do not trust these results. '}
              {!isRevenue && <>Detecting a {pct(Math.abs(params.relativeEffect), 1)} lift with 80% power needs about {needed.toLocaleString()} users in total.</>}
            </p>
          </div>

          <div className="panel">
            <h2>Bayesian <span className="tag">{usePrior ? `Gaussian prior, sd ${priorSd.toFixed(2)}` : 'flat prior'}</span></h2>
            <div className="stats">
              <Stat label="Chance to win" value={pct(bayes.chanceToWin, 1)} tone={verdict.tone} />
              <Stat label="Expected uplift" value={pct(bayes.relativeEffect)} />
              <Stat label={`${pct(1 - params.alpha, 0)} credible interval`} value={`[${pct(bayes.ci[0], 1)}, ${pct(bayes.ci[1], 1)}]`} small />
              <Stat label="Risk if you ship treatment" value={pct(bayes.riskTreatment, 3)} tone={bayes.riskTreatment < RISK_THRESHOLD ? 'good' : undefined} />
              <Stat label="Risk if you keep control" value={pct(bayes.riskControl, 3)} />
              <Stat label="Verdict" value={verdict.text} tone={verdict.tone} small />
            </div>
            <p className="note">
              Same approach as GrowthBook: the relative lift gets a Gaussian posterior (delta method), thresholds are
              chance to win ≥ {pct(WIN_THRESHOLD, 0)} and risk &lt; {pct(RISK_THRESHOLD, 2)}. Risk is the expected relative loss if the
              decision turns out wrong.
            </p>
          </div>
        </div>

        <div className="panel">
          <h2>CUPED variance reduction</h2>
          <div className="stats">
            <Stat label="corr(pre, post)" value={cuped.correlation.toFixed(3)} />
            <Stat label="theta" value={cuped.theta.toFixed(3)} />
            <Stat label="Variance removed" value={pct(cuped.varianceReduction, 1)} tone={cuped.varianceReduction > 0.05 ? 'good' : undefined} />
            <Stat label="CI width without CUPED" value={ciWidth(raw.freq).toPrecision(3)} />
            <Stat label="CI width with CUPED" value={ciWidth(adjusted.freq).toPrecision(3)} />
          </div>
          <p className="note">
            CUPED subtracts the part of the metric predicted by each user's pre-experiment behaviour. The lift stays unbiased, the interval gets
            narrower by roughly the squared correlation. The slider sets the latent correlation, the real corr(pre, post) is shown above and is
            lower for binary or zero-inflated metrics. Toggle "Apply CUPED" to switch the cards above to the adjusted data.
          </p>
        </div>

        <div className="panel">
          <div className="head">
            <h2>Results over time (peeking)</h2>
            <div className="seg">
              <button className={chart === 'p' ? 'on' : ''} onClick={() => setChart('p')}>p-value</button>
              <button className={chart === 'bayes' ? 'on' : ''} onClick={() => setChart('bayes')}>Chance to win</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sim.path}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="n" stroke="#8d97a8" />
              <YAxis domain={[0, 1]} stroke="#8d97a8" />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => Number(v).toFixed(4)} />
              {chart === 'p' ? (
                <ReferenceLine y={params.alpha} stroke="#ef6b6b" strokeDasharray="4 4" label={{ value: 'alpha', fill: '#ef6b6b', position: 'right' }} />
              ) : (
                <>
                  <ReferenceLine y={WIN_THRESHOLD} stroke="#4cc38a" strokeDasharray="4 4" />
                  <ReferenceLine y={1 - WIN_THRESHOLD} stroke="#ef6b6b" strokeDasharray="4 4" />
                </>
              )}
              <Line type="monotone" dataKey={chart === 'p' ? 'pValue' : 'chanceToWin'} stroke="#6aa5ff" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="note">
            Set the true effect to 0% (A/A) and press "New run" a few times. Both lines will often cross a threshold early; stopping there is a false win.
            Note: this chart uses raw data (no CUPED).
          </p>
        </div>

        <div className="panel">
          <h2>Bootstrap (difference in means)</h2>
          <button onClick={runBootstrap} disabled={bootBusy}>{bootBusy ? 'Resampling…' : 'Run 1000 resamples'}</button>
          {boot && (
            <>
              {!bootFresh && <p className="note">Parameters changed since this run, press the button again to refresh.</p>}
              <div className="stats" style={{ marginTop: 12 }}>
                <Stat label="Bootstrap diff" value={fmtVal(boot.result.diff)} />
                <Stat label={`${pct(1 - params.alpha, 0)} percentile CI`} value={`[${fmtVal(boot.result.ci[0])}, ${fmtVal(boot.result.ci[1])}]`} small />
                <Stat label="Bootstrap p-value" value={fmtP(boot.result.pValue)} tone={boot.result.pValue < params.alpha ? 'good' : undefined} />
                <Stat label="Parametric p-value" value={fmtP(freq.pValue)} />
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={histogram}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis dataKey="x" stroke="#8d97a8" tickFormatter={(v) => Number(v).toFixed(3)} />
                  <YAxis stroke="#8d97a8" />
                  <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => `diff ≈ ${Number(v).toFixed(4)}`} />
                  <ReferenceLine x={0} stroke="#ef6b6b" />
                  <Bar dataKey="count" fill="#6aa5ff" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
          <p className="note">
            Resamples each group with replacement and recomputes the mean difference. No normality assumption, so it is the sanity check for
            heavy-tailed revenue; with a big tail (sigma ≥ 1.5) and few users compare it with the t-test p-value.
          </p>
        </div>

        <div className="panel">
          <h2>A/A: false positives</h2>
          <button onClick={() => setAa(runAATests(params, 300, prior))}>Run 300 A/A tests</button>
          <button className="secondary" onClick={() => setAa(null)}>Reset</button>
          {aa && (
            <table>
              <thead><tr><th></th><th>Look once at the end</th><th>Stop at first significant peek</th></tr></thead>
              <tbody>
                <tr><td>Frequentist (p &lt; alpha)</td><td className="good">{pct(aa.freqFixed, 1)}</td><td className="bad">{pct(aa.freqPeeking, 1)}</td></tr>
                <tr><td>Bayesian (chance to win ≥ {pct(1 - params.alpha, 0)} or ≤ {pct(params.alpha, 0)})</td><td className="good">{pct(aa.bayesFixed, 1)}</td><td className="bad">{pct(aa.bayesPeeking, 1)}</td></tr>
              </tbody>
            </table>
          )}
          <p className="note">
            With zero true effect, a single frequentist look should give about alpha false wins. The Bayesian rule here calls a winner at either
            end (chance to win ≥ 1 - alpha or ≤ alpha), so even one look gives roughly 2x alpha. Peeking inflates both: being Bayesian
            does not make early stopping free.
          </p>
        </div>
      </div>
    </div>
  )
}
