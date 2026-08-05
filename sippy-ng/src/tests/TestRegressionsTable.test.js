import { filterRegressionsByVariants } from './TestRegressionsTable'

const makeRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-06-01T00:00:00Z',
})

describe('filterRegressionsByVariants', () => {
  const regressions = [
    makeRegression(1, ['Architecture:amd64', 'Platform:gcp', 'Installer:ipi']),
    makeRegression(2, ['Architecture:amd64', 'Platform:aws', 'Installer:ipi']),
    makeRegression(3, [
      'Architecture:arm64',
      'Platform:azure',
      'Installer:upi',
    ]),
  ]

  test('returns all regressions when no variant filters are provided', () => {
    expect(filterRegressionsByVariants(regressions, [])).toEqual(regressions)
  })

  test('filters regressions by positive variant match', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  test('filters regressions by negated variant match', () => {
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
    expect(result.map((r) => r.id)).toEqual([2, 3])
  })

  test('applies multiple filters with AND logic', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Architecture:amd64',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:aws',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  test('combines positive and negated filters', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Architecture:amd64',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  test('handles case-insensitive matching', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'platform:GCP',
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  test('handles regression with no variants', () => {
    const regressionsWithEmpty = [makeRegression(4, null)]
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(regressionsWithEmpty, filters)
    expect(result).toHaveLength(0)
  })

  test('negated filter for value not present in any variant passes all', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    const result = filterRegressionsByVariants(regressions, filters)
    expect(result).toHaveLength(3)
  })

  test('returns empty when positive filter matches no regressions', () => {
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
})
