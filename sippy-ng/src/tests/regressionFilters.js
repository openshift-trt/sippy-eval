export function matchesVariantFilters(regression, filters) {
  const variants = (regression.variants || []).map((variant) =>
    variant.toLowerCase()
  )

  return filters.every((filter) => {
    const filterValue = filter.value.toLowerCase()
    const hasMatch = variants.some((variant) =>
      filter.operatorValue === 'has entry containing'
        ? variant.includes(filterValue)
        : variant === filterValue
    )

    return filter.not ? !hasMatch : hasMatch
  })
}
