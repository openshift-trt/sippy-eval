import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const mockRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Topology:ha'],
    opened: '2026-07-01T00:00:00Z',
    closed: null,
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Topology:ha'],
    opened: '2026-07-02T00:00:00Z',
    closed: null,
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Network:sdn', 'Topology:single'],
    opened: '2026-07-03T00:00:00Z',
    closed: null,
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
  test('shows all regressions when no variant filters applied', async () => {
    renderTable({ items: [] })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  test('filters regressions by positive variant filter', async () => {
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
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('filters regressions by negative variant filter', async () => {
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
      expect(screen.getByText('2')).toBeInTheDocument()
    })
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
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
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('ignores non-variant filter items', async () => {
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
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  test('variant filter matching is case-insensitive', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'platform:GCP',
          not: false,
        },
      ],
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})
