import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const MOCK_REGRESSIONS = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Architecture:amd64', 'Network:ovn'],
    opened: '2026-06-01T00:00:00Z',
    closed: { Valid: false },
    last_failure: { Valid: false },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Architecture:amd64', 'Network:sdn'],
    opened: '2026-06-10T00:00:00Z',
    closed: { Valid: false },
    last_failure: { Valid: false },
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Architecture:arm64', 'Network:ovn'],
    opened: '2026-06-15T00:00:00Z',
    closed: { Valid: true, Time: '2026-06-20T00:00:00Z' },
    last_failure: { Valid: false },
  },
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

function mockFetch(data) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ status: 200, json: () => Promise.resolve(data) })
  )
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('TestRegressionsTable', () => {
  test('shows all open regressions when no variant filter is applied', async () => {
    mockFetch(MOCK_REGRESSIONS)
    renderTable({ items: [], linkOperator: 'and' })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('filters regressions by variant with Category:value format', async () => {
    mockFetch(MOCK_REGRESSIONS)
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: false,
        },
      ],
      linkOperator: 'and',
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('excludes regressions with negated variant filter', async () => {
    mockFetch(MOCK_REGRESSIONS)
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:aws',
          not: true,
        },
      ],
      linkOperator: 'and',
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('applies multiple variant filters with AND logic', async () => {
    mockFetch(MOCK_REGRESSIONS)
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: false,
        },
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Architecture:amd64',
          not: false,
        },
      ],
      linkOperator: 'and',
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('ignores non-variant filter items', async () => {
    mockFetch(MOCK_REGRESSIONS)
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

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
