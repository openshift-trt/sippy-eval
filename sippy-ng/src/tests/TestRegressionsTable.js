import { Link } from 'react-router-dom'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  parseVariantName,
  relativeTime,
  safeEncodeURIComponent,
} from '../helpers'
import { shouldKeepFilterItem } from '../datagrid/filterUtils'
import Alert from '@mui/material/Alert'
import PropTypes from 'prop-types'
import React, { useEffect, useMemo } from 'react'

// Operators the variants column offers; anything else can't be evaluated against an
// array of variants, so we ignore it rather than hiding every regression.
const VARIANT_OPERATORS = [
  'has entry',
  'has entry containing',
  'is empty',
  'isEmpty',
  'is not empty',
  'isNotEmpty',
]

// variantFilterItems returns the variant filters from a filter model that can be
// evaluated against a regression.
export function variantFilterItems(filterModel) {
  if (!filterModel || !filterModel.items) return []
  return filterModel.items.filter(
    (f) =>
      f.columnField === 'variants' &&
      VARIANT_OPERATORS.includes(f.operatorValue) &&
      shouldKeepFilterItem({ ...f, value: f.value ?? '' })
  )
}

// regressionMatchesVariantFilters reports whether a regression satisfies the given
// variant filters. Regression variants are stored fully qualified as "Group:value",
// the same form the API matches filter values against for the tests table.
export function regressionMatchesVariantFilters(
  regression,
  variantFilters,
  linkOperator = 'and'
) {
  const variants = regression.variants || []

  const results = variantFilters.map((filter) => {
    const value = String(filter.value ?? '').toLowerCase()

    let matches
    switch (filter.operatorValue) {
      case 'has entry containing':
        matches = variants.some((v) => v.toLowerCase().includes(value))
        break
      case 'is empty':
      case 'isEmpty':
        matches = variants.length === 0
        break
      case 'is not empty':
      case 'isNotEmpty':
        matches = variants.length > 0
        break
      case 'has entry':
      default:
        matches = variants.some((v) => v.toLowerCase() === value)
    }

    return filter.not ? !matches : matches
  })

  return linkOperator === 'or' ? results.some(Boolean) : results.every(Boolean)
}

export default function TestRegressionsTable({
  release,
  testName,
  filterModel,
}) {
  const [isLoaded, setLoaded] = React.useState(false)
  const [regressions, setRegressions] = React.useState([])
  const [fetchError, setFetchError] = React.useState('')

  useEffect(() => {
    if (!testName || !release) return

    setLoaded(false)
    setFetchError('')

    const url = `${
      process.env.REACT_APP_API_URL
    }/api/component_readiness/regressions?release=${safeEncodeURIComponent(
      release
    )}&test=${safeEncodeURIComponent(testName)}`

    fetch(url)
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('server returned ' + res.status)
        }
        return res.json()
      })
      .then((data) => {
        setRegressions(data || [])
        setLoaded(true)
      })
      .catch((error) => {
        setFetchError('Could not retrieve regression data: ' + error)
        setLoaded(true)
      })
  }, [release, testName])

  const variantFilters = useMemo(
    () => variantFilterItems(filterModel),
    [filterModel]
  )

  const filteredRegressions = useMemo(() => {
    const open = regressions.filter((r) => !r.closed || !r.closed.Valid)

    if (variantFilters.length === 0) return open

    return open.filter((regression) =>
      regressionMatchesVariantFilters(
        regression,
        variantFilters,
        filterModel?.linkOperator
      )
    )
  }, [regressions, variantFilters, filterModel])

  if (!isLoaded) {
    return <p>Loading...</p>
  }
  if (fetchError !== '') {
    return <Alert severity="error">{fetchError}</Alert>
  }
  if (filteredRegressions.length === 0) {
    return <Typography>No active regressions found</Typography>
  }

  return (
    <TableContainer component={Paper} style={{ marginTop: 20 }}>
      <Table size="small" aria-label="regressions-table">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Variants</TableCell>
            <TableCell>Regressed Since</TableCell>
            <TableCell>Last Failure</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredRegressions.map((regression) => {
            const variantValues = (regression.variants || [])
              .map((v) => parseVariantName(v).name)
              .filter((val) => !['default', 'none', 'unknown'].includes(val))

            const tooltipLines = (regression.variants || []).sort().join('\n')

            return (
              <TableRow key={regression.id}>
                <TableCell>
                  <Link
                    to={`/sippy-ng/component_readiness/regressions/${regression.id}`}
                  >
                    {regression.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <Tooltip
                    title={
                      <span style={{ whiteSpace: 'pre-line' }}>
                        {tooltipLines}
                      </span>
                    }
                  >
                    <span>{variantValues.join(', ')}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {regression.opened
                    ? relativeTime(new Date(regression.opened), new Date())
                    : ''}
                </TableCell>
                <TableCell>
                  {regression.last_failure && regression.last_failure.Valid
                    ? relativeTime(
                        new Date(regression.last_failure.Time),
                        new Date()
                      )
                    : ''}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

TestRegressionsTable.propTypes = {
  release: PropTypes.string.isRequired,
  testName: PropTypes.string.isRequired,
  filterModel: PropTypes.object,
}
