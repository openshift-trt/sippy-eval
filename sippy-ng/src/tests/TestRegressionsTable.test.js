import { parseVariantName } from '../helpers'

function filterRegressions(regressions, variantFilters) {
  let filtered = regressions.filter((r) => !r.closed || !r.closed.Valid)

  if (variantFilters.length === 0) return filtered

  return filtered.filter((regression) => {
    const variants = regression.variants || []

    return variantFilters.every((filter) => {
      const filterVal = filter.value.toLowerCase()
      const hasMatch = variants.some(
        (v) =>
          v.toLowerCase() === filterVal ||
          parseVariantName(v).name.toLowerCase() === filterVal
      )
      if (filter.not) {
        return !hasMatch
      }
      return hasMatch
    })
  })
}

const sampleRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Architecture:amd64'],
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Architecture:amd64'],
  },
  {
    id: 3,
    variants: [
      'Platform:gcp',
      'Network:ovn',
      'Architecture:arm64',
      'JobTier:aggregated',
    ],
  },
  {
    id: 4,
    variants: ['Platform:azure', 'Network:ovn'],
    closed: { Valid: true },
  },
]

describe('TestRegressionsTable variant filtering', () => {
  test('returns all open regressions when no variant filters are set', () => {
    const result = filterRegressions(sampleRegressions, [])
    expect(result.map((r) => r.id)).toEqual([1, 2, 3])
  })

  test('matches full Key:Value filter value against variant strings', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    const result = filterRegressions(sampleRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('matches value-only filter against parsed variant name', () => {
    const filters = [
      { columnField: 'variants', operatorValue: 'has entry', value: 'ovn' },
    ]
    const result = filterRegressions(sampleRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('negated filter excludes matching regressions', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: true,
        value: 'aggregated',
      },
    ]
    const result = filterRegressions(sampleRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 2])
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
        not: true,
        value: 'aggregated',
      },
    ]
    const result = filterRegressions(sampleRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1])
  })

  test('matching is case-insensitive', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'platform:GCP',
      },
    ]
    const result = filterRegressions(sampleRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })

  test('excludes closed regressions', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Network:ovn',
      },
    ]
    const result = filterRegressions(sampleRegressions, filters)
    expect(result.map((r) => r.id)).toEqual([1, 3])
  })
})
