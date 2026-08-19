import { filterRegressionsByVariants } from './TestRegressionsTable'

const makeRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-01-01T00:00:00Z',
})

describe('filterRegressionsByVariants', () => {
  const regressions = [
    makeRegression(1, ['Platform:gcp', 'Network:ovn', 'Architecture:amd64']),
    makeRegression(2, ['Platform:aws', 'Network:sdn', 'Architecture:amd64']),
    makeRegression(3, [
      'Platform:gcp',
      'Network:ovn',
      'Architecture:arm64',
      'never-stable',
    ]),
    makeRegression(4, ['Platform:azure', 'Network:ovn']),
  ]

  test('returns all regressions when no filters', () => {
    expect(filterRegressionsByVariants(regressions, [])).toEqual(regressions)
  })

  test('filters by category:value variant (e.g. Platform:gcp)', () => {
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

  test('excludes with negated filter (not has entry)', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
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
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('matching is case-insensitive', () => {
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

  test('returns empty when no regressions match filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:metal',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toEqual([])
  })

  test('handles regressions with null variants', () => {
    const withNull = [makeRegression(5, null)]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    expect(filterRegressionsByVariants(withNull, filters)).toEqual([])
  })
})
