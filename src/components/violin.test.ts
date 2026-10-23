import { describe, expect, it } from 'vitest'
import { axisRange, niceTicks, violinSlice } from './violin.ts'

describe('violin geometry', () => {
  it('axis always includes zero and the whole posterior', () => {
    const r = axisRange(0.13, 0.02)
    expect(r.lo).toBeLessThan(0)
    expect(r.hi).toBeGreaterThan(0.13 + 3 * 0.02)
    const r2 = axisRange(-0.2, 0.03)
    expect(r2.hi).toBeGreaterThan(0)
  })
  it('ticks are round and inside the range', () => {
    const ticks = niceTicks({ lo: -0.03, hi: 0.2 })
    expect(ticks.length).toBeGreaterThan(3)
    expect(ticks.length).toBeLessThan(12)
    expect(ticks).toContain(0)
    for (const t of ticks) expect(t).toBeGreaterThanOrEqual(-0.03)
  })
  it('slice peaks at 1 at the mean and is symmetric around the center line', () => {
    const pts = violinSlice(0.1, 0.02, 0.0, 0.2, 100)
    const peak = Math.max(...pts.map((p) => p.h))
    expect(peak).toBeCloseTo(1, 3)
    expect(Math.min(...pts.map((p) => p.h))).toBeCloseTo(-peak, 10)
  })
  it('empty slice when the interval is empty', () => {
    expect(violinSlice(0.1, 0.02, 0.1, 0.1)).toEqual([])
  })
})
