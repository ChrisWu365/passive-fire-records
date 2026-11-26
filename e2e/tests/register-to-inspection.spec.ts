import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

/**
 * End to end through the real web app, the real inspection service and the real register service:
 * nothing between them is stubbed. The register starts with its seeded project "Demo Apartments (fictional)".
 */
const SEEDED_PROJECT = 'Demo Apartments (fictional)';

// A one-pixel PNG, so the upload step needs no file on disk.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/** Unique per test and per browser, because the register and the database outlive a single test. */
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

async function addSystemAsAdmin(page: Page, systemCode: string, materials: string): Promise<void> {
  await signIn(page, 'admin@example.com', 'Admin123!');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByRole('button', { name: new RegExp(`DEMO.*${escapeRegExp(SEEDED_PROJECT)}`) }).click();
  await expect(page.getByRole('heading', { name: `Approved systems for ${SEEDED_PROJECT}` })).toBeVisible();
  await page.getByRole('button', { name: 'New system' }).click();
  await page.getByLabel('System code').fill(systemCode);
  await page.getByLabel('Substrate').fill('Concrete floor');
  await page.getByLabel('Service type').fill('Metal pipe up to 100 mm');
  await page.getByLabel('Fire rating').fill('-/120/120');
  await page.getByLabel('Materials').fill(materials);
  await page.getByLabel('Installation method').fill('Wrap the pipe twice, then seal the surface.');
  await page.getByRole('button', { name: 'Add system' }).click();
  await expect(page.getByRole('row', { name: new RegExp(systemCode) })).toBeVisible();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('AC-4.1 a system the admin adds is offered to the installer straight away, and can be used on a record', async ({ page }) => {
  const suffix = uniqueSuffix();
  const systemCode = `E2E-${suffix}`;
  const materials = `Demo wrap ${suffix}`;
  const location = `Level 2 riser ${suffix}`;

  await addSystemAsAdmin(page, systemCode, materials);
  await signOut(page);

  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await page.getByRole('button', { name: '+ New inspection' }).click();
  await page.getByLabel('Project').selectOption({ label: `DEMO — ${SEEDED_PROJECT}` });
  await page.getByLabel('Firestop system').selectOption({ label: `${systemCode} — Concrete floor, Metal pipe up to 100 mm` });
  await expect(page.getByRole('group', { name: 'System details' })).toContainText(materials);
  await page.getByLabel('Location').fill(location);
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const row = page.getByRole('row', { name: new RegExp(location) });
  await expect(row).toContainText(SEEDED_PROJECT);
  await expect(row).toContainText('Demo Inspector');
});

test('AC-4.3 the whole online flow works through one origin: create, photo, AI draft, edit', async ({ page, baseURL }) => {
  const suffix = uniqueSuffix();
  const location = `Level 3 corridor ${suffix}`;
  const otherOrigins = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL!).origin) otherOrigins.add(url.origin);
  });

  await signIn(page, 'inspector@example.com', 'Inspector123!');
  await page.getByRole('button', { name: '+ New inspection' }).click();
  await page.getByLabel('Project').selectOption({ label: `DEMO — ${SEEDED_PROJECT}` });
  await page.getByLabel('Firestop system').selectOption({ index: 1 });
  await page.getByLabel('Location').fill(location);
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  await page.getByLabel('Site photos').setInputFiles({ name: 'seal.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  const photo = page.getByAltText('Inspection evidence');
  await expect(photo).toBeVisible();
  await expect.poll(async () => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByLabel('AI instruction').fill('Describe the seal.');
  await page.getByRole('button', { name: /Generate AI draft/ }).click();
  await expect(page.getByText(/AI-assisted draft.*unverified/)).toBeVisible();
  await expect(page.getByText(/not a compliance decision/)).toBeVisible();

  await page.getByLabel('Inspection notes').fill(`Checked again ${suffix}`);
  await page.getByLabel('Status').selectOption('COMPLETED');
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const row = page.getByRole('row', { name: new RegExp(location) });
  await expect(row).toContainText('COMPLETED');
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByLabel('Inspection notes')).toHaveValue(`Checked again ${suffix}`);
  await expect(page.getByAltText('Inspection evidence')).toBeVisible();
  expect([...otherOrigins]).toEqual([]);
});

test('AC-4.2 an installer is not offered the register, and the register refuses their token', async ({ page }) => {
  await signIn(page, 'inspector@example.com', 'Inspector123!');

  await expect(page.getByRole('button', { name: 'Register' })).toHaveCount(0);

  const token = await page.evaluate(() => localStorage.getItem('inspection-token'));
  const response = await page.request.post('/api/register/projects', {
    headers: { authorization: `Bearer ${token}` },
    data: { code: `E2E-${uniqueSuffix()}`, name: 'Should not be created' }
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: 'Insufficient permissions' });
});

test('AC-4.2 a viewer can read the register through the gateway but is offered no way to change anything', async ({ page }) => {
  await signIn(page, 'viewer@example.com', 'Viewer123!');

  await expect(page.getByRole('button', { name: 'Register' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ New inspection' })).toHaveCount(0);

  const token = await page.evaluate(() => localStorage.getItem('inspection-token'));
  const read = await page.request.get('/api/register/snapshot', { headers: { authorization: `Bearer ${token}` } });
  expect(read.status()).toBe(200);
  expect((await read.json()).projects.some((project: { name: string }) => project.name === SEEDED_PROJECT)).toBe(true);
});
