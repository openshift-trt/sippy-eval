import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

const openRegression = (id, variants) => ({
  id,
  variants,
  opened: '2026-06-01T00:00:00Z',
  closed: null,
  last_failure: { Valid: true, Time: '2026-07-01T00:00:00Z' },
})

function renderTable(filterModel, regressions) {
  global.fetch.mockResolvedValueOnce({
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

describe('TestRegressionsTable variant filtering', () => {
  test('shows regressions matching a key:value variant filter', async () => {
    const regressions = [
      openRegression(1, ['Platform:gcp', 'Architecture:amd64']),
      openRegression(2, ['Platform:aws', 'Architecture:amd64']),
    ]
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Platform:gcp',
          not: false,
        },
      ],
    }

    renderTable(filterModel, regressions)

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('excludes regressions with negated variant filter', async () => {
    const regressions = [
      openRegression(1, ['Platform:gcp', 'never-stable']),
      openRegression(2, ['Platform:gcp', 'Architecture:amd64']),
    ]
    const filterModel = {
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'never-stable',
          not: true,
        },
      ],
    }

    renderTable(filterModel, regressions)

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  test('shows all open regressions when no variant filters applied', async () => {
    const regressions = [
      openRegression(1, ['Platform:gcp']),
      openRegression(2, ['Platform:aws']),
    ]
    const filterModel = {
      items: [
        { columnField: 'name', operatorValue: 'equals', value: 'some-test' },
      ],
    }

    renderTable(filterModel, regressions)

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  test('combines positive and negative variant filters', async () => {
    const regressions = [
      openRegression(1, ['Platform:gcp', 'Architecture:amd64']),
      openRegression(2, ['Platform:gcp', 'never-stable']),
      openRegression(3, ['Platform:aws', 'Architecture:amd64']),
    ]
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
    }

    renderTable(filterModel, regressions)

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
