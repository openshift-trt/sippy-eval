import { matchesVariantFilters } from './regressionFilters'

describe('matchesVariantFilters', () => {
  const regression = { variants: ['Platform:gcp', 'Architecture:amd64'] }

  test.each([
    {
      name: 'matches a complete qualified variant entry',
      filter: {
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
      expected: true,
    },
    {
      name: 'does not match a different qualified variant',
      filter: {
        operatorValue: 'has entry',
        value: 'Platform:aws',
      },
      expected: false,
    },
    {
      name: 'matches a substring when the containing operator is selected',
      filter: {
        operatorValue: 'has entry containing',
        value: 'gcp',
      },
      expected: true,
    },
    {
      name: 'excludes a regression when a negated variant matches',
      filter: {
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
      expected: false,
    },
    {
      name: 'keeps a regression when a negated variant does not match',
      filter: {
        operatorValue: 'has entry',
        value: 'Platform:aws',
        not: true,
      },
      expected: true,
    },
  ])('$name', ({ filter, expected }) => {
    expect(matchesVariantFilters(regression, [filter])).toBe(expected)
  })

  test('requires every filter to match', () => {
    expect(
      matchesVariantFilters(regression, [
        { operatorValue: 'has entry', value: 'Platform:gcp' },
        { operatorValue: 'has entry', value: 'Architecture:amd64' },
      ])
    ).toBe(true)

    expect(
      matchesVariantFilters(regression, [
        { operatorValue: 'has entry', value: 'Platform:gcp' },
        { operatorValue: 'has entry', value: 'Architecture:arm64' },
      ])
    ).toBe(false)
  })
})
