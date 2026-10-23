import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { runSingleAA, summarizeAA } from '../../sim/simulate.ts'
import type { AARunFlags, FalsePositiveStats } from '../../sim/simulate.ts'
import { AA_USER_CAP, GRID, pct, TOOLTIP, WIN_THRESHOLD } from '../format.ts'
import { Help } from '../ui.tsx'
import type { Workspace } from '../workspace.ts'

const AA_RUNS = 300

interface Props {
  w: Workspace
  aa: FalsePositiveStats | null
  setAa: (v: FalsePositiveStats | null) => void
}

export default function PeekingPanel({ w, aa, setAa }: Props) {
  const { params, sim, prior } = w
  const [chart, setChart] = useState<'p' | 'bayes'>('p')
  const [progress, setProgress] = useState<number | null>(null)

  // Runs in small batches so the page stays responsive.
  const runAA = () => {
    const capped = { ...params, users: Math.min(params.users, AA_USER_CAP) }
    const flags: AARunFlags[] = []
    setAa(null)
    const step = () => {
      const end = Math.min(AA_RUNS, flags.length + 10)
      while (flags.length < end) flags.push(runSingleAA(capped, flags.length, prior))
      if (flags.length < AA_RUNS) {
        setProgress(flags.length)
        setTimeout(step, 0)
      } else {
        setAa(summarizeAA(flags))
        setProgress(null)
      }
    }
    setTimeout(step, 20)
  }

  return (
    <>
      <div className="panel">
        <div className="head">
          <h2>Results over time</h2>
          <div className="seg">
            <button className={chart === 'p' ? 'on' : ''} onClick={() => setChart('p')}>p-value</button>
            <button className={chart === 'bayes' ? 'on' : ''} onClick={() => setChart('bayes')}>Chance to win</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
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
        <Help>
          The line shows how the result looked as users arrived (40 "peeks"). Set the true effect to 0% (A/A) and press "New run" a few times: both lines often
          cross a threshold early, and stopping there is a false win. A real effect makes the line drop and stay down. This chart uses raw data (no CUPED).
        </Help>
      </div>

      <div className="panel">
        <h2>A/A: false positives</h2>
        <button onClick={runAA} disabled={progress !== null}>{progress !== null ? `Running… ${progress}/${AA_RUNS}` : `Run ${AA_RUNS} A/A tests`}</button>
        <button className="secondary" onClick={() => setAa(null)} disabled={progress !== null}>Reset</button>
        {aa && (
          <table>
            <thead><tr><th></th><th>Look once at the end</th><th>Stop at first significant peek</th></tr></thead>
            <tbody>
              <tr><td>Frequentist (p &lt; alpha)</td><td className="good">{pct(aa.freqFixed, 1)}</td><td className="bad">{pct(aa.freqPeeking, 1)}</td></tr>
              <tr><td>Bayesian (chance to win ≥ {pct(1 - params.alpha, 0)} or ≤ {pct(params.alpha, 0)})</td><td className="good">{pct(aa.bayesFixed, 1)}</td><td className="bad">{pct(aa.bayesPeeking, 1)}</td></tr>
            </tbody>
          </table>
        )}
        <Help>
          Runs {AA_RUNS} experiments with zero true effect using your metric, baseline and alpha (at most {AA_USER_CAP.toLocaleString()} users each, for speed).
          A single frequentist look should give about alpha false wins. The Bayesian rule calls a winner at either end, so even one look gives roughly 2x alpha.
          Peeking inflates both: being Bayesian does not make early stopping free.
        </Help>
      </div>
    </>
  )
}
