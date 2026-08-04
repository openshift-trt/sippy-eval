const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  use: {
    baseURL: process.env.SIPPY_URL || 'http://localhost:18080',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        '/usr/lib64/chromium-browser/headless_shell',
    },
  },
})
