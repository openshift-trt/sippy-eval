const { test, expect } = require('@playwright/test')

test.describe('TRT-2753: trailing slash normalization', () => {
  test('/sippy-ng without trailing slash renders the app', async ({ page }) => {
    const response = await page.goto('/sippy-ng')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
    await expect(page.locator('#root')).toBeAttached()
  })

  test('/sippy-ng/ with trailing slash renders the app', async ({ page }) => {
    const response = await page.goto('/sippy-ng/')
    expect(response.status()).toBe(200)
    await expect(page.locator('#root')).toBeAttached()
  })

  test('/sippy-ng preserves query parameters through redirect', async ({
    page,
  }) => {
    await page.goto('/sippy-ng?tab=overview')
    expect(page.url()).toContain('/sippy-ng/')
    expect(page.url()).toContain('tab=overview')
  })

  test('deep link /sippy-ng/component_readiness renders', async ({ page }) => {
    const response = await page.goto('/sippy-ng/component_readiness')
    expect(response.status()).toBe(200)
    await expect(page.locator('#root')).toBeAttached()
  })
})
