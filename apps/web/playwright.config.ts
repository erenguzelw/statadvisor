import { defineConfig, devices } from '@playwright/test';

/** Uçtan uca testler: gerçek sunucu (bellek içi veritabanı, 3101) + derlenmiş arayüz (4173). */
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: [
    {
      command: 'node ../api/src/index.ts',
      url: 'http://127.0.0.1:3101/api/health',
      env: { PORT: '3101', STATADVISOR_DATA: ':memory:' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run build && vite preview --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      env: { STATADVISOR_API: 'http://127.0.0.1:3101' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
