import { matchesVariantFilters, parseVariantName } from './helpers'

describe('parseVariantName', () => {
  test('splits Key:Value format', () => {
    expect(parseVariantName('Platform:gcp')).toEqual({
      name: 'gcp',
      variant: 'Platform',
    })
  })

  test('returns bare value when no colon present', () => {
    expect(parseVariantName('aggregated')).toEqual({
      name: 'aggregated',
      variant: '',
    })
  })
})

describe('matchesVariantFilters', () => {
  const gcpVariants = ['Platform:gcp', 'Network:ovn', 'Topology:ha']

  test('matches full Key:Value filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(true)
  })

  test('matches bare value filter', () => {
    const filters = [
      { columnField: 'variants', operatorValue: 'has entry', value: 'gcp' },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(true)
  })

  test('does not match unrelated filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:aws',
      },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(false)
  })

  test('negated filter excludes matching variants', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(false)
  })

  test('negated filter includes non-matching variants', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'never-stable',
        not: true,
      },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(true)
  })

  test('multiple filters all must match', () => {
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
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(true)
  })

  test('fails when one of multiple filters does not match', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Network:sdn',
      },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(false)
  })

  test('case-insensitive matching', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'platform:GCP',
      },
    ]
    expect(matchesVariantFilters(gcpVariants, filters)).toBe(true)
  })

  test('empty filters match everything', () => {
    expect(matchesVariantFilters(gcpVariants, [])).toBe(true)
  })

  test('empty variants fail positive filter', () => {
    const filters = [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ]
    expect(matchesVariantFilters([], filters)).toBe(false)
  })
})
