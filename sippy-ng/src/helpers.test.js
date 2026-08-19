import { filterRegressionsByVariants, parseVariantName } from './helpers'

describe('parseVariantName', () => {
  test('splits Category:value format', () => {
    expect(parseVariantName('Platform:gcp')).toEqual({
      name: 'gcp',
      variant: 'Platform',
    })
  })

  test('returns unprefixed string as-is', () => {
    expect(parseVariantName('never-stable')).toEqual({
      name: 'never-stable',
      variant: '',
    })
  })
})

describe('filterRegressionsByVariants', () => {
  const regressions = [
    { id: 1, variants: ['Platform:gcp', 'Network:ovn', 'Architecture:amd64'] },
    { id: 2, variants: ['Platform:aws', 'Network:sdn', 'Architecture:amd64'] },
    { id: 3, variants: ['Platform:azure', 'Network:ovn', 'never-stable'] },
    { id: 4, variants: [] },
    { id: 5, variants: null },
  ]

  test('returns all regressions when no filters applied', () => {
    const result = filterRegressionsByVariants(regressions, [])
    expect(result).toEqual(regressions)
  })

  test('filters by Category:value variant', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: false,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('excludes by negated Category:value variant', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([2, 3, 4, 5])
  })

  test('filters by unprefixed variant', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: false,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([3])
  })

  test('excludes unprefixed variant', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 2, 4, 5])
  })

  test('combines inclusion and exclusion filters', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Network:ovn',
        not: false,
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

  test('is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'platform:GCP',
        not: false,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('returns empty when no regressions match', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:nonexistent',
        not: false,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toEqual([])
  })
})
