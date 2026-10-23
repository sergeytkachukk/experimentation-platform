import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bootstrapMeanDiff } from '../../stats/bootstrap.ts'
import type { BootstrapResult } from '../../stats/bootstrap.ts'
import { fmtP, GRID, pct, TOOLTIP } from '../format.ts'
import { Help, Stat } from '../ui.tsx'
import type { Workspace } from '../workspace.ts'

export interface BootState {
  result: BootstrapResult
  key: string
  resamples: number
}

interface Props {
  w: Workspace
  boot: BootState | null
  setBoot: (b: BootState | null) => void
}

// Keep the total work (resamples x users) bounded so 300k-user experiments do not freeze the tab.
const BOOT_BUDGET = 150_000_000
const resamplesFor = (n: number) => Math.min(1000, Math.max(200, Math.floor(BOOT_BUDGET / n)))

export default function AdvancedPanel({ w, boot, setBoot }: Props) {
  const { params, cuped, raw, adjusted, active: a, useCuped } = w
  const [busy, setBusy] = useState(false)
  const isRevenue = params.metric === 'revenue'
  const fmtVal = (x: number) => (isRevenue || useCuped ? x.toFixed(4) : pct(x))
  const ciWidth = (r: { ci: [number, number] }) => r.ci[1] - r.ci[0]

  const resamples = resamplesFor(a.control.n + a.treatment.n)
  const bootKey = JSON.stringify([params, useCuped])
  const fresh = boot?.key === bootKey

  const runBootstrap = () => {
    setBusy(true)
    // Let the "running" state paint before the (synchronous) resampling loop blocks the thread.
    setTimeout(() => {
      setBoot({ result: bootstrapMeanDiff(a.controlValues, a.treatmentValues, { resamples, alpha: params.alpha, seed: params.seed }), key: bootKey, resamples })
      setBusy(false)
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
    <>
      <div className="panel">
        <h2>CUPED variance reduction</h2>
        <div className="stats">
          <Stat label="corr(pre, post)" value={cuped.correlation.toFixed(3)} />
          <Stat label="theta" value={cuped.theta.toFixed(3)} />
          <Stat label="Variance removed" value={pct(cuped.varianceReduction, 1)} tone={cuped.varianceReduction > 0.05 ? 'good' : undefined} />
          <Stat label="CI width without CUPED" value={ciWidth(raw.freq).toPrecision(3)} />
          <Stat label="CI width with CUPED" value={ciWidth(adjusted.freq).toPrecision(3)} />
        </div>
        <Help>
          CUPED subtracts the part of the metric predicted by each user's pre-experiment behaviour. The lift stays unbiased, the interval gets narrower by roughly the
          squared correlation. The "Pre-experiment correlation" slider sets the latent correlation; the real corr(pre, post) is shown above and is lower for binary or
          zero-inflated metrics. Turn on "Apply CUPED" in the setup (Advanced) to switch the Results cards to the adjusted data.
        </Help>
      </div>

      <div className="panel">
        <h2>Bootstrap (difference in means)</h2>
        <button onClick={runBootstrap} disabled={busy}>{busy ? 'Resampling…' : `Run ${resamples.toLocaleString()} resamples`}</button>
        {boot && (
          <>
            {!fresh && <p className="note">Parameters changed since this run, press the button again to refresh.</p>}
            <div className="stats" style={{ marginTop: 12 }}>
              <Stat label="Bootstrap diff" value={fmtVal(boot.result.diff)} />
              <Stat label={`${pct(1 - params.alpha, 0)} percentile CI`} value={`[${fmtVal(boot.result.ci[0])}, ${fmtVal(boot.result.ci[1])}]`} small />
              <Stat label="Bootstrap p-value" value={fmtP(boot.result.pValue)} tone={boot.result.pValue < params.alpha ? 'good' : undefined} />
              <Stat label="Parametric p-value" value={fmtP(a.freq.pValue)} />
            </div>
            <ResponsiveContainer width="100%" height={200}>
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
        <Help>
          Resamples each group with replacement and recomputes the mean difference. No normality assumption, so it is the sanity check for heavy-tailed revenue.
          The smallest p-value it can show is about 2 / resamples. With very large experiments the number of resamples is reduced to keep the page responsive.
        </Help>
      </div>
    </>
  )
}
