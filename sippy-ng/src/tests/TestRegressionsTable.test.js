import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TestRegressionsTable from './TestRegressionsTable'

const mockRegressions = [
  {
    id: 1,
    variants: ['Platform:gcp', 'Network:OVNKubernetes', 'Architecture:amd64'],
    opened: '2026-06-01T00:00:00Z',
    closed: null,
    last_failure: { Valid: true, Time: '2026-07-01T00:00:00Z' },
  },
  {
    id: 2,
    variants: ['Platform:aws', 'Network:OVNKubernetes', 'Architecture:arm64'],
    opened: '2026-06-15T00:00:00Z',
    closed: null,
    last_failure: { Valid: true, Time: '2026-07-10T00:00:00Z' },
  },
  {
    id: 3,
    variants: ['Platform:azure', 'Network:OVNKubernetes', 'Architecture:amd64'],
    opened: '2026-05-01T00:00:00Z',
    closed: { Valid: true },
    last_failure: null,
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

describe('TestRegressionsTable', () => {
  test('shows open regressions when no variant filters are applied', async () => {
    renderTable({ items: [] })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  test('positive variant filter with key:value format matches regressions', async () => {
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
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  test('negative variant filter excludes matching regressions', async () => {
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
  })

  test('multiple variant filters are ANDed together', async () => {
    renderTable({
      items: [
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Network:OVNKubernetes',
        },
        {
          columnField: 'variants',
          operatorValue: 'has entry',
          value: 'Architecture:arm64',
        },
      ],
    })
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  test('non-variant filters are ignored by variant filtering', async () => {
    renderTable({
      items: [
        {
          columnField: 'name',
          operatorValue: 'equals',
          value: 'some-test',
        },
      ],
    })
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })
})
