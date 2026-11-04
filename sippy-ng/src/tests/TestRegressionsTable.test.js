import { filterRegressionsByVariants } from './TestRegressionsTable'

const regressions = [
  { id: 1, variants: ['Platform:gcp', 'Architecture:amd64'] },
  { id: 2, variants: ['Platform:aws', 'Architecture:amd64'] },
  { id: 3, variants: ['Platform:gcp', 'Aggregation:aggregated'] },
  { id: 4, variants: [], closed: { Valid: true } },
  { id: 5, variants: [] },
  { id: 6, variants: ['Platform:gcp', 'Stability:never-stable'] },
]

describe('filterRegressionsByVariants', () => {
  test('matches a fully qualified variant entry', () => {
    const filtered = filterRegressionsByVariants(regressions, [
      { operatorValue: 'has entry', value: 'Platform:gcp' },
    ])

    expect(filtered.map((regression) => regression.id)).toEqual([1, 3, 6])
  })

  test('matches a variant value without its key', () => {
    const filtered = filterRegressionsByVariants(regressions, [
      { operatorValue: 'has entry', value: 'gcp' },
    ])

    expect(filtered.map((regression) => regression.id)).toEqual([1, 3, 6])
  })

  test('supports negated and containing variant filters', () => {
    const filtered = filterRegressionsByVariants(regressions, [
      { operatorValue: 'has entry containing', value: 'Platform:gc' },
      { operatorValue: 'has entry', value: 'aggregated', not: true },
      { operatorValue: 'has entry', value: 'never-stable', not: true },
    ])

    expect(filtered.map((regression) => regression.id)).toEqual([1])
  })

  test('keeps matching regressions when default exclusions are applied', () => {
    const filtered = filterRegressionsByVariants(regressions, [
      { operatorValue: 'has entry', value: 'never-stable', not: true },
      { operatorValue: 'has entry', value: 'aggregated', not: true },
      { operatorValue: 'has entry', value: 'Platform:gcp' },
    ])

    expect(filtered.map((regression) => regression.id)).toEqual([1])
  })

  test('ignores unfinished filters and excludes closed regressions', () => {
    const filtered = filterRegressionsByVariants(regressions, [
      { operatorValue: 'has entry', value: '' },
    ])

    expect(filtered.map((regression) => regression.id)).toEqual([1, 2, 3])
  })

  test('matches empty variant entries', () => {
    const filtered = filterRegressionsByVariants(regressions, [
      { operatorValue: 'is empty', value: '' },
    ])

    expect(filtered.map((regression) => regression.id)).toEqual([5])
  })
})
