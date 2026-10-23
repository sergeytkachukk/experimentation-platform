export const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '–')
export const fmtP = (p: number) => (p < 0.0001 ? '<0.0001' : p.toFixed(4))

export const GRID = '#2a3140'
export const TOOLTIP = { background: '#181d27', border: `1px solid ${GRID}` }

// GrowthBook's default decision thresholds.
export const WIN_THRESHOLD = 0.95
export const RISK_THRESHOLD = 0.0025

export const MAX_USERS = 300_000
// A/A runs are capped so 300 simulations stay fast even with huge experiments.
export const AA_USER_CAP = 20_000
