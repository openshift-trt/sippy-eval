import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const makeRegression = (id, variants, closed) => ({
  id,
  variants,
  opened: '2026-06-01T00:00:00Z',
  closed: closed || { Valid: false },
  last_failure: { Valid: false },
})

const regressions = [
  makeRegression(1, ['Platform:gcp', 'Architecture:amd64']),
  makeRegression(2, ['Platform:aws', 'Architecture:amd64']),
  makeRegression(3, ['Platform:azure', 'Architecture:arm64']),
  makeRegression(4, ['Platform:gcp', 'Architecture:arm64']),
]

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(regressions),
    })
  )
})

afterEach(() => {
  jest.restoreAllMocks()
})

const renderTable = (filterModel) =>
  render(
    <MemoryRouter>
      <TestRegressionsTable
        release="5.0"
        testName="[sig-apps] job-upgrade"
        filterModel={filterModel}
      />
    </MemoryRouter>
  )

describe('TestRegressionsTable variant filtering', () => {
  test('shows all open regressions when no variant filters are applied', async () => {
    renderTable({ items: [] })
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(5) // 1 header + 4 data
    })
  })

  test('filters regressions by positive variant filter (has entry)', async () => {
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
      // Only regressions 1 and 4 have Platform:gcp
      expect(screen.getAllByRole('row')).toHaveLength(3) // 1 header + 2 data
    })
  })

  test('filters regressions by negated variant filter (not has entry)', async () => {
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
      // Regressions 2 and 3 do NOT have Platform:gcp
      expect(screen.getAllByRole('row')).toHaveLength(3) // 1 header + 2 data
    })
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
          value: 'Architecture:arm64',
          not: false,
        },
      ],
    })
    await waitFor(() => {
      // Only regression 4 has both Platform:gcp AND Architecture:arm64
      expect(screen.getAllByRole('row')).toHaveLength(2) // 1 header + 1 data
    })
  })

  test('ignores non-variant filters', async () => {
    renderTable({
      items: [
        {
          columnField: 'name',
          operatorValue: 'equals',
          value: 'some-test',
          not: false,
        },
      ],
    })
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(5) // 1 header + 4 data
    })
  })

  test('case-insensitive variant matching', async () => {
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
      expect(screen.getAllByRole('row')).toHaveLength(3) // 1 header + 2 data
    })
  })
})
