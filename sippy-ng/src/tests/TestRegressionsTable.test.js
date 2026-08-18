import { filterRegressionsByVariants } from './TestRegressionsTable'

const regressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Arch:amd64'],
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Arch:amd64'],
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Network:sdn', 'Arch:arm64'],
  },
  {
    id: 4,
    variants: [],
  },
]

describe('filterRegressionsByVariants', () => {
  test('returns all regressions when no filters are applied', () => {
    const result = filterRegressionsByVariants(regressions, [])
    expect(result).toEqual(regressions)
  })

  test('filters by exact variant match with has entry', () => {
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

  test('excludes variants with not modifier', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:aws',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3, 4])
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
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('handles has entry containing operator', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry containing',
        value: 'gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('handles is empty operator', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'is empty',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([4])
  })

  test('handles is empty with not modifier', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'is empty',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 2, 3])
  })

  test('matching is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'platform:GCP',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('handles regressions with null variants', () => {
    const input = [{ id: 5, variants: null }]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(input, filters)
    expect(result).toEqual([])
  })
})
