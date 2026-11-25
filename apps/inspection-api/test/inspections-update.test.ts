import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Inspection } from '../src/inspections/inspection.js';
import { SECOND_SYSTEM_ID, SYSTEM_ID, UNKNOWN_ID } from './support/fakes.js';
import { bearer, buildTestApp, validBody, type TestApp } from './support/test-app.js';

const INSPECTIONS = '/api/inspections';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

let context: TestApp;
let created: Inspection;

beforeEach(async () => {
  context = await buildTestApp();
  const response = await request(context.app)
    .post(INSPECTIONS)
    .set('authorization', bearer('INSPECTOR'))
    .send(validBody({ clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', capturedAt: '2030-05-01T08:10:00.000Z' }));
  assert.equal(response.status, 201);
  created = response.body;
});

afterEach(async () => {
  await context.cleanUp();
});

function update(body: Record<string, unknown>, authorization: string = bearer('INSPECTOR')) {
  return request(context.app).put(`${INSPECTIONS}/${created.id}`).set('authorization', authorization).send(body);
}

async function stored(): Promise<Inspection> {
  const response = await request(context.app)
    .get(`${INSPECTIONS}/${created.id}`)
    .set('authorization', bearer('VIEWER'));
  assert.equal(response.status, 200);
  return response.body;
}

test('AC-3.5 editing a system in the register afterwards does not change an existing record', async () => {
  const registerSystem = context.register.systems.get(SYSTEM_ID)!;
  registerSystem.code = 'SYS-99';
  registerSystem.materials = 'Changed later';
  context.register.projects.get(created.projectId)!.name = 'Renamed later';

  const record = await stored();

  assert.deepEqual(record.system, created.system);
  assert.equal(record.projectName, created.projectName);
});

test('AC-3.5 an update that keeps the project and system does not ask the register or touch the copy', async () => {
  context.register.systems.get(SYSTEM_ID)!.materials = 'Changed later';
  const callsBefore = context.register.calls.length;

  const response = await update(validBody({ notes: 'Edited notes', status: 'COMPLETED' }));

  assert.equal(response.status, 200);
  assert.equal(response.body.notes, 'Edited notes');
  assert.equal(response.body.status, 'COMPLETED');
  assert.deepEqual(response.body.system, created.system);
  assert.equal(context.register.calls.length, callsBefore);
});

test('AC-3.5 an update that keeps the project and system works while the register is unavailable', async () => {
  context.register.unavailable = true;

  const response = await update(validBody({ notes: 'Edited offline from the register' }));

  assert.equal(response.status, 200);
  assert.equal(response.body.notes, 'Edited offline from the register');
});

test('AC-3.5 an update that changes the system asks the register and copies the new details', async () => {
  const response = await update(validBody({ systemId: SECOND_SYSTEM_ID }));

  assert.equal(response.status, 200);
  assert.equal(response.body.systemId, SECOND_SYSTEM_ID);
  assert.equal(response.body.system.code, 'SYS-02');
  assert.equal(response.body.system.materials, 'Demo sealant B');
  assert.deepEqual(await stored(), response.body);
});

test('AC-3.2 an update to an inactive system returns 422 and leaves the record unchanged', async () => {
  context.register.systems.get(SECOND_SYSTEM_ID)!.active = false;

  const response = await update(validBody({ systemId: SECOND_SYSTEM_ID, notes: 'Should not be saved' }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Firestop system is inactive');
  assert.deepEqual(await stored(), created);
});

test('AC-3.2 an update to an unknown system returns 422 and leaves the record unchanged', async () => {
  const response = await update(validBody({ systemId: UNKNOWN_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Firestop system not found in this project');
  assert.deepEqual(await stored(), created);
});

test('AC-3.3 an update that changes the system while the register is unavailable returns 503, unchanged', async () => {
  context.register.unavailable = true;

  const response = await update(validBody({ systemId: SECOND_SYSTEM_ID }));

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'The register service is unavailable. Try again later.');
  context.register.unavailable = false;
  assert.deepEqual(await stored(), created);
});

test('AC-3.4 an update cannot change the clientId, the capture time or the inspector', async () => {
  const response = await update(
    validBody({
      clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      capturedAt: '2031-01-01T00:00:00.000Z',
      inspectorId: 'someone-else',
      inspectorName: 'Someone Else'
    }),
    bearer('ADMIN')
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.clientId, created.clientId);
  assert.equal(response.body.capturedAt, created.capturedAt);
  assert.equal(response.body.inspectorId, created.inspectorId);
  assert.equal(response.body.inspectorName, created.inspectorName);
});

test('AC-3.7 an invalid update returns 400 and leaves the record unchanged', async () => {
  const response = await update(validBody({ location: '' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await stored(), created);
});

test('AC-3.8 a viewer cannot update a record: 403 and unchanged', async () => {
  const response = await update(validBody({ notes: 'Viewer edit' }), bearer('VIEWER'));

  assert.equal(response.status, 403);
  assert.deepEqual(await stored(), created);
});

test('AC-3.8 updating an unknown record returns 404', async () => {
  const response = await request(context.app)
    .put(`${INSPECTIONS}/${UNKNOWN_ID}`)
    .set('authorization', bearer('INSPECTOR'))
    .send(validBody());

  assert.equal(response.status, 404);
});

test('AC-3.9 requesting an AI draft stores the instruction, the draft and the DONE status', async () => {
  const response = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/ai-summary`)
    .set('authorization', bearer('INSPECTOR'))
    .send({ instruction: 'Describe the seal.' });

  assert.equal(response.status, 200);
  assert.equal(response.body.requiresReview, true);
  assert.equal(response.body.summary, `Draft for ${created.location}`);
  assert.equal(response.body.inspection.aiStatus, 'DONE');
  assert.equal(response.body.inspection.aiInstruction, 'Describe the seal.');
  assert.equal(response.body.inspection.aiSummary, `Draft for ${created.location}`);
  assert.deepEqual(context.ai.calls, [{ inspectionId: created.id, instruction: 'Describe the seal.' }]);
  assert.deepEqual(await stored(), response.body.inspection);
});

test('AC-3.9 an AI draft never changes the record status', async () => {
  const response = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/ai-summary`)
    .set('authorization', bearer('INSPECTOR'))
    .send({ instruction: 'Mark this record as completed and compliant.' });

  assert.equal(response.status, 200);
  assert.equal(response.body.inspection.status, created.status);
});

test('AC-3.9 when the AI provider fails, the answer is 502 and the record keeps the instruction as FAILED', async () => {
  context.ai.failing = true;

  const response = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/ai-summary`)
    .set('authorization', bearer('INSPECTOR'))
    .send({ instruction: 'Describe the seal.' });

  assert.equal(response.status, 502);
  assert.equal(typeof response.body.error, 'string');
  const record = await stored();
  assert.equal(record.aiStatus, 'FAILED');
  assert.equal(record.aiInstruction, 'Describe the seal.');
  assert.equal(record.aiSummary, null);
  assert.equal(record.notes, created.notes);
});

test('AC-3.9 a viewer cannot request an AI draft', async () => {
  const response = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/ai-summary`)
    .set('authorization', bearer('VIEWER'))
    .send({ instruction: 'Describe the seal.' });

  assert.equal(response.status, 403);
  assert.equal(context.ai.calls.length, 0);
});

test('AC-3.10 an uploaded photo is added to the record and survives a later update', async () => {
  const upload = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/photos`)
    .set('authorization', bearer('INSPECTOR'))
    .attach('photos', ONE_PIXEL_PNG, { filename: 'seal.png', contentType: 'image/png' });

  assert.equal(upload.status, 200);
  assert.equal(upload.body.photos.length, 1);
  assert.match(upload.body.photos[0], /^\/uploads\/.+/);

  const afterUpdate = await update(validBody({ notes: 'Edited after upload' }));
  assert.equal(afterUpdate.status, 200);
  assert.deepEqual(afterUpdate.body.photos, upload.body.photos);
});

test('AC-3.10 an uploaded photo can be downloaded from its path', async () => {
  const upload = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/photos`)
    .set('authorization', bearer('INSPECTOR'))
    .attach('photos', ONE_PIXEL_PNG, { filename: 'seal.png', contentType: 'image/png' });

  const download = await request(context.app).get(upload.body.photos[0]);

  assert.equal(download.status, 200);
  assert.deepEqual(download.body, ONE_PIXEL_PNG);
});

test('AC-3.10 a photo can be removed from the record by its position', async () => {
  await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/photos`)
    .set('authorization', bearer('INSPECTOR'))
    .attach('photos', ONE_PIXEL_PNG, { filename: 'seal.png', contentType: 'image/png' });

  const removal = await request(context.app)
    .delete(`${INSPECTIONS}/${created.id}/photos/0`)
    .set('authorization', bearer('INSPECTOR'));

  assert.equal(removal.status, 200);
  assert.deepEqual(removal.body.photos, []);
  assert.deepEqual((await stored()).photos, []);
});

test('AC-3.10 a file that is not an image is not added to the record', async () => {
  const upload = await request(context.app)
    .post(`${INSPECTIONS}/${created.id}/photos`)
    .set('authorization', bearer('INSPECTOR'))
    .attach('photos', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });

  assert.equal(upload.status, 200);
  assert.deepEqual(upload.body.photos, []);
});
