import { test, expect, Page } from '@playwright/test';
const password = process.env.DEMO_PASSWORD ?? 'SpaceOps-test-2026!';
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email + '@spaceops.demo');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Floor plan', level: 1, exact: true }),
  ).toBeVisible();
}
async function menu(page: Page) {
  const button = page.getByRole('button', { name: 'Open menu', exact: true });
  if (await button.isVisible()) await button.click();
}
async function logout(page: Page) {
  await menu(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
}
async function selectRoom(page: Page, date: string) {
  await page.getByLabel('Plan date').fill(date);
  await page.getByLabel('Time slot start').fill('10:00');
  await page.getByLabel('Time slot end').fill('11:00');
  await page.getByRole('button', { name: 'Show list' }).click();
  await page.getByRole('button', { name: /^Orbit Meeting room/ }).click();
  await expect(page.getByRole('heading', { name: 'Orbit', exact: true })).toBeVisible();
}
test('booking → ticket → block → proposal → owner confirmation', async ({ page }, testInfo) => {
  const date = new Date();
  date.setDate(date.getDate() + (testInfo.project.name === 'mobile' ? 17 : 16));
  const day = date.toISOString().slice(0, 10);
  const title = 'Relocation demo ' + testInfo.project.name;
  await login(page, 'anna');
  await selectRoom(page, day);
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Show floor plan' }).click();
    // A user must be able to select a desk on the SVG; zoom controls must not cover it.
    await page.getByRole('button', { name: /^Desk 01, / }).click();
    await expect(page.getByRole('heading', { name: 'Desk 01', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Orbit, / }).click();
    await expect(page.getByRole('heading', { name: 'Orbit', exact: true })).toBeVisible();
  }
  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Space type').selectOption('room');
  }
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({
    path: `test-results/spaceops-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Book this room' }).click();
  await page.getByLabel('Meeting title').fill(title);
  await page.getByRole('checkbox', { name: 'Projector', exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Report an issue', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Projector is not working');
  await page
    .getByLabel('Description', { exact: true })
    .fill('There is no image from the projector.');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await logout(page);
  await login(page, 'mark');
  await selectRoom(page, day);
  await page.getByRole('button', { name: 'Restrict availability', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Projector repair');
  await page.getByRole('button', { name: 'Restrict availability' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await menu(page);
  await page.getByRole('link', { name: 'Operations' }).click();
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Find an alternative' }).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Propose relocation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await logout(page);
  await login(page, 'anna');
  await menu(page);
  await page.getByRole('link', { name: 'Bookings', exact: true }).click();
  await page.getByRole('button', { name: 'Accept relocation' }).click();
  const moved = page.getByRole('row').filter({ hasText: title });
  await expect(moved).toContainText('Atlas');
  await expect(moved).toContainText('Confirmed');
  await moved.getByRole('button', { name: 'History ' + title }).click();
  await expect(page.getByText('Relocation accepted', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await moved.getByRole('button', { name: 'Cancel ' + title, exact: true }).click();
  await page.getByRole('button', { name: 'Cancel meeting', exact: true }).click();
  await expect(moved).toHaveCount(0);
});
