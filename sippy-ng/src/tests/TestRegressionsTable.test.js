import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const mockRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Architecture:amd64', 'Network:ovn'],
    opened: '2026-06-01T00:00:00Z',
    closed: null,
    last_failure: { Valid: true, Time: '2026-06-10T00:00:00Z' },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Architecture:amd64', 'Network:sdn'],
    opened: '2026-06-02T00:00:00Z',
    closed: null,
    last_failure: { Valid: true, Time: '2026-06-11T00:00:00Z' },
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Architecture:arm64', 'Network:ovn'],
    opened: '2026-06-03T00:00:00Z',
    closed: { Valid: true, Time: '2026-06-05T00:00:00Z' },
    last_failure: null,
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

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(mockRegressions),
    })
  )
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('TestRegressionsTable variant filtering', () => {
  test('shows open regressions when no variant filters are applied', async () => {
    renderTable({ items: [] })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // id=3 is closed, should not appear
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('filters regressions by full key:value variant string', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
        },
      ],
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('excludes regressions with negated variant filter', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: true,
        },
      ],
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  test('applies multiple variant filters with AND logic', async () => {
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
          value: 'Architecture:amd64',
        },
      ],
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Only regression 1 has both Platform:gcp AND Architecture:amd64
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('ignores non-variant filters in filterModel', async () => {
    renderTable({
      items: [
        {
          columnField: 'name',
          operatorValue: 'equals',
          value: '[sig-apps] job-upgrade',
        },
      ],
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Both open regressions should appear since no variant filter was applied
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
