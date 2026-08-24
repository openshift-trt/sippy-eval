import { filterRegressionsByVariants } from './TestRegressionsTable'

const makeRegression = (id, variants) => ({
  id,
  variants,
})

describe('filterRegressionsByVariants', () => {
  const regressions = [
    makeRegression(1, ['Platform:gcp', 'Network:ovn', 'Architecture:amd64']),
    makeRegression(2, ['Platform:aws', 'Network:sdn', 'Architecture:amd64']),
    makeRegression(3, ['Platform:gcp', 'Network:sdn', 'Architecture:arm64']),
    makeRegression(4, null),
  ]

  test('returns all regressions when no filters are provided', () => {
    expect(filterRegressionsByVariants(regressions, [])).toEqual(regressions)
  })

  test('matches full Key:Value variant filter', () => {
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

  test('matches value-only variant filter', () => {
    const filters = [
      { columnField: 'variants', operatorValue: 'has entry', value: 'gcp' },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('case-insensitive matching', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'PLATFORM:GCP',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('negated filter excludes matching regressions', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([2, 4])
  })

  test('multiple filters are ANDed together', () => {
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
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('mixed positive and negated filters', () => {
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
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([3])
  })

  test('negated filter on never-stable excludes nothing when absent', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toEqual(regressions)
  })

  test('filter with no matches returns empty', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:azure',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toEqual([])
  })
})
