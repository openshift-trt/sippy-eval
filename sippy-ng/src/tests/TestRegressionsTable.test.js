import { filterFor, not } from '../helpers'
import { MemoryRouter } from 'react-router-dom'
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import React from 'react'
import TestRegressionsTable, {
  regressionMatchesVariantFilters,
  variantFilterItems,
} from './TestRegressionsTable'

const gcpRegression = {
  id: 1,
  variants: [
    'Architecture:amd64',
    'Network:ovn',
    'Platform:gcp',
    'Upgrade:minor',
  ],
}

const awsRegression = {
  id: 2,
  variants: ['Architecture:amd64', 'Network:ovn', 'Platform:aws'],
}

const noVariantsRegression = { id: 3, variants: [] }

describe('regressionMatchesVariantFilters', () => {
  const cases = [
    {
      name: 'has entry matches a fully qualified variant',
      regression: gcpRegression,
      filters: [filterFor('variants', 'has entry', 'Platform:gcp')],
      expected: true,
    },
    {
      name: 'has entry rejects a different platform',
      regression: awsRegression,
      filters: [filterFor('variants', 'has entry', 'Platform:gcp')],
      expected: false,
    },
    {
      name: 'has entry is case insensitive',
      regression: gcpRegression,
      filters: [filterFor('variants', 'has entry', 'platform:GCP')],
      expected: true,
    },
    {
      name: 'has entry requires the variant group, like the API does',
      regression: gcpRegression,
      filters: [filterFor('variants', 'has entry', 'gcp')],
      expected: false,
    },
    {
      name: 'negated has entry keeps a regression without the variant',
      regression: gcpRegression,
      filters: [not(filterFor('variants', 'has entry', 'Platform:aws'))],
      expected: true,
    },
    {
      name: 'negated has entry drops a regression with the variant',
      regression: gcpRegression,
      filters: [not(filterFor('variants', 'has entry', 'Platform:gcp'))],
      expected: false,
    },
    {
      name: 'multiple filters are ANDed together',
      regression: gcpRegression,
      filters: [
        not(filterFor('variants', 'has entry', 'Platform:aws')),
        filterFor('variants', 'has entry', 'Platform:gcp'),
        filterFor('variants', 'has entry', 'Network:ovn'),
      ],
      expected: true,
    },
    {
      name: 'a single unmatched filter excludes the regression',
      regression: gcpRegression,
      filters: [
        filterFor('variants', 'has entry', 'Platform:gcp'),
        filterFor('variants', 'has entry', 'Upgrade:none'),
      ],
      expected: false,
    },
    {
      name: 'an or link operator includes a partial match',
      regression: gcpRegression,
      filters: [
        filterFor('variants', 'has entry', 'Platform:gcp'),
        filterFor('variants', 'has entry', 'Upgrade:none'),
      ],
      linkOperator: 'or',
      expected: true,
    },
    {
      name: 'an or link operator excludes a regression matching nothing',
      regression: awsRegression,
      filters: [
        filterFor('variants', 'has entry', 'Platform:gcp'),
        filterFor('variants', 'has entry', 'Upgrade:none'),
      ],
      linkOperator: 'or',
      expected: false,
    },
    {
      name: 'has entry containing matches a substring',
      regression: gcpRegression,
      filters: [filterFor('variants', 'has entry containing', 'gc')],
      expected: true,
    },
    {
      name: 'negated has entry containing excludes a match',
      regression: gcpRegression,
      filters: [not(filterFor('variants', 'has entry containing', 'gc'))],
      expected: false,
    },
    {
      name: 'is empty matches a regression without variants',
      regression: noVariantsRegression,
      filters: [filterFor('variants', 'is empty', '')],
      expected: true,
    },
    {
      name: 'is empty does not match a regression with variants',
      regression: gcpRegression,
      filters: [filterFor('variants', 'is empty', '')],
      expected: false,
    },
    {
      name: 'is not empty matches a regression with variants',
      regression: gcpRegression,
      filters: [filterFor('variants', 'is not empty', '')],
      expected: true,
    },
    {
      name: 'a regression with no variants field is handled',
      regression: { id: 4 },
      filters: [filterFor('variants', 'has entry', 'Platform:gcp')],
      expected: false,
    },
    {
      name: 'no filters matches everything',
      regression: awsRegression,
      filters: [],
      expected: true,
    },
  ]

  cases.forEach((tc) => {
    test(tc.name, () => {
      expect(
        regressionMatchesVariantFilters(
          tc.regression,
          tc.filters,
          tc.linkOperator
        )
      ).toBe(tc.expected)
    })
  })
})

describe('variantFilterItems', () => {
  const platformFilter = filterFor('variants', 'has entry', 'Platform:gcp')
  const isEmptyFilter = filterFor('variants', 'is empty', '')

  const cases = [
    {
      name: 'ignores a missing filter model',
      filterModel: undefined,
      expected: [],
    },
    {
      name: 'ignores a filter model without items',
      filterModel: {},
      expected: [],
    },
    {
      name: 'keeps only variant filters',
      filterModel: {
        items: [
          filterFor('name', 'equals', '[sig-apps] job-upgrade'),
          platformFilter,
        ],
      },
      expected: [platformFilter],
    },
    {
      name: 'drops a variant filter with no value',
      filterModel: {
        items: [filterFor('variants', 'has entry', ''), platformFilter],
      },
      expected: [platformFilter],
    },
    {
      name: 'keeps valueless operators',
      filterModel: { items: [isEmptyFilter] },
      expected: [isEmptyFilter],
    },
    {
      name: 'drops operators that cannot apply to variants',
      filterModel: {
        items: [filterFor('variants', 'equals', 'Platform:gcp')],
      },
      expected: [],
    },
  ]

  cases.forEach((tc) => {
    test(tc.name, () => {
      expect(variantFilterItems(tc.filterModel)).toEqual(tc.expected)
    })
  })
})

// Shaped like the /api/component_readiness/regressions response for
// "[sig-etcd] etcd leader changes are not excessive" on the seed database.
const apiRegressions = [
  {
    id: 4,
    test_name: '[sig-etcd] etcd leader changes are not excessive',
    variants: [
      'Architecture:amd64',
      'Network:ovn',
      'Platform:aws',
      'Upgrade:none',
    ],
    opened: '2026-10-20T14:04:24.063476Z',
    closed: { Time: '0001-01-01T00:00:00Z', Valid: false },
    last_failure: { Time: '2026-10-26T04:17:57.844311Z', Valid: true },
  },
  {
    id: 5,
    test_name: '[sig-etcd] etcd leader changes are not excessive',
    variants: [
      'Architecture:arm64',
      'Network:ovn',
      'Platform:aws',
      'Upgrade:none',
    ],
    opened: '2026-10-20T14:04:24.06403Z',
    closed: { Time: '0001-01-01T00:00:00Z', Valid: false },
    last_failure: { Time: '2026-10-28T12:55:50.495049Z', Valid: true },
  },
  {
    id: 6,
    test_name: '[sig-etcd] etcd leader changes are not excessive',
    variants: [
      'Architecture:amd64',
      'Network:ovn',
      'Platform:gcp',
      'Upgrade:none',
    ],
    opened: '2026-10-20T14:04:24.064574Z',
    closed: { Time: '0001-01-01T00:00:00Z', Valid: false },
    last_failure: { Time: '2026-10-28T12:55:50.495049Z', Valid: true },
  },
  {
    id: 7,
    test_name: '[sig-etcd] etcd leader changes are not excessive',
    variants: ['Architecture:amd64', 'Network:ovn', 'Platform:gcp'],
    opened: '2026-09-20T14:04:24.064574Z',
    closed: { Time: '2026-10-01T14:04:24.064574Z', Valid: true },
    last_failure: { Time: '2026-09-28T12:55:50.495049Z', Valid: true },
  },
]

async function renderTable(filterModel) {
  const { container } = render(
    <MemoryRouter>
      <TestRegressionsTable
        release="4.22"
        testName="[sig-etcd] etcd leader changes are not excessive"
        filterModel={filterModel}
      />
    </MemoryRouter>
  )
  await waitForElementToBeRemoved(() => screen.queryByText('Loading...'))
  return container
}

function regressionIDs(container) {
  return Array.from(container.querySelectorAll('tbody tr td:first-child')).map(
    (cell) => cell.textContent
  )
}

describe('TestRegressionsTable', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve(apiRegressions),
      })
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  const defaultFilters = [
    filterFor(
      'name',
      'equals',
      '[sig-etcd] etcd leader changes are not excessive'
    ),
    not(filterFor('variants', 'has entry', 'aggregated')),
    not(filterFor('variants', 'has entry', 'never-stable')),
  ]

  it('shows every open regression when no variant filter is applied', async () => {
    const container = await renderTable({ items: defaultFilters })
    expect(regressionIDs(container)).toEqual(['4', '5', '6'])
  })

  it('shows only the matching regressions when a variant filter is applied', async () => {
    const container = await renderTable({
      items: [
        ...defaultFilters,
        filterFor('variants', 'has entry', 'Platform:gcp'),
      ],
    })
    expect(regressionIDs(container)).toEqual(['6'])
  })

  it('reports when a variant filter matches nothing', async () => {
    await renderTable({
      items: [
        ...defaultFilters,
        filterFor('variants', 'has entry', 'Platform:azure'),
      ],
    })
    expect(screen.getByText('No active regressions found')).toBeInTheDocument()
  })
})
