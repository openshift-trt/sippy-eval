import { filterFor, not } from '../helpers'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const regressions = [
  { id: 1, variants: ['Architecture:amd64', 'Platform:gcp'] },
  { id: 2, variants: ['Architecture:amd64', 'Platform:aws'] },
  { id: 3, variants: ['Architecture:arm64', 'Platform:gcp'] },
  { id: 4, variants: ['Cloud:gcp'] },
  { id: 5, variants: ['Platform:gcp'], closed: { Valid: true } },
  { id: 6, variants: null },
  { id: 7, variants: ['Platform:gcp', 'aggregated'] },
  { id: 8, variants: ['Platform:gcp', 'never-stable'] },
  { id: 9, closed: { Valid: false } },
]

const defaultFilters = [
  not(filterFor('variants', 'has entry', 'aggregated')),
  not(filterFor('variants', 'has entry', 'never-stable')),
]

const renderTable = (filterModel) => (
  <MemoryRouter>
    <TestRegressionsTable
      release="5.0"
      testName="[sig-apps] job-upgrade"
      filterModel={filterModel}
    />
  </MemoryRouter>
)

beforeEach(() => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    status: 200,
    json: async () => regressions,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

test.each([
  {
    name: 'no filter model shows all active regressions',
    expectedIDs: [1, 2, 3, 4, 6, 7, 8, 9],
  },
  {
    name: 'empty filters show all active regressions',
    filterModel: { items: [] },
    expectedIDs: [1, 2, 3, 4, 6, 7, 8, 9],
  },
  {
    name: 'default exclusions remove aggregated and never-stable regressions',
    filterModel: { items: defaultFilters },
    expectedIDs: [1, 2, 3, 4, 6, 9],
  },
  {
    name: 'Platform:gcp matches the complete entry alongside default filters',
    filterModel: {
      items: [
        ...defaultFilters,
        filterFor('name', 'equals', '[sig-apps] job-upgrade'),
        filterFor('variants', 'has entry', 'Platform:gcp'),
      ],
    },
    expectedIDs: [1, 3],
  },
  {
    name: 'variant entries match case-insensitively',
    filterModel: {
      items: [filterFor('variants', 'has entry', 'pLaTfOrM:GCP')],
    },
    expectedIDs: [1, 3, 7, 8],
  },
  {
    name: 'multiple inclusions must all match',
    filterModel: {
      items: [
        filterFor('variants', 'has entry', 'Platform:gcp'),
        filterFor('variants', 'has entry', 'Architecture:arm64'),
      ],
    },
    expectedIDs: [3],
  },
  {
    name: 'negated filters exclude matching entries',
    filterModel: {
      items: [not(filterFor('variants', 'has entry', 'Platform:gcp'))],
    },
    expectedIDs: [2, 4, 6, 9],
  },
  {
    name: 'inclusions and exclusions work together',
    filterModel: {
      items: [
        ...defaultFilters,
        filterFor('variants', 'has entry', 'Platform:gcp'),
        not(filterFor('variants', 'has entry', 'Architecture:arm64')),
      ],
    },
    expectedIDs: [1],
  },
  {
    name: 'matching values in different dimensions remain distinct',
    filterModel: {
      items: [filterFor('variants', 'has entry', 'Cloud:gcp')],
    },
    expectedIDs: [4],
  },
  {
    name: 'unmatched filters show the empty state',
    filterModel: {
      items: [filterFor('variants', 'has entry', 'Platform:azure')],
    },
    expectedIDs: [],
  },
])('$name', async ({ filterModel, expectedIDs }) => {
  render(renderTable(filterModel))

  await waitFor(() =>
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  )

  expect(
    screen.queryAllByRole('link').map((link) => Number(link.textContent))
  ).toEqual(expectedIDs)
  if (expectedIDs.length === 0) {
    expect(screen.getByText('No active regressions found')).toBeInTheDocument()
  }
})

test('changing filters updates the displayed regressions without refetching', async () => {
  const { rerender } = render(renderTable({ items: defaultFilters }))
  await screen.findByRole('link', { name: '1' })
  expect(screen.getByRole('link', { name: '2' })).toBeInTheDocument()

  rerender(
    renderTable({
      items: [
        ...defaultFilters,
        filterFor('variants', 'has entry', 'Platform:gcp'),
      ],
    })
  )

  expect(screen.getByRole('link', { name: '1' })).toHaveAttribute(
    'href',
    '/sippy-ng/component_readiness/regressions/1'
  )
  expect(screen.getByText('amd64, gcp')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '2' })).not.toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledTimes(1)
})
