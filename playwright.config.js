import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:8137',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 8137',
    url: 'http://localhost:8137',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
