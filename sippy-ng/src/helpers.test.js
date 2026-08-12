import { parseVariantName, variantMatchesFilter } from './helpers'

describe('parseVariantName', () => {
  test('parses Key:Value format', () => {
    const result = parseVariantName('Platform:gcp')
    expect(result).toEqual({ name: 'gcp', variant: 'Platform' })
  })

  test('parses plain value without key prefix', () => {
    const result = parseVariantName('aggregated')
    expect(result).toEqual({ name: 'aggregated', variant: '' })
  })
})

describe('variantMatchesFilter', () => {
  test('matches full Key:Value filter against Key:Value variant', () => {
    expect(variantMatchesFilter('Platform:gcp', 'Platform:gcp')).toBe(true)
  })

  test('matches plain filter value against Key:Value variant name', () => {
    expect(variantMatchesFilter('Platform:gcp', 'gcp')).toBe(true)
  })

  test('matches plain filter against plain variant', () => {
    expect(variantMatchesFilter('aggregated', 'aggregated')).toBe(true)
  })

  test('is case-insensitive', () => {
    expect(variantMatchesFilter('Platform:GCP', 'platform:gcp')).toBe(true)
    expect(variantMatchesFilter('Platform:GCP', 'gcp')).toBe(true)
  })

  test('does not match unrelated variants', () => {
    expect(variantMatchesFilter('Platform:aws', 'Platform:gcp')).toBe(false)
    expect(variantMatchesFilter('Platform:aws', 'gcp')).toBe(false)
  })

  test('does not match when only key matches', () => {
    expect(variantMatchesFilter('Platform:aws', 'Platform:gcp')).toBe(false)
  })
})
