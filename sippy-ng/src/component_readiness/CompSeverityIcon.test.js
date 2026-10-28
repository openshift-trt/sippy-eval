import { render } from '@testing-library/react'
import CompSeverityIcon from './CompSeverityIcon'
import React from 'react'

// TRT-2660: the API serialized a nil Explanations slice as null, which crashed the
// regressed tests modal here. Rendering must survive null, undefined and empty lists.
describe('CompSeverityIcon explanations handling', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', []],
  ])('renders with %s explanations', (name, explanations) => {
    expect(() =>
      render(<CompSeverityIcon status={-400} explanations={explanations} />)
    ).not.toThrow()
  })

  it('renders with explanations present', () => {
    expect(() =>
      render(
        <CompSeverityIcon
          status={-400}
          explanations={['Significant regression detected.']}
        />
      )
    ).not.toThrow()
  })
})
