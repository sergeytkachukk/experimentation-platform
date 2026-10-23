import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeSummaries, cupedFromSummaries } from '../analysis.ts'
import { BqUnavailableError, DEMO_TABLES, demoSummary, fetchSummary } from './client.ts'

const analyze = (table: string, metric: 'conversion' | 'revenue') => {
  const s = demoSummary(table, metric)
  const o = { metric, alpha: 0.05, priorSd: null, cuped: false }
  return { s, a: analyzeSummaries(s.control, s.treatment, o, cupedFromSummaries(s.control, s.treatment)) }
}

describe('bundled sample data', () => {
  it('has the four tables with 100,000 users each', () => {
    expect(DEMO_TABLES.sort()).toEqual(['users', 'users_aa', 'users_loss', 'users_small'])
    for (const t of DEMO_TABLES) {
      const { s } = analyze(t, 'conversion')
      expect(s.control.n + s.treatment.n).toBe(100000)
      expect(s.sample).toBe(true)
    }
  })
  it('users: a clear win', () => {
    const { a } = analyze('users', 'conversion')
    expect(a.freq.pValue).toBeLessThan(0.001)
    expect(a.freq.uplift).toBeGreaterThan(0.08)
    expect(a.bayes.chanceToWin).toBeGreaterThan(0.99)
  })
  it('users_loss: a clear loss', () => {
    const { a } = analyze('users_loss', 'conversion')
    expect(a.freq.pValue).toBeLessThan(0.001)
    expect(a.freq.uplift).toBeLessThan(-0.08)
    expect(a.bayes.chanceToWin).toBeLessThan(0.01)
  })
  it('users_aa: no real difference', () => {
    const { a } = analyze('users_aa', 'conversion')
    expect(Math.abs(a.freq.uplift)).toBeLessThan(0.05)
    expect(a.freq.pValue).toBeGreaterThan(0.01)
  })
  it('users_small: a tiny effect points the right way', () => {
    const { a } = analyze('users_small', 'conversion')
    expect(a.freq.uplift).toBeGreaterThan(0)
    expect(a.freq.uplift).toBeLessThan(0.1)
  })
  it('revenue works too and unknown tables give a helpful error', () => {
    expect(Number.isFinite(analyze('users', 'revenue').a.freq.pValue)).toBe(true)
    expect(() => demoSummary('nope', 'conversion')).toThrow(/Available/)
  })
})

describe('fetchSummary falls back to "unavailable" errors', () => {
  const stub = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))
  afterEach(() => vi.unstubAllGlobals())

  it('API not reachable', async () => {
    stub(() => Promise.reject(new TypeError('fetch failed')))
    await expect(fetchSummary('users', 'conversion')).rejects.toBeInstanceOf(BqUnavailableError)
  })
  it('static host: /api returns an HTML 404', async () => {
    stub(() => Promise.resolve(new Response('<html>Not found</html>', { status: 404 })))
    await expect(fetchSummary('users', 'conversion')).rejects.toBeInstanceOf(BqUnavailableError)
  })
  it('missing Google credentials (401)', async () => {
    stub(() => Promise.resolve(new Response(JSON.stringify({ error: 'Google credentials not found' }), { status: 401 })))
    await expect(fetchSummary('users', 'conversion')).rejects.toBeInstanceOf(BqUnavailableError)
  })
  it('a real request error is NOT treated as unavailable', async () => {
    stub(() => Promise.resolve(new Response(JSON.stringify({ error: 'Not found: Table x' }), { status: 500 })))
    const err = await fetchSummary('users', 'conversion').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(BqUnavailableError)
  })
})
