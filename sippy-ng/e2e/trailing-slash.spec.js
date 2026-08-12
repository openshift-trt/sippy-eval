const { test, expect } = require('@playwright/test')

test.describe('Trailing slash redirect', () => {
  test('navigating to /sippy-ng without trailing slash loads the app', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')

    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('navigating to /sippy-ng/ with trailing slash loads the app', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng/')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')

    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('navigating to / redirects to /sippy-ng/', async ({ page }) => {
    const response = await page.goto('/')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
  })

  test('/sippy-ng with query params preserves them after redirect', async ({
    page,
  }) => {
    await page.goto('/sippy-ng?release=4.19')
    expect(page.url()).toContain('/sippy-ng/')
    expect(page.url()).toContain('release=4.19')
  })
})
