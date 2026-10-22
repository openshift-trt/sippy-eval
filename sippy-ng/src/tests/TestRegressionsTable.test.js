import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const mockRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Architecture:amd64'],
    opened: '2026-06-01T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-07-01T00:00:00Z' },
    closed: { Valid: false },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Architecture:amd64'],
    opened: '2026-06-15T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-07-10T00:00:00Z' },
    closed: { Valid: false },
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Network:sdn', 'Architecture:arm64'],
    opened: '2026-05-01T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-06-20T00:00:00Z' },
    closed: { Valid: false },
  },
]

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

describe('TestRegressionsTable variant filtering', () => {
  test('shows all regressions when no variant filters are applied', async () => {
    renderTable({ items: [] })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('filters regressions by full Key:Value variant string', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: false,
        },
      ],
    })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('excludes regressions with negated variant filter', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:aws',
          not: true,
        },
      ],
    })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('applies multiple variant filters with AND logic', async () => {
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
          value: 'Network:ovn',
          not: false,
        },
      ],
    })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('ignores non-variant filters', async () => {
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
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
