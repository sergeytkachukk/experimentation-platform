import { useState } from 'react'
import type { ReactNode } from 'react'

export function Stat({ label, value, tone, small }: { label: string; value: string; tone?: 'good' | 'bad'; small?: boolean }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b className={tone} style={small ? { fontSize: 15 } : undefined}>{value}</b>
    </div>
  )
}

// Explanations live behind a toggle so the page stays calm; open them when you need the "why".
export function Help({ children, title = 'How to read this' }: { children: ReactNode; title?: string }) {
  return (
    <details className="help">
      <summary>{title}</summary>
      <div className="note">{children}</div>
    </details>
  )
}

// One-line experiment summary (GrowthBook-style header): label: value pairs.
export function SummaryBar({ items, warn }: { items: [string, string][]; warn?: string }) {
  return (
    <div className="summary-bar">
      {items.map(([k, v]) => (
        <span key={k} className={warn === k ? 'warn' : undefined}>
          {k}: <b>{v}</b>
        </span>
      ))}
    </div>
  )
}

export function Banner({ tone, title, children }: { tone: 'good' | 'bad' | 'neutral' | 'warn'; title: string; children?: ReactNode }) {
  return (
    <div className={`banner ${tone}`}>
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  )
}

interface FieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  scale?: number // multiplier between stored value and displayed value (100 for percents)
  suffix?: string
  decimals?: number
  slider?: boolean
}

// Slider plus a number box: drag for a feel, type for an exact value.
// Typed values apply live while in range and are clamped on blur / Enter.
export function Field({ label, value, onChange, min, max, step, scale = 1, suffix = '', decimals = 0, slider = true }: FieldProps) {
  const shown = Number((value * scale).toFixed(decimals))
  const [draft, setDraft] = useState<string | null>(null) // non-null only while the box is being edited
  const lo = min * scale
  const hi = max * scale
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <span className="field-input">
          <input
            type="number"
            value={draft ?? String(shown)}
            min={lo}
            max={hi}
            step={step * scale}
            onFocus={() => setDraft(String(shown))}
            onChange={(e) => {
              setDraft(e.target.value)
              const v = e.target.valueAsNumber
              if (Number.isFinite(v) && v >= lo && v <= hi) onChange(v / scale)
            }}
            onBlur={(e) => {
              const v = e.target.valueAsNumber
              onChange(Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : shown)) / scale)
              setDraft(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {suffix && <em>{suffix}</em>}
        </span>
      </div>
      {slider && <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />}
    </div>
  )
}
