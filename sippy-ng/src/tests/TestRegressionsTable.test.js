import { filterRegressionsByVariants } from './TestRegressionsTable'

describe('filterRegressionsByVariants', () => {
  const regressions = [
    { id: 1, variants: ['Platform:gcp', 'Network:ovn', 'Architecture:amd64'] },
    { id: 2, variants: ['Platform:aws', 'Network:sdn', 'Architecture:amd64'] },
    {
      id: 3,
      variants: [
        'Platform:gcp',
        'Network:ovn',
        'Architecture:arm64',
        'Aggregation:aggregated',
      ],
    },
    { id: 4, variants: ['Platform:azure', 'Network:ovn'] },
  ]

  test('returns all regressions when no filters are applied', () => {
    const result = filterRegressionsByVariants(regressions, [])
    expect(result).toHaveLength(4)
  })

  test('matches full Key:Value variant filter from autocomplete', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('matches simple value variant filter without key prefix', () => {
    const filters = [
      { columnField: 'variants', operatorValue: 'has entry', value: 'ovn' },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual([1, 3, 4])
  })

  test('excludes regressions with negated filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'aggregated',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual([1, 2, 4])
  })

  test('combines positive and negated filters', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'aggregated',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  test('is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'PLATFORM:GCP',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('handles regressions with null or missing variants', () => {
    const regressionsWithNulls = [
      { id: 10, variants: null },
      { id: 11 },
      { id: 12, variants: ['Platform:gcp'] },
    ]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressionsWithNulls, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(12)
  })

  test('returns empty when no regressions match positive filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:metal',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(0)
  })

  test('negated full Key:Value filter excludes correctly', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual([2, 4])
  })

  test('default Test Analysis filters work correctly', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'aggregated',
        not: true,
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual([1, 2, 4])
  })
})
