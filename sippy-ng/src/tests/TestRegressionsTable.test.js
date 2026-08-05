import { filterRegressionsByVariants } from './TestRegressionsTable'

const regressionGCP = {
  id: 1,
  variants: ['Platform:gcp', 'Network:ovn', 'Topology:ha'],
}

const regressionAWS = {
  id: 2,
  variants: ['Platform:aws', 'Network:sdn', 'Topology:ha'],
}

const regressionAggregated = {
  id: 3,
  variants: ['Aggregation:aggregated', 'Platform:aws'],
}

const regressionNeverStable = {
  id: 4,
  variants: ['Suite:never-stable', 'Platform:gcp'],
}

const allRegressions = [
  regressionGCP,
  regressionAWS,
  regressionAggregated,
  regressionNeverStable,
]

describe('filterRegressionsByVariants', () => {
  test('returns all regressions when no filters are applied', () => {
    const result = filterRegressionsByVariants(allRegressions, [])
    expect(result).toEqual(allRegressions)
  })

  test('filters by full Key:Value variant format', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 4])
  })

  test('filters by value-only format', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'aggregated',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([3])
  })

  test('excludes regressions with NOT filter using value-only format', () => {
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
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 2])
  })

  test('excludes regressions with NOT filter using Key:Value format', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:aws',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 4])
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
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'PLATFORM:GCP',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 4])
  })

  test('handles regressions with null variants', () => {
    const regressions = [{ id: 5, variants: null }]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toEqual([])
  })

  test('requires all positive filters to match', () => {
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
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })
})
