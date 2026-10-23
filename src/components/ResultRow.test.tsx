import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyze, computeCuped } from '../analysis.ts'
import { simulate } from '../sim/simulate.ts'
import type { SimParams } from '../sim/simulate.ts'
import ResultRow from './ResultRow.tsx'
import type { Workspace } from './workspace.ts'

const params: SimParams = {
  metric: 'conversion', users: 40000, baseline: 0.1, relativeEffect: 0.15, treatmentShare: 0.5, actualTreatmentShare: 0.5,
  avgOrderValue: 50, orderSigma: 1, preCorrelation: 0.5, seed: 1, alpha: 0.05, checkpoints: 40,
}

function workspace(p: SimParams): Workspace {
  const sim = simulate(p)
  const cuped = computeCuped(sim)
  const o = { metric: p.metric, alpha: p.alpha, priorSd: null }
  const raw = analyze(sim, { ...o, cuped: false }, cuped)
  const adjusted = analyze(sim, { ...o, cuped: true }, cuped)
  return { source: 'simulator', params: p, prior: null, useCuped: false, cuped, raw, adjusted, active: raw, path: sim.path, srmPValue: sim.srmPValue }
}

describe('ResultRow', () => {
  it('draws a green violin and a positive change for a winning treatment', () => {
    const html = renderToStaticMarkup(<ResultRow w={workspace(params)} />)
    expect(html).toContain('Conversion rate')
    expect(html).toContain('class="pos"')
    expect(html).toContain('↑')
    expect(html).toContain('100.0%') // chance to win
  })
  it('shows a red negative change for a losing treatment', () => {
    const html = renderToStaticMarkup(<ResultRow w={workspace({ ...params, relativeEffect: -0.15 })} />)
    expect(html).toContain('↓')
    expect(html).toContain('class="neg"')
  })
  it('renders revenue per user with user counts', () => {
    const html = renderToStaticMarkup(<ResultRow w={workspace({ ...params, metric: 'revenue', users: 5000 })} />)
    expect(html).toContain('Revenue per user')
    expect(html).toContain('users')
  })
})
