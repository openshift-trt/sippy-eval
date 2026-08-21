import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const makeRegression = (id, variants, closed = null) => ({
  id,
  variants,
  opened: '2026-06-01T00:00:00Z',
  last_failure: { Valid: true, Time: '2026-07-01T00:00:00Z' },
  closed: closed ? { Valid: true, Time: closed } : { Valid: false },
})

const sampleRegressions = [
  makeRegression(1, ['Platform:gcp', 'Network:ovn', 'Architecture:amd64']),
  makeRegression(2, ['Platform:aws', 'Network:sdn', 'Architecture:arm64']),
  makeRegression(3, ['Platform:azure', 'Network:ovn', 'Architecture:amd64']),
]

function renderTable(filterModel, regressions = sampleRegressions) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(regressions),
    })
  )

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

describe('TestRegressionsTable variant filtering', () => {
  test('shows all open regressions when no variant filters applied', async () => {
    renderTable({ items: [] })
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('filters regressions by full Key:Value variant filter', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
        },
      ],
    })
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('negated variant filter excludes matching regressions', async () => {
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
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('non-variant filters are ignored by regression filtering', async () => {
    renderTable({
      items: [
        { columnField: 'name', operatorValue: 'equals', value: 'some-test' },
      ],
    })
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('closed regressions are excluded', async () => {
    const regressions = [
      makeRegression(10, ['Platform:gcp']),
      makeRegression(11, ['Platform:gcp'], '2026-07-10T00:00:00Z'),
    ]
    renderTable({ items: [] }, regressions)
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.queryByText('11')).not.toBeInTheDocument()
  })

  test('combined positive and negated variant filters work together', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Network:ovn',
        },
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          not: true,
          value: 'Platform:azure',
        },
      ],
    })
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
