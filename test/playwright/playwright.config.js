const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  use: {
    baseURL: process.env.SIPPY_BASE_URL || 'http://localhost:8080',
  },
})
