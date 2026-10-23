import { describe, expect, it } from 'vitest'
import { buildSummarySql, isIdentifier, isMetric } from './query.ts'

describe('buildSummarySql', () => {
  it('builds a conversion query against the right table', () => {
    const sql = buildSummarySql('my-project-123', 'ab_sandbox', 'users', 'conversion')
    expect(sql).toContain('`my-project-123.ab_sandbox.users`')
    expect(sql).toContain('CAST(converted AS INT64) AS y')
    expect(sql).toContain('GROUP BY variant')
  })
  it('uses revenue columns for the revenue metric', () => {
    expect(buildSummarySql('my-project-123', 'ab_sandbox', 'users', 'revenue')).toContain('revenue AS y, pre_revenue AS x')
  })
  it('rejects names that could inject SQL', () => {
    expect(() => buildSummarySql('my-project-123', 'ab_sandbox', 'users`; DROP TABLE x; --', 'conversion')).toThrow()
    expect(() => buildSummarySql('bad project', 'ab_sandbox', 'users', 'conversion')).toThrow()
    expect(isIdentifier('users')).toBe(true)
    expect(isIdentifier('a.b')).toBe(false)
  })
  it('only accepts known metrics', () => {
    expect(isMetric('revenue')).toBe(true)
    expect(isMetric('click')).toBe(false)
  })
})
