import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const makeRegression = (id, variants, closed) => ({
  id,
  variants,
  opened: '2026-01-01T00:00:00Z',
  last_failure: { Valid: true, Time: '2026-01-02T00:00:00Z' },
  closed: closed || { Valid: false },
})

const regressions = [
  makeRegression(1, ['Platform:gcp', 'Network:ovn']),
  makeRegression(2, ['Platform:aws', 'Network:sdn']),
  makeRegression(3, ['Platform:gcp', 'Network:sdn']),
  makeRegression(4, ['Platform:azure', 'Network:ovn'], { Valid: true }),
]

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ status: 200, json: () => Promise.resolve(regressions) })
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
  test('shows all open regressions when no variant filters applied', async () => {
    renderTable({ items: [], linkOperator: 'and' })
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('4')).not.toBeInTheDocument()
  })

  test('filters regressions by full Key:Value variant filter', async () => {
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
    renderTable(filterModel)
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('filters regressions by parsed value-only variant filter', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'gcp',
          not: false,
        },
      ],
      linkOperator: 'and',
    }
    renderTable(filterModel)
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('exclusion filter with Key:Value format removes matching regressions', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Network:sdn',
          not: true,
        },
      ],
      linkOperator: 'and',
    }
    renderTable(filterModel)
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('multiple variant filters are combined with AND', async () => {
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
          value: 'Network:ovn',
          not: false,
        },
      ],
      linkOperator: 'and',
    }
    renderTable(filterModel)
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('non-variant filters are ignored by regression filtering', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'name',
          operatorValue: 'equals',
          value: '[sig-apps] job-upgrade',
        },
      ],
      linkOperator: 'and',
    }
    renderTable(filterModel)
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
