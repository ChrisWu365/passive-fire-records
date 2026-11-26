import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * Capturing records with no network and sending them when it returns, end to end: the built web app with
 * its service worker, the real inspection service and the real register service. Nothing is stubbed; where
 * a test needs the network to fail at a precise moment, it aborts that one request in the browser.
 */
const SEEDED_PROJECT_OPTION = 'DEMO — Demo Apartments (fictional)';
const SEEDED_PROJECT_ID = '0a000000-0000-4000-8000-000000000001';
const SEEDED_SYSTEM_OPTION = 'SYS-01 — Plasterboard wall, Plastic pipe up to 50 mm';
const SAVED_ON_DEVICE = 'Saved on this device. It will be sent when you are back online.';
const SIGN_IN_AGAIN_NOTICE = 'Your sign-in has expired. Sign in again to send the records on this device.';
const SYNC_TIMEOUT = 20_000;

// A one-pixel PNG, so photo steps need no file on disk.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

interface ServerRecord {
  id: string;
  location: string;
  photos: string[];
  aiStatus: string;
  aiSummary: string | null;
  capturedAt: string;
  createdAt: string;
}

function uniqueSuffix(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function pngNamed(name: string) {
  return { name, mimeType: 'image/png', buffer: ONE_PIXEL_PNG };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Recent inspections')).toBeVisible();
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

/** Fills and saves a new record while offline. The form closes and the record is listed on the device. */
async function captureOffline(page: Page, location: string, systemOption: string, photoNames: string[]): Promise<void> {
  await page.getByRole('button', { name: '+ New inspection' }).click();
  await page.getByLabel('Project').selectOption({ label: SEEDED_PROJECT_OPTION });
  await page.getByLabel('Firestop system').selectOption({ label: systemOption });
  await page.getByLabel('Location').fill(location);
  await page.getByLabel('Inspection notes').fill('Captured with no network.');
  if (photoNames.length > 0) await page.getByLabel('Site photos').setInputFiles(photoNames.map(pngNamed));
  await page.getByLabel('AI instruction').fill('Describe the seal.');
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText(SAVED_ON_DEVICE)).toBeVisible();
  await expect(deviceRecord(page, location)).toContainText('Pending sync');
}

function deviceRecord(page: Page, location: string) {
  return page.getByRole('listitem', { name: new RegExp(location) });
}

/** A token for direct API calls. The test's own request context is not affected by the page being offline. */
async function apiToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post('/api/auth/login', { data: { email, password } });
  expect(response.ok()).toBe(true);
  return (await response.json()).token;
}

async function serverRecordsAt(request: APIRequestContext, location: string): Promise<ServerRecord[]> {
  const token = await apiToken(request, 'viewer@example.com', 'Viewer123!');
  const response = await request.get('/api/inspections', { headers: { authorization: `Bearer ${token}` } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as ServerRecord[]).filter((record) => record.location === location);
}

test('AC-6.1 AC-6.6 a record with a photo captured offline reaches the server by itself when the network returns', async ({ context, page, request }) => {
  const location = `Offline riser ${uniqueSuffix()}`;
  await prepareAndGoOffline(context, page);
  await captureOffline(page, location, SEEDED_SYSTEM_OPTION, ['seal.png']);
  expect(await serverRecordsAt(request, location)).toEqual([]);
  // Stay offline long enough for the capture time and the server's creation time to differ visibly.
  await page.waitForTimeout(2_000);
  const reconnectedAt = Date.now();

  await context.setOffline(false);

  await expect(deviceRecord(page, location)).toContainText('Synced', { timeout: SYNC_TIMEOUT });
  const [record, ...others] = await serverRecordsAt(request, location);
  expect(others).toEqual([]);
  expect(record.photos).toHaveLength(1);
  expect(record.aiStatus).toBe('DONE');
  expect(record.aiSummary).toBeTruthy();
  // AC-6.6: the capture time is when it was saved on the device, before the network came back.
  expect(Date.parse(record.capturedAt)).toBeLessThan(reconnectedAt);
  expect(Date.parse(record.createdAt)).toBeGreaterThanOrEqual(reconnectedAt - 1_000);

  // The record is in the server list without a reload, and opens with its photo and labelled AI draft.
  const row = page.getByRole('row', { name: new RegExp(location) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByAltText('Inspection evidence')).toBeVisible();
  await expect(page.getByText(/AI-assisted draft.*unverified/)).toBeVisible();
});

test('AC-6.2 cutting the network mid-sync and restoring it leaves exactly one record with each photo once', async ({ context, page, request }) => {
  const location = `Interrupted riser ${uniqueSuffix()}`;
  await prepareAndGoOffline(context, page);
  await captureOffline(page, location, SEEDED_SYSTEM_OPTION, ['first.png', 'second.png', 'third.png']);
  // The connection drops for the second photo upload: the first photo is already on the server.
  let photoUploads = 0;
  await page.route('**/api/inspections/*/photos', async (route) => {
    photoUploads += 1;
    if (photoUploads === 2) await route.abort('internetdisconnected');
    else await route.continue();
  });

  await context.setOffline(false);
  await expect.poll(() => photoUploads, { timeout: SYNC_TIMEOUT }).toBeGreaterThanOrEqual(2);
  await expect(deviceRecord(page, location)).toContainText('Pending sync');
  await expect.poll(async () => (await serverRecordsAt(request, location))[0]?.photos.length).toBe(1);

  await page.getByRole('button', { name: 'Sync now' }).click();

  await expect(deviceRecord(page, location)).toContainText('Synced', { timeout: SYNC_TIMEOUT });
  const records = await serverRecordsAt(request, location);
  expect(records).toHaveLength(1);
  expect(records[0].photos).toHaveLength(3);
  expect(new Set(records[0].photos).size).toBe(3);
});

test('AC-6.3 a record whose system was deactivated meanwhile ends in "Sync failed" with the reason and stays on the device', async ({ context, page, request }) => {
  const suffix = uniqueSuffix();
  const systemCode = `CAP-${suffix}`;
  const location = `Rejected riser ${suffix}`;
  const adminToken = await apiToken(request, 'admin@example.com', 'Admin123!');
  const adminHeaders = { authorization: `Bearer ${adminToken}` };
  const systemBody = {
    code: systemCode,
    substrate: 'Concrete floor',
    serviceType: 'Metal pipe up to 100 mm',
    fireRating: '-/120/120',
    materials: 'Demo wrap E',
    installationMethod: 'Wrap the pipe twice.'
  };
  const systemsUrl = `/api/register/projects/${SEEDED_PROJECT_ID}/systems`;
  const created = await request.post(systemsUrl, { headers: adminHeaders, data: systemBody });
  expect(created.status()).toBe(201);
  const systemId: string = (await created.json()).id;

  await prepareAndGoOffline(context, page);
  await captureOffline(page, location, `${systemCode} — Concrete floor, Metal pipe up to 100 mm`, ['seal.png']);
  // While the installer is offline, the admin deactivates the system.
  const deactivated = await request.put(`${systemsUrl}/${systemId}`, {
    headers: adminHeaders, data: { ...systemBody, active: false }
  });
  expect(deactivated.status()).toBe(200);

  await context.setOffline(false);

  const record = deviceRecord(page, location);
  await expect(record).toContainText('Sync failed', { timeout: SYNC_TIMEOUT });
  await expect(record).toContainText('Firestop system is inactive');
  expect(await serverRecordsAt(request, location)).toEqual([]);

  // It is still on the device after a reload, and the user can discard it.
  await page.reload();
  await expect(deviceRecord(page, location)).toContainText('Sync failed');
  await page.getByRole('button', { name: `Discard ${location}` }).click();
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(deviceRecord(page, location)).toHaveCount(0);
  expect(await serverRecordsAt(request, location)).toEqual([]);
});

test('AC-6.5 an expired sign-in at sync time prompts for sign-in, keeps the record, and sends it afterwards', async ({ context, page, request }) => {
  const location = `Expired sign-in riser ${uniqueSuffix()}`;
  await prepareAndGoOffline(context, page);
  await captureOffline(page, location, SEEDED_SYSTEM_OPTION, ['seal.png']);
  // The sign-in stops being valid while the device is offline.
  await page.evaluate(() => localStorage.setItem('inspection-token', 'expired.or.invalid'));

  await context.setOffline(false);

  await expect(page.getByText(SIGN_IN_AGAIN_NOTICE)).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(deviceRecord(page, location)).toContainText('Pending sync');
  expect(await serverRecordsAt(request, location)).toEqual([]);

  await page.getByRole('button', { name: 'Sign in again' }).click();
  await page.getByLabel('Password').fill('Inspector123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(deviceRecord(page, location)).toContainText('Synced', { timeout: SYNC_TIMEOUT });
  const records = await serverRecordsAt(request, location);
  expect(records).toHaveLength(1);
  expect(records[0].photos).toHaveLength(1);
});

test('AC-6.1 a record captured offline survives closing and reopening the app before the network returns', async ({ context, page, request }) => {
  const location = `Reopened riser ${uniqueSuffix()}`;
  await prepareAndGoOffline(context, page);
  await captureOffline(page, location, SEEDED_SYSTEM_OPTION, ['seal.png']);

  await page.reload();
  await expect(deviceRecord(page, location)).toContainText('Pending sync');
  await expect(deviceRecord(page, location)).toContainText('1 photo');

  await context.setOffline(false);
  await expect(deviceRecord(page, location)).toContainText('Synced', { timeout: SYNC_TIMEOUT });
  expect((await serverRecordsAt(request, location))[0].photos).toHaveLength(1);
});
