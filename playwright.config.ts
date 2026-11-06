import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const production = process.env.APP_TEST_MODE === 'production';
const port = Number(process.env.APP_TEST_PORT || (production ? 4197 : 5197));
const base = process.env.SITE_BASE || '/';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;

// Keep browser tests independent of the user's ignored snippets/ directory.
if (!process.env.APP_TEST_CONTENT_DIR) {
  const contentRoot = path.resolve('.generated', `e2e-snippets-${process.pid}`);
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.cpSync(path.resolve('tests/fixtures/library'), contentRoot, { recursive: true });
  process.env.APP_TEST_CONTENT_DIR = contentRoot;
  process.env.SNIPPETS_DIR = contentRoot;
}

export default defineConfig({
  globalTeardown: './tests/e2e/cleanup.ts',
  testDir: 'tests/e2e', workers: 1, timeout: 30_000, expect: { timeout: 8000 },
  reporter: [['list']],
  use: {
    browserName: 'chromium', baseURL: `http://127.0.0.1:${port}${base}`,
    launchOptions: fs.existsSync(chrome) ? { executablePath: chrome } : {},
    viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: production ? `npm run build && npm run preview -- --port ${port} --strictPort` : `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}${base}`, reuseExistingServer: false,
  },
});
