import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const fakeRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Upgrade:upgrade-micro'],
    opened: '2026-06-01T00:00:00Z',
    closed: { Valid: false },
    last_failure: { Valid: true, Time: '2026-06-15T00:00:00Z' },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Upgrade:upgrade-micro'],
    opened: '2026-06-02T00:00:00Z',
    closed: { Valid: false },
    last_failure: { Valid: true, Time: '2026-06-16T00:00:00Z' },
  },
  {
    id: 3,
    variants: ['Platform:gcp', 'Network:sdn', 'never-stable'],
    opened: '2026-06-03T00:00:00Z',
    closed: { Valid: false },
    last_failure: { Valid: true, Time: '2026-06-17T00:00:00Z' },
  },
]

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(fakeRegressions),
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
    await act(async () => {
      renderTable({ items: [], linkOperator: 'and' })
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  test('filters regressions by full Key:Value variant format', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: false,
        },
      ],
      linkOperator: 'and',
    }
    await act(async () => {
      renderTable(filterModel)
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.queryByText('2')).not.toBeInTheDocument()
    })
  })

  test('excludes regressions with negated Key:Value variant filter', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: true,
        },
      ],
      linkOperator: 'and',
    }
    await act(async () => {
      renderTable(filterModel)
    })
    await waitFor(() => {
      expect(screen.queryByText('1')).not.toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.queryByText('3')).not.toBeInTheDocument()
    })
  })

  test('filters by bare variant value without Key: prefix', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'never-stable',
          not: true,
        },
      ],
      linkOperator: 'and',
    }
    await act(async () => {
      renderTable(filterModel)
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.queryByText('3')).not.toBeInTheDocument()
    })
  })

  test('combines multiple variant filters', async () => {
    const filterModel = {
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
          value: 'never-stable',
          not: true,
        },
      ],
      linkOperator: 'and',
    }
    await act(async () => {
      renderTable(filterModel)
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.queryByText('2')).not.toBeInTheDocument()
      expect(screen.queryByText('3')).not.toBeInTheDocument()
    })
  })
})
