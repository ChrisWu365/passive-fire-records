import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * A project's areas, end to end: the admin adds one on the register screen, the installer downloads it,
 * picks it on a record with no network, and the record reaches the server with that area. The built web
 * app with its service worker, the real inspection service and the real register service; nothing stubbed.
 */
const SEEDED_PROJECT = 'Demo Apartments (fictional)';
const SEEDED_PROJECT_OPTION = `DEMO — ${SEEDED_PROJECT}`;
const SEEDED_SYSTEM_OPTION = 'SYS-01 — Plasterboard wall, Plastic pipe up to 50 mm';
const SAVED_ON_DEVICE = 'Saved on this device. It will be sent when you are back online.';
const SYNC_TIMEOUT = 20_000;

interface ServerRecord {
  location: string;
  areaId: string | null;
  areaName: string | null;
}

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

async function addAreaAsAdmin(page: Page, areaName: string): Promise<void> {
  await signIn(page, 'admin@example.com', 'Admin123!');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByRole('button', { name: /DEMO.*Demo Apartments/ }).click();
  await expect(page.getByRole('heading', { name: `Areas of ${SEEDED_PROJECT}` })).toBeVisible();
  await page.getByRole('button', { name: 'New area' }).click();
  await page.getByLabel('Area name').fill(areaName);
  await page.getByRole('button', { name: 'Add area' }).click();
  await expect(page.getByRole('list', { name: 'Areas' }).getByText(areaName)).toBeVisible();
  await signOut(page);
}

/** Signs in, downloads the register, waits for the app shell to be cached, then cuts the network. */
async function prepareAndGoOffline(context: BrowserContext, page: Page): Promise<void> {
  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await page.getByRole('button', { name: 'Download for offline' }).click();
  await expect(page.getByText('The register is saved on this device.')).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
}

async function serverRecordsAt(request: APIRequestContext, location: string): Promise<ServerRecord[]> {
  const login = await request.post('/api/auth/login', { data: { email: 'viewer@example.com', password: 'Viewer123!' } });
  expect(login.ok()).toBe(true);
  const response = await request.get('/api/inspections', {
    headers: { authorization: `Bearer ${(await login.json()).token}` }
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as ServerRecord[]).filter((record) => record.location === location);
}

test('AC-9.7 an area the admin adds is downloaded, picked with no network, and reaches the server with the record', async ({ context, page, request }) => {
  const suffix = uniqueSuffix();
  const areaName = `Level ${suffix}`;
  const location = `Riser north ${suffix}`;
  await addAreaAsAdmin(page, areaName);
  await prepareAndGoOffline(context, page);

  await page.getByRole('button', { name: '+ New inspection' }).click();
  await page.getByLabel('Project').selectOption({ label: SEEDED_PROJECT_OPTION });
  await page.getByLabel('Firestop system').selectOption({ label: SEEDED_SYSTEM_OPTION });
  await page.getByLabel('Level / area').selectOption({ label: areaName });
  await page.getByLabel('Location').fill(location);
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText(SAVED_ON_DEVICE)).toBeVisible();
  const onDevice = page.getByRole('listitem', { name: new RegExp(location) });
  await expect(onDevice).toContainText('Pending sync');
  await expect(onDevice).toContainText(`${areaName} · ${location}`);
  expect(await serverRecordsAt(request, location)).toEqual([]);

  await context.setOffline(false);

  await expect(onDevice).toContainText('Synced', { timeout: SYNC_TIMEOUT });
  const [record, ...others] = await serverRecordsAt(request, location);
  expect(others).toEqual([]);
  expect(record.areaName).toBe(areaName);
  expect(record.areaId).toBeTruthy();
  // The record is in the server list without a reload, showing the area before the detail, and opens
  // with the area selected.
  const row = page.getByRole('row', { name: new RegExp(location) });
  await expect(row).toContainText(`${areaName} · ${location}`);
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByLabel('Level / area').locator('option:checked')).toHaveText(areaName);
});
