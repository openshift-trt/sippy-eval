import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const MOCK_REGRESSIONS = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Upgrade:micro'],
    opened: '2026-06-01T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-06-15T00:00:00Z' },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Upgrade:minor'],
    opened: '2026-06-02T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-06-14T00:00:00Z' },
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Network:sdn', 'Upgrade:minor'],
    opened: '2026-06-03T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-06-13T00:00:00Z' },
    closed: { Valid: true },
  },
]

function mockFetchWith(data) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(data),
    })
  )
}

function renderTable(filterModel) {
  return render(
    <MemoryRouter>
      <TestRegressionsTable
        release="5.0"
        testName="[sig-apps] job-upgrade"
        filterModel={filterModel}
      />
    </MemoryRouter>
  )
}

afterEach(() => {
  jest.restoreAllMocks()
})

test('shows open regressions when no variant filters are applied', async () => {
  mockFetchWith(MOCK_REGRESSIONS)
  renderTable({ items: [{ columnField: 'name', value: 'test' }] })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  // id 3 is closed, should not appear
  expect(screen.queryByText('3')).not.toBeInTheDocument()
})

test('filters regressions by matching variant (positive filter)', async () => {
  mockFetchWith(MOCK_REGRESSIONS)
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: false,
        value: 'Platform:gcp',
      },
    ],
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  // Only regression 1 has Platform:gcp and is open
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

test('filters regressions by negated variant filter', async () => {
  mockFetchWith(MOCK_REGRESSIONS)
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: true,
        value: 'Platform:aws',
      },
    ],
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  // Regression 1 (gcp) should remain; regression 2 (aws) should be excluded
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

test('applies multiple variant filters with AND logic', async () => {
  mockFetchWith(MOCK_REGRESSIONS)
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: false,
        value: 'Platform:gcp',
      },
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: false,
        value: 'Network:ovn',
      },
    ],
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  // Only regression 1 has both Platform:gcp AND Network:ovn
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

test('shows empty state when no regressions match filter', async () => {
  mockFetchWith(MOCK_REGRESSIONS)
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        not: false,
        value: 'Platform:azure',
      },
    ],
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  expect(screen.getByText('No active regressions found')).toBeInTheDocument()
})
