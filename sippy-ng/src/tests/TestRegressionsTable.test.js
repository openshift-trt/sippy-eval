import { filterRegressions } from './TestRegressionsTable'

const openRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-01-01T00:00:00Z',
})

const closedRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-01-01T00:00:00Z',
  closed: { Valid: true, Time: '2026-02-01T00:00:00Z' },
})

describe('filterRegressions', () => {
  const regressions = [
    openRegression(1, ['Platform:gcp', 'Network:ovn', 'Upgrade:none']),
    openRegression(2, ['Platform:aws', 'Network:sdn', 'Upgrade:micro']),
    openRegression(3, ['Platform:gcp', 'Network:sdn', 'Upgrade:none']),
    closedRegression(4, ['Platform:azure', 'Network:ovn']),
  ]

  test('returns all open regressions when no variant filters', () => {
    const result = filterRegressions(regressions, [])
    expect(result.map((r) => r.id)).toEqual([1, 2, 3])
  })

  test('filters by positive variant match using full Key:Value', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressions(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('excludes regressions with negated variant filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: true,
        value: 'Network:sdn',
      },
    ]
    const result = filterRegressions(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('applies multiple filters with AND logic', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Network:ovn',
      },
    ]
    const result = filterRegressions(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('combines positive and negative filters', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: true,
        value: 'Network:sdn',
      },
    ]
    const result = filterRegressions(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('case-insensitive matching', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'PLATFORM:GCP',
      },
    ]
    const result = filterRegressions(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('returns empty when no regressions match the filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:azure',
      },
    ]
    const result = filterRegressions(regressions, filters)
    expect(result).toEqual([])
  })

  test('handles regressions with null variants', () => {
    const regs = [openRegression(5, null)]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressions(regs, filters)
    expect(result).toEqual([])
  })
})
