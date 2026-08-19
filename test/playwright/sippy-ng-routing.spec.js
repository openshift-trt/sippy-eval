const { test, expect } = require('@playwright/test')

test.describe('Sippy NG routing', () => {
  test('renders when navigating to /sippy-ng without trailing slash', async ({
    page,
  }) => {
    await page.goto('/sippy-ng')
    await expect(page).toHaveURL(/\/sippy-ng\//)
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('renders when navigating to /sippy-ng/ with trailing slash', async ({
    page,
  }) => {
    await page.goto('/sippy-ng/')
    await expect(page).toHaveURL(/\/sippy-ng\//)
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  test('preserves query params when redirecting /sippy-ng', async ({
    page,
  }) => {
    await page.goto('/sippy-ng?release=4.22')
    await expect(page).toHaveURL(/\/sippy-ng\/\?release=4\.22/)
    await expect(page.locator('#root')).not.toBeEmpty()
  })
})
