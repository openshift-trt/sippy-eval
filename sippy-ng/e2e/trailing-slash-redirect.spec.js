const { test, expect } = require('@playwright/test')

test.describe('sippy-ng trailing slash redirect', () => {
  test('/sippy-ng without trailing slash loads the SPA', async ({ page }) => {
    const response = await page.goto('/sippy-ng')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
    await expect(page.locator('#root')).toBeAttached()
  })

  test('/sippy-ng/ with trailing slash loads the SPA', async ({ page }) => {
    const response = await page.goto('/sippy-ng/')
    expect(response.status()).toBe(200)
    await expect(page.locator('#root')).toBeAttached()
  })

  test('/sippy-ng preserves query params through redirect', async ({
    page,
  }) => {
    await page.goto('/sippy-ng?view=main')
    expect(page.url()).toContain('/sippy-ng/')
    expect(page.url()).toContain('view=main')
  })

  test('/sippy-ng sub-routes load the SPA', async ({ page }) => {
    const response = await page.goto('/sippy-ng/component_readiness/main')
    expect(response.status()).toBe(200)
    await expect(page.locator('#root')).toBeAttached()
  })
})
