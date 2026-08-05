import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const makeRegression = (id, variants, closed = null) => ({
  id,
  variants,
  opened: '2026-07-01T00:00:00Z',
  last_failure: { Valid: true, Time: '2026-07-10T00:00:00Z' },
  closed: closed,
  triages: [],
  job_runs: [],
})

const regressions = [
  makeRegression(1, ['Platform:gcp', 'Network:ovn', 'Architecture:amd64']),
  makeRegression(2, ['Platform:aws', 'Network:sdn', 'Architecture:amd64']),
  makeRegression(3, ['Platform:gcp', 'Network:sdn', 'Architecture:arm64']),
  makeRegression(4, ['Platform:azure', 'Network:ovn', 'Architecture:amd64'], {
    Valid: true,
  }),
]

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

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(regressions),
    })
  )
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('renders open regressions without filters', async () => {
  renderTable(null)

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  // Regressions 1, 2, 3 are open; regression 4 is closed
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.queryByText('4')).not.toBeInTheDocument()
})

test('positive variant filter shows only matching regressions', async () => {
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
      },
    ],
    linkOperator: 'and',
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})

test('negative variant filter excludes matching regressions', async () => {
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'Platform:gcp',
        not: true,
      },
    ],
    linkOperator: 'and',
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  expect(screen.queryByText('1')).not.toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.queryByText('3')).not.toBeInTheDocument()
})

test('multiple filters are combined with AND logic', async () => {
  renderTable({
    items: [
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
    ],
    linkOperator: 'and',
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  // Only regression 1 has both Platform:gcp AND Network:ovn
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
  expect(screen.queryByText('3')).not.toBeInTheDocument()
})

test('variant filter matching is case-insensitive', async () => {
  renderTable({
    items: [
      {
        columnField: 'variants',
        operatorValue: 'has entry',
        value: 'platform:GCP',
      },
    ],
    linkOperator: 'and',
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})

test('non-variant filters are ignored by variant filtering', async () => {
  renderTable({
    items: [
      {
        columnField: 'name',
        operatorValue: 'equals',
        value: '[sig-apps] job-upgrade',
      },
    ],
    linkOperator: 'and',
  })

  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  // All open regressions should show since no variant filter is applied
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})
