import { useState } from 'react'
import ExperimentTab from './components/ExperimentTab.tsx'
import PowerTab from './components/PowerTab.tsx'

type Tab = 'experiment' | 'power'

export default function App() {
  const [tab, setTab] = useState<Tab>('experiment')
  return (
    <>
      <h1>A/B test sandbox</h1>
      <p className="sub">Set a "true" effect, simulate users, and see what frequentist and Bayesian statistics make of it.</p>
      <nav className="tabs">
        <button className={tab === 'experiment' ? 'on' : ''} onClick={() => setTab('experiment')}>Experiment</button>
        <button className={tab === 'power' ? 'on' : ''} onClick={() => setTab('power')}>Power calculator</button>
      </nav>
      {tab === 'experiment' ? <ExperimentTab /> : <PowerTab />}
    </>
  )
}
