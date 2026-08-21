const { test, expect } = require('@playwright/test')

test.describe('Sippy UI trailing slash handling', () => {
  test('renders when navigating to /sippy-ng without trailing slash', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng')
    expect(response.status()).toBe(200)
    expect(page.url()).toContain('/sippy-ng/')
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('renders when navigating to /sippy-ng/ with trailing slash', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng/')
    expect(response.status()).toBe(200)
    await expect(page.locator('#root')).not.toBeEmpty()
  })
})
