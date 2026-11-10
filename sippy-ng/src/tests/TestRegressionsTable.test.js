import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import TestRegressionsTable from './TestRegressionsTable'

const originalFetch = global.fetch

const regressions = [
  { id: 1, variants: ['Platform:gcp', 'Architecture:amd64'] },
  { id: 2, variants: ['Platform:aws', 'Architecture:amd64'] },
  { id: 3, variants: ['Architecture:gcp'] },
]

function renderTable(filter) {
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    json: () => Promise.resolve(regressions),
  })

  return render(
    <MemoryRouter>
      <TestRegressionsTable
        release="5.0"
        testName="[sig-apps] job-upgrade"
        filterModel={{ items: [filter] }}
      />
    </MemoryRouter>
  )
}

afterEach(() => {
  global.fetch = originalFetch
})

test('matches positive variant filters against the complete variant entry', async () => {
  renderTable({
    columnField: 'variants',
    operatorValue: 'has entry',
    value: 'Platform:gcp',
    not: false,
  })

  expect(await screen.findByRole('link', { name: '1' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '2' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '3' })).not.toBeInTheDocument()
})

test('negated variant filters exclude only the complete matching entry', async () => {
  renderTable({
    columnField: 'variants',
    operatorValue: 'has entry',
    value: 'Platform:gcp',
    not: true,
  })

  expect(await screen.findByRole('link', { name: '2' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '3' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '1' })).not.toBeInTheDocument()
})
