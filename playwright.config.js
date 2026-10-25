import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/ui', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4187', viewport: { width: 1440, height: 1000 }, headless: true },
  webServer: { command: 'node test/ui-server.js', url: 'http://127.0.0.1:4187', reuseExistingServer: false },
});
