import { filterRegressionsByVariants } from './TestRegressionsTable'

const openRegression = (id, variants) => ({
  id,
  variants,
})

const closedRegression = (id, variants) => ({
  id,
  variants,
  closed: { Valid: true, Time: '2026-01-01T00:00:00Z' },
})

describe('filterRegressionsByVariants', () => {
  const regressions = [
    openRegression(1, ['Platform:gcp', 'Network:ovn', 'Architecture:amd64']),
    openRegression(2, ['Platform:aws', 'Network:sdn', 'Architecture:amd64']),
    openRegression(3, [
      'Platform:gcp',
      'Network:ovn',
      'Architecture:arm64',
      'Aggregation:aggregated',
    ]),
    closedRegression(4, ['Platform:azure', 'Network:ovn']),
  ]

  test('returns all open regressions when no filters are applied', () => {
    const result = filterRegressionsByVariants(regressions, [])
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual([1, 2, 3])
  })

  test('excludes closed regressions', () => {
    const result = filterRegressionsByVariants(regressions, [])
    expect(result.find((r) => r.id === 4)).toBeUndefined()
  })

  test('filters by Key:Value format variant', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('filters by plain value without key prefix', () => {
    const filters = [
      { columnField: 'variants', operatorValue: 'has entry', value: 'gcp' },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('negated filter excludes matching regressions', () => {
    const filters = [
      {
        columnField: 'variants',
        not: true,
        operatorValue: 'has entry',
        value: 'aggregated',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 2])
  })

  test('negated Key:Value filter excludes matching regressions', () => {
    const filters = [
      {
        columnField: 'variants',
        not: true,
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([2])
  })

  test('combines positive and negated variant filters', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
      {
        columnField: 'variants',
        not: true,
        operatorValue: 'has entry',
        value: 'aggregated',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:GCP',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('returns empty when no regressions match', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:vsphere',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(0)
  })

  test('handles regressions with no variants', () => {
    const regs = [openRegression(10, null), openRegression(11, [])]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regs, filters)
    expect(result).toHaveLength(0)
  })
})
