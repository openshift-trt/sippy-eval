import { filterRegressionsByVariants } from './TestRegressionsTable'

const openRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-07-01T00:00:00Z',
})

const closedRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-07-01T00:00:00Z',
  closed: { Valid: true, Time: '2026-07-10T00:00:00Z' },
})

describe('filterRegressionsByVariants', () => {
  const gcpRegression = openRegression(1, [
    'Platform:gcp',
    'Network:ovn',
    'Upgrade:minor',
  ])
  const awsRegression = openRegression(2, [
    'Platform:aws',
    'Network:sdn',
    'Upgrade:micro',
  ])
  const neverStableRegression = openRegression(3, ['never-stable'])
  const allRegressions = [gcpRegression, awsRegression, neverStableRegression]

  test('returns all open regressions when no variant filters', () => {
    const result = filterRegressionsByVariants(allRegressions, [])
    expect(result).toEqual(allRegressions)
  })

  test('excludes closed regressions', () => {
    const regressions = [gcpRegression, closedRegression(99, ['Platform:gcp'])]
    const result = filterRegressionsByVariants(regressions, [])
    expect(result).toEqual([gcpRegression])
  })

  test('matches keyed variant filters like Platform:gcp', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result).toEqual([gcpRegression])
  })

  test('matches unkeyed variant filters like never-stable', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result).toEqual([neverStableRegression])
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
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result).toEqual([gcpRegression, awsRegression])
  })

  test('multiple filters are AND-ed together', () => {
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
    expect(result).toEqual([gcpRegression])
  })

  test('comparison is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'PLATFORM:GCP',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result).toEqual([gcpRegression])
  })

  test('returns empty when no regressions match the filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:azure',
      },
    ]
    const result = filterRegressionsByVariants(allRegressions, filters)
    expect(result).toEqual([])
  })

  test('handles regressions with null variants', () => {
    const nullVariantRegression = openRegression(4, null)
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressionsByVariants([nullVariantRegression], filters)
    expect(result).toEqual([])
  })
})
