const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: process.env.SIPPY_BASE_URL || 'http://localhost:18888',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
