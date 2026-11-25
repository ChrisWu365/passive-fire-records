import { randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Offline behaviour, end to end, against the built web app (not the dev server), because only the build
 * has the service worker that lets the app open with no network. The device's local copy lives in SQLite
 * in the browser's private file system. Runs in Chromium; see playwright.config.ts for why.
 */
const SEEDED_PROJECT_OPTION = 'DEMO — Demo Apartments (fictional)';
const SEEDED_SYSTEM_OPTION = 'SYS-01 — Plasterboard wall, Plastic pipe up to 50 mm';
const LIST_NEEDS_CONNECTION = 'You are offline. The inspections list will load when you are back online.';

function uniqueSuffix(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Recent inspections')).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
}

/** Downloads the register, and waits until the app shell is cached so that the app can reopen offline. */
async function downloadForOffline(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Download for offline' }).click();
  await expect(page.getByText('The register is saved on this device.')).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
}

/** Cuts the network, then reopens the app the way a user returning to it on site would. */
async function reopenOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Recent inspections')).toBeVisible();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
}

async function openNewRecord(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ New inspection' }).click();
  await expect(page.getByRole('heading', { name: 'New inspection' })).toBeVisible();
}

test('AC-5.1 after one download, with the network off, the app opens and the pickers are filled from the device', async ({ context, page }) => {
  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await downloadForOffline(page);

  await reopenOffline(context, page);
  await openNewRecord(page);
  await page.getByLabel('Project').selectOption({ label: SEEDED_PROJECT_OPTION });
  await page.getByLabel('Firestop system').selectOption({ label: SEEDED_SYSTEM_OPTION });

  await expect(page.getByRole('group', { name: 'System details' })).toContainText('Demo collar A');
  await expect(page.getByText(/showing the register as downloaded to this device/)).toBeVisible();
});

test('AC-5.2 reloading while offline, more than once, keeps the downloaded data', async ({ context, page }) => {
  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await downloadForOffline(page);
  await reopenOffline(context, page);

  await page.reload();
  await page.reload();

  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+ projects?, \d+ systems?/)).toBeVisible();
  await openNewRecord(page);
  await expect(page.getByLabel('Project').getByRole('option', { name: SEEDED_PROJECT_OPTION })).toBeAttached();
});

test('AC-5.3 downloading again replaces the local copy, including removing a deactivated system', async ({ context, page }) => {
  const systemCode = `OFF-${uniqueSuffix()}`;
  const systemOption = `${systemCode} — Concrete floor, Metal pipe up to 100 mm`;

  // The admin adds a system; the installer downloads it and sees it offline.
  await signIn(page, 'admin@example.com', 'Admin123!');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByRole('button', { name: /DEMO.*Demo Apartments/ }).click();
  await page.getByLabel('System code').fill(systemCode);
  await page.getByLabel('Substrate').fill('Concrete floor');
  await page.getByLabel('Service type').fill('Metal pipe up to 100 mm');
  await page.getByLabel('Fire rating').fill('-/120/120');
  await page.getByLabel('Materials').fill('Demo wrap E');
  await page.getByLabel('Installation method').fill('Wrap the pipe twice.');
  await page.getByRole('button', { name: 'Add system' }).click();
  await expect(page.getByRole('row', { name: new RegExp(systemCode) })).toBeVisible();
  await signOut(page);

  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await downloadForOffline(page);
  await reopenOffline(context, page);
  await openNewRecord(page);
  await page.getByLabel('Project').selectOption({ label: SEEDED_PROJECT_OPTION });
  await expect(page.getByLabel('Firestop system').getByRole('option', { name: systemOption })).toBeAttached();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // Back online, the admin deactivates it; the installer downloads again.
  await context.setOffline(false);
  await signOut(page);
  await signIn(page, 'admin@example.com', 'Admin123!');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByRole('button', { name: /DEMO.*Demo Apartments/ }).click();
  await page.getByRole('button', { name: `Deactivate ${systemCode}` }).click();
  await expect(page.getByRole('button', { name: `Reactivate ${systemCode}` })).toBeVisible();
  await signOut(page);

  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await downloadForOffline(page);
  await reopenOffline(context, page);
  await openNewRecord(page);
  await page.getByLabel('Project').selectOption({ label: SEEDED_PROJECT_OPTION });

  await expect(page.getByLabel('Firestop system').getByRole('option', { name: SEEDED_SYSTEM_OPTION })).toBeAttached();
  await expect(page.getByLabel('Firestop system').getByRole('option', { name: systemOption })).toHaveCount(0);
});

test('AC-5.4 offline, the inspections list says it needs a connection, and loads by itself when it returns', async ({ context, page }) => {
  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await downloadForOffline(page);

  await reopenOffline(context, page);
  await expect(page.getByText(LIST_NEEDS_CONNECTION)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText('Online', { exact: true })).toBeVisible();
  await expect(page.getByText(LIST_NEEDS_CONNECTION)).toHaveCount(0);
});

test('AC-5.4 offline with nothing downloaded, a new record says plainly that the register is not on the device', async ({ context, page }) => {
  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });

  await reopenOffline(context, page);
  await openNewRecord(page);

  await expect(page.getByRole('alert')).toContainText(
    'You are offline and the register has not been downloaded to this device yet.'
  );
});
