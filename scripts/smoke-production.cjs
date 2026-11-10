const { chromium, expect } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');
const { dirname } = require('node:path');

async function main() {
  const url = new URL(process.env.SMOKE_URL ?? 'http://localhost:8080');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('SMOKE_URL must be a public HTTP(S) address without credentials');
  }
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(new URL('/login', url).href);
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    await expect(page.getByLabel('Work email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    if (errors.length) throw new Error('Production JavaScript errors: ' + errors.join('; '));
    if (process.env.SMOKE_SCREENSHOT) {
      await mkdir(dirname(process.env.SMOKE_SCREENSHOT), { recursive: true });
      await page.screenshot({ path: process.env.SMOKE_SCREENSHOT, fullPage: true });
    }
    console.log(JSON.stringify({ url: url.origin, status: 'ok', javascriptErrors: 0 }));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
