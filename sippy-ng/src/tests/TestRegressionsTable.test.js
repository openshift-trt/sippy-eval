import { filterRegressionsByVariants } from './TestRegressionsTable'

const regressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Upgrade:upgrade-micro'],
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Upgrade:none'],
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Network:sdn', 'never-stable'],
  },
]

describe('filterRegressionsByVariants', () => {
  test('returns all regressions when no filters are applied', () => {
    const result = filterRegressionsByVariants(regressions, [])
    expect(result).toHaveLength(3)
  })

  test('matches filter values in Key:Value format', () => {
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

  test('matches filter values as plain names', () => {
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
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 2])
  })

  test('multiple filters are combined with AND', () => {
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

  test('negated Key:Value filter works correctly', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:aws',
        not: true,
      },
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

  test('handles regressions with no variants', () => {
    const withNull = [...regressions, { id: 4, variants: null }]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(withNull, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })
})
