import { sampleSizePerVariant } from '../../stats/tests.ts'
import { fmtP, pct, RISK_THRESHOLD, WIN_THRESHOLD } from '../format.ts'
import ResultRow from '../ResultRow.tsx'
import { Banner, Help, Stat, SummaryBar } from '../ui.tsx'
import type { Workspace } from '../workspace.ts'

export default function ResultsPanel({ w }: { w: Workspace }) {
  const { params, source, srmPValue, active: a, useCuped, prior } = w
  const { freq, bayes } = a
  const isRevenue = params.metric === 'revenue'
  const significant = freq.pValue < params.alpha
  const srmBad = srmPValue < 0.001
  const fmtVal = (x: number) => (isRevenue || useCuped ? x.toFixed(4) : pct(x))
  const needed = sampleSizePerVariant(params.baseline, Math.max(Math.abs(params.relativeEffect), 0.001), params.alpha) * 2

  const verdict =
    bayes.chanceToWin >= WIN_THRESHOLD ? { text: 'Treatment is winning', tone: 'good' as const }
    : bayes.chanceToWin <= 1 - WIN_THRESHOLD ? { text: 'Control is winning', tone: 'bad' as const }
    : { text: 'Not enough evidence yet', tone: undefined }

  const headline = srmBad
    ? { tone: 'warn' as const, title: 'Sample ratio mismatch: do not trust these results', text: 'The actual split does not match the plan, so the groups are not comparable.' }
    : significant && freq.uplift > 0
      ? { tone: 'good' as const, title: 'Treatment wins', text: `Uplift ${pct(freq.uplift, 1)}, p ${freq.pValue < 0.0001 ? '< 0.0001' : '= ' + fmtP(freq.pValue)}, chance to win ${pct(bayes.chanceToWin, 1)}.` }
      : significant
        ? { tone: 'bad' as const, title: 'Treatment loses', text: `Uplift ${pct(freq.uplift, 1)}, p ${freq.pValue < 0.0001 ? '< 0.0001' : '= ' + fmtP(freq.pValue)}. Do not ship.` }
        : { tone: 'neutral' as const, title: 'No clear difference', text: `p = ${fmtP(freq.pValue)}: the gap could easily be noise. More users or a bigger effect are needed.` }

  return (
    <>
      <SummaryBar
        items={[
          ['Source', source === 'bigquery' ? 'BigQuery' : 'Simulator'],
          ['Total users', (a.control.n + a.treatment.n).toLocaleString()],
          ['CUPED', useCuped ? 'Enabled' : 'Disabled'],
          ['Prior', prior ? `Gaussian, sd ${prior.toFixed(2)}` : 'Flat'],
          ['SRM', srmBad ? 'Problem' : 'OK'],
        ]}
        warn={srmBad ? 'SRM' : undefined}
      />
      <Banner tone={headline.tone} title={headline.title}>{headline.text}</Banner>
      <ResultRow w={w} />
      <div className="cols">
        <div className="panel">
          <h2>Frequentist <span className="tag">{a.testName}</span></h2>
          <div className="stats">
            <Stat label={`Control (n=${a.control.n.toLocaleString()})`} value={fmtVal(a.control.mean)} />
            <Stat label={`Treatment (n=${a.treatment.n.toLocaleString()})`} value={fmtVal(a.treatment.mean)} />
            <Stat label="Uplift" value={pct(freq.uplift)} />
            <Stat label="p-value" value={fmtP(freq.pValue)} tone={significant ? (freq.uplift > 0 ? 'good' : 'bad') : undefined} />
            <Stat label={`${pct(1 - params.alpha, 0)} CI (absolute diff)`} value={`[${fmtVal(freq.ci[0])}, ${fmtVal(freq.ci[1])}]`} small />
            <Stat label="SRM p-value" value={fmtP(srmPValue)} tone={srmBad ? 'bad' : undefined} />
          </div>
          <Help>
            {significant ? 'Statistically significant' : 'Not significant'} at alpha={params.alpha}: p-value is the chance of a gap this big if there were no real effect.
            The CI is the plausible range of the absolute difference; if it includes 0, the result is not significant.
            SRM checks that the actual split matches the plan; red means the experiment is broken.{' '}
            {source === 'simulator' && !isRevenue && <>Detecting a {pct(Math.abs(params.relativeEffect), 1)} lift with 80% power needs about {needed.toLocaleString()} users in total.</>}
          </Help>
        </div>

        <div className="panel">
          <h2>Bayesian <span className="tag">{prior ? `Gaussian prior, sd ${prior.toFixed(2)}` : 'flat prior'}</span></h2>
          <div className="stats">
            <Stat label="Chance to win" value={pct(bayes.chanceToWin, 1)} tone={verdict.tone} />
            <Stat label="Expected uplift" value={pct(bayes.relativeEffect)} />
            <Stat label={`${pct(1 - params.alpha, 0)} credible interval`} value={`[${pct(bayes.ci[0], 1)}, ${pct(bayes.ci[1], 1)}]`} small />
            <Stat label="Risk if you ship treatment" value={pct(bayes.riskTreatment, 3)} tone={bayes.riskTreatment < RISK_THRESHOLD ? 'good' : undefined} />
            <Stat label="Risk if you keep control" value={pct(bayes.riskControl, 3)} />
            <Stat label="Verdict" value={verdict.text} tone={verdict.tone} small />
          </div>
          <Help>
            Same approach as GrowthBook: the relative lift gets a Gaussian posterior (delta method). Thresholds are chance to win ≥ {pct(WIN_THRESHOLD, 0)} and
            risk &lt; {pct(RISK_THRESHOLD, 2)}. Risk is the expected relative loss if the decision turns out wrong.
          </Help>
        </div>
      </div>
    </>
  )
}
