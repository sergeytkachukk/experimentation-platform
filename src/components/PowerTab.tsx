import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Field } from './ui.tsx'
import { powerMeans, powerProportions, sampleSizeMeans, sampleSizePerVariant } from '../stats/tests.ts'

type Mode = 'proportion' | 'mean'

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

export default function PowerTab() {
  const [mode, setMode] = useState<Mode>('proportion')
  const [baseline, setBaseline] = useState(0.1)
  const [mean, setMean] = useState(5)
  const [sd, setSd] = useState(20)
  const [mde, setMde] = useState(0.1)
  const [alpha, setAlpha] = useState(0.05)
  const [power, setPower] = useState(0.8)
  const [daily, setDaily] = useState(2000)

  const perVariant = (m: number) =>
    mode === 'proportion' ? sampleSizePerVariant(baseline, m, alpha, power) : sampleSizeMeans(sd, mean * m, alpha, power)
  const powerAt = (n: number, m: number) => (mode === 'proportion' ? powerProportions(n, baseline, m, alpha) : powerMeans(n, sd, mean * m, alpha))

  const n = perVariant(mde)
  const total = n * 2
  const days = Math.ceil(total / daily)

  const curve = useMemo(() => {
    const top = n * 2
    return Array.from({ length: 41 }, (_, i) => {
      const x = Math.round((top * i) / 40)
      return { n: x, power: x < 2 ? 0 : powerAt(x, mde) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, baseline, mean, sd, mde, alpha, power, n])

  return (
    <div className="layout">
      <div className="panel">
        <h2>Power calculator</h2>
        <label>
          Metric type
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="proportion">Proportion (conversion, click)</option>
            <option value="mean">Mean (revenue per user, time on site)</option>
          </select>
        </label>
        {mode === 'proportion' ? (
          <Field label="Baseline rate" value={baseline} onChange={setBaseline} min={0.01} max={0.5} step={0.005} scale={100} suffix="%" decimals={1} />
        ) : (
          <>
            <label>
              Baseline mean
              <input type="number" min={0.01} step="any" value={mean} onChange={(e) => setMean(Math.max(0.01, +e.target.value))} />
            </label>
            <label>
              Standard deviation
              <input type="number" min={0.01} step="any" value={sd} onChange={(e) => setSd(Math.max(0.01, +e.target.value))} />
            </label>
          </>
        )}
        <Field label="Minimum detectable effect (relative)" value={mde} onChange={setMde} min={0.01} max={0.5} step={0.01} scale={100} suffix="%" decimals={0} />
        <label>
          Alpha <span>{alpha}</span>
          <select value={alpha} onChange={(e) => setAlpha(+e.target.value)}>
            <option value={0.01}>0.01</option>
            <option value={0.05}>0.05</option>
            <option value={0.1}>0.1</option>
          </select>
        </label>
        <Field label="Power" value={power} onChange={setPower} min={0.5} max={0.99} step={0.01} scale={100} suffix="%" decimals={0} />
        <label>
          Eligible users per day (both variants)
          <input type="number" min={1} value={daily} onChange={(e) => setDaily(Math.max(1, +e.target.value))} />
        </label>
      </div>

      <div>
        <div className="panel">
          <h2>Required sample size</h2>
          <div className="stats">
            <div className="stat"><small>Per variant</small><b>{n.toLocaleString()}</b></div>
            <div className="stat"><small>Total (50/50 split)</small><b>{total.toLocaleString()}</b></div>
            <div className="stat"><small>Duration</small><b>{days.toLocaleString()} {days === 1 ? 'day' : 'days'}</b></div>
          </div>
          <p className="note">Two-sided test, equal split. Halving the detectable effect roughly quadruples the sample you need.</p>
        </div>

        <div className="panel">
          <h2>Power vs sample size</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={curve}>
              <CartesianGrid stroke="#2a3140" />
              <XAxis dataKey="n" stroke="#8d97a8" type="number" domain={[0, 'dataMax']} tickFormatter={(v) => Number(v).toLocaleString()} />
              <YAxis domain={[0, 1]} stroke="#8d97a8" tickFormatter={(v) => pct(Number(v), 0)} />
              <Tooltip contentStyle={{ background: '#181d27', border: '1px solid #2a3140' }} formatter={(v) => pct(Number(v))} labelFormatter={(v) => `${Number(v).toLocaleString()} per variant`} />
              <ReferenceLine y={power} stroke="#4cc38a" strokeDasharray="4 4" />
              <ReferenceLine x={n} stroke="#4cc38a" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="power" stroke="#6aa5ff" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>Sample size by effect size</h2>
          <table>
            <thead><tr><th>Relative MDE</th><th>Per variant</th><th>Total</th><th>Days</th></tr></thead>
            <tbody>
              {[0.02, 0.05, 0.1, 0.15, 0.2, 0.3].map((m) => {
                const nn = perVariant(m)
                return (
                  <tr key={m}>
                    <td>{pct(m, 0)}</td>
                    <td>{nn.toLocaleString()}</td>
                    <td>{(nn * 2).toLocaleString()}</td>
                    <td>{Math.ceil((nn * 2) / daily).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
