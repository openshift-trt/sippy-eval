import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const makeRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-07-01T00:00:00Z',
  closed: { Valid: false },
  last_failure: { Valid: true, Time: '2026-07-10T00:00:00Z' },
})

const renderTable = (regressions, filterModel) => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    status: 200,
    json: () => Promise.resolve(regressions),
  })

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
  const gcpRegression = makeRegression(1, [
    'Platform:gcp',
    'Network:ovn',
    'Topology:ha',
  ])
  const awsRegression = makeRegression(2, [
    'Platform:aws',
    'Network:ovn',
    'Topology:ha',
  ])
  const aggregatedRegression = makeRegression(3, [
    'Platform:gcp',
    'Topology:aggregated',
  ])

  test('shows all regressions when no variant filters are applied', async () => {
    renderTable([gcpRegression, awsRegression], { items: [] })
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  test('filters by full Key:Value variant string', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
        },
      ],
    }
    renderTable([gcpRegression, awsRegression], filterModel)
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('excludes regressions with negated Key:Value filter', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: true,
        },
      ],
    }
    renderTable([gcpRegression, awsRegression], filterModel)
    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  test('filters by bare value (default exclusion filters)', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'aggregated',
          not: true,
        },
      ],
    }
    renderTable(
      [gcpRegression, awsRegression, aggregatedRegression],
      filterModel
    )
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('combines multiple variant filters with AND logic', async () => {
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
        },
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'aggregated',
          not: true,
        },
      ],
    }
    renderTable(
      [gcpRegression, awsRegression, aggregatedRegression],
      filterModel
    )
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
