const { test, expect } = require('@playwright/test')

test.describe('Trailing slash redirect (TRT-2753)', () => {
  test('navigating to /sippy-ng without trailing slash loads the app', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
    await expect(page.locator('#root')).toBeAttached()
  })

  test('navigating to /sippy-ng/ with trailing slash loads the app', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng/')
    expect(response.status()).toBe(200)
    await expect(page.locator('#root')).toBeAttached()
  })

  test('navigating to / redirects to /sippy-ng/', async ({ page }) => {
    const response = await page.goto('/')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
  })

  test('deep link under /sippy-ng/ loads the app', async ({ page }) => {
    const response = await page.goto('/sippy-ng/component_readiness/main')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
    await expect(page.locator('#root')).toBeAttached()
  })
})
