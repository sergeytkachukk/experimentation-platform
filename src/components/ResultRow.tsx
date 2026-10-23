import { pct, WIN_THRESHOLD } from './format.ts'
import { axisRange, niceTicks, violinSlice } from './violin.ts'
import type { Workspace } from './workspace.ts'

const W = 900
const H = 72
const PAD = 16
const CY = 46
const AMP = 14

const METRIC_NAMES = { conversion: 'Conversion rate', click: 'Click rate', revenue: 'Revenue per user' } as const

// GrowthBook-style result row: values, chance to win, and the posterior of the relative change
// drawn as a violin (red where the change is negative, green where it is positive).
export default function ResultRow({ w }: { w: Workspace }) {
  const { params, active: a, useCuped } = w
  const { bayes } = a
  const isRevenue = params.metric === 'revenue'
  const fmtVal = (x: number) => (isRevenue || useCuped ? x.toFixed(3) : pct(x))
  const sub = (g: { n: number; mean: number }) =>
    isRevenue || useCuped ? `${g.n.toLocaleString()} users` : `${Math.round(g.mean * g.n).toLocaleString()} / ${g.n.toLocaleString()}`

  const hasPlot = Number.isFinite(bayes.sd) && bayes.sd > 0
  const win = bayes.chanceToWin
  const tone = win >= WIN_THRESHOLD ? 'good' : win <= 1 - WIN_THRESHOLD ? 'bad' : ''
  const up = bayes.relativeEffect >= 0

  let plot = <span className="muted">not enough data</span>
  if (hasPlot) {
    const range = axisRange(bayes.relativeEffect, bayes.sd)
    const x = (v: number) => PAD + ((v - range.lo) / (range.hi - range.lo)) * (W - 2 * PAD)
    const toPoints = (pts: { x: number; h: number }[]) => pts.map((p) => `${x(p.x).toFixed(1)},${(CY - p.h * AMP).toFixed(1)}`).join(' ')
    const neg = violinSlice(bayes.relativeEffect, bayes.sd, range.lo, Math.min(0, range.hi))
    const pos = violinSlice(bayes.relativeEffect, bayes.sd, Math.max(0, range.lo), range.hi)
    const ticks = niceTicks(range, 10)
    plot = (
      <svg viewBox={`0 0 ${W} ${H}`} className="violin" role="img" aria-label={`Posterior of relative change, chance to win ${pct(win, 1)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={20} y2={H} className={t === 0 ? 'zero' : 'grid'} />
            <line x1={x(t)} x2={x(t)} y1={16} y2={22} className="tickmark" />
            <text x={x(t)} y={11} textAnchor="middle" className="tick">{`${+(t * 100).toFixed(2)}%`}</text>
          </g>
        ))}
        <polygon points={toPoints(neg)} className="neg" />
        <polygon points={toPoints(pos)} className="pos" />
        <line x1={x(bayes.relativeEffect)} x2={x(bayes.relativeEffect)} y1={CY - AMP * 0.7} y2={CY + AMP * 0.7} className="mean" />
        <title>{`Expected change ${pct(bayes.relativeEffect)}, credible interval [${pct(bayes.ci[0], 1)}, ${pct(bayes.ci[1], 1)}]`}</title>
      </svg>
    )
  }

  return (
    <div className="panel result-row-panel">
      <div className="result-table">
        <div className="rt-head">Goal metric</div>
        <div className="rt-head"><span className="dot c">0</span>Control</div>
        <div className="rt-head"><span className="dot t">1</span>Treatment</div>
        <div className="rt-head">Chance to win</div>
        <div className="rt-head right">% change</div>

        <div className="rt-name">{METRIC_NAMES[params.metric]}</div>
        <div className="rt-val">{fmtVal(a.control.mean)}<small>{sub(a.control)}</small></div>
        <div className="rt-val">{fmtVal(a.treatment.mean)}<small>{sub(a.treatment)}</small></div>
        <div className={`rt-win ${tone}`}>{pct(win, 1)}</div>
        <div className={`rt-change ${up ? 'good' : 'bad'}`}>{up ? '↑' : '↓'} {pct(Math.abs(bayes.relativeEffect))}</div>

        <div className="rt-sub">Change vs control</div>
        <div className="rt-plot">{plot}</div>
      </div>
    </div>
  )
}
