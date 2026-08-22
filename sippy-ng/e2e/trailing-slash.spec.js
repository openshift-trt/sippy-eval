const { test, expect } = require('@playwright/test')

test.describe('Sippy UI trailing slash handling', () => {
  test('redirects /sippy-ng to /sippy-ng/ and renders the app', async ({
    page,
  }) => {
    const response = await page.goto('/sippy-ng', {
      waitUntil: 'domcontentloaded',
    })

    expect(response.url()).toContain('/sippy-ng/')
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('renders the app at /sippy-ng/ (with trailing slash)', async ({
    page,
  }) => {
    await page.goto('/sippy-ng/', { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('preserves query parameters through the redirect', async ({ page }) => {
    const response = await page.goto('/sippy-ng?foo=bar', {
      waitUntil: 'domcontentloaded',
    })

    expect(response.url()).toContain('/sippy-ng/')
    expect(response.url()).toContain('foo=bar')
  })
})
