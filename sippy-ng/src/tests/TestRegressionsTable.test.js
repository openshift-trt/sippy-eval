import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const sampleRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:ovn', 'Architecture:amd64'],
    opened: '2026-07-01T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-07-10T00:00:00Z' },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:sdn', 'Architecture:amd64'],
    opened: '2026-07-02T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-07-11T00:00:00Z' },
  },
  {
    id: 3,
    variants: ['aggregated'],
    opened: '2026-07-03T00:00:00Z',
    last_failure: { Valid: true, Time: '2026-07-12T00:00:00Z' },
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
      json: () => Promise.resolve(sampleRegressions),
    })
  )
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('TestRegressionsTable variant filtering', () => {
  test('shows all regressions when no variant filters are applied', async () => {
    renderTable({ items: [], linkOperator: 'and' })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  test('filters regressions by full Key:Value variant filter', async () => {
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
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('excludes regressions with negated bare-value variant filter', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'aggregated',
          not: true,
        },
      ],
      linkOperator: 'and',
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('combines Key:Value filter with negated bare-value exclusion', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'aggregated',
          not: true,
        },
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
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('non-variant filters are ignored by the regression table', async () => {
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
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })
})
