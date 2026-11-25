import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  OTHER_PROJECT_ID,
  OTHER_PROJECT_SYSTEM_ID,
  PROJECT_ID,
  SYSTEM_ID,
  UNKNOWN_ID
} from './support/fakes.js';
import { bearer, buildTestApp, INSPECTOR, tokenFor, validBody, type TestApp } from './support/test-app.js';

const INSPECTIONS = '/api/inspections';
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

let context: TestApp;

beforeEach(async () => {
  context = await buildTestApp();
});

afterEach(async () => {
  await context.cleanUp();
});

function create(body: Record<string, unknown>, authorization: string = bearer('INSPECTOR')) {
  return request(context.app).post(INSPECTIONS).set('authorization', authorization).send(body);
}

test('AC-3.1 creating a record with a valid project and system returns 201 with the copied details', async () => {
  const response = await create(validBody());

  assert.equal(response.status, 201);
  assert.equal(typeof response.body.id, 'string');
  assert.equal(response.body.projectId, PROJECT_ID);
  assert.equal(response.body.projectName, 'Harbour View Apartments');
  assert.equal(response.body.systemId, SYSTEM_ID);
  assert.deepEqual(response.body.system, {
    code: 'SYS-01',
    substrate: 'Plasterboard wall',
    serviceType: 'Plastic pipe up to 50 mm',
    fireRating: '-/60/60',
    materials: 'Demo collar A',
    installationMethod: 'Fit one collar on each side of the wall.'
  });
  assert.equal(response.body.location, 'Level 4, riser cupboard R4-12');
  assert.equal(response.body.notes, 'Pipe sealed after installation.');
});

test('AC-3.1 a new record gets its defaults and the signed-in user as inspector', async () => {
  const response = await create(validBody());

  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'DRAFT');
  assert.equal(response.body.inspectorId, INSPECTOR.id);
  assert.equal(response.body.inspectorName, INSPECTOR.name);
  assert.equal(response.body.clientId, null);
  assert.equal(response.body.aiStatus, 'NONE');
  assert.equal(response.body.aiSummary, null);
  assert.equal(response.body.aiInstruction, null);
  assert.deepEqual(response.body.photos, []);
  assert.deepEqual(response.body.observations, []);
  assert.match(response.body.capturedAt, ISO_TIMESTAMP);
  assert.match(response.body.createdAt, ISO_TIMESTAMP);
});

test('AC-3.1 the building field is gone: it is neither required nor returned', async () => {
  const response = await create(validBody());

  assert.equal(response.status, 201);
  assert.equal('building' in response.body, false);
});

test('AC-3.1 a created record is stored and can be read back by id and in the list', async () => {
  const created = await create(validBody());

  const byId = await request(context.app)
    .get(`${INSPECTIONS}/${created.body.id}`)
    .set('authorization', bearer('VIEWER'));
  const list = await request(context.app).get(INSPECTIONS).set('authorization', bearer('VIEWER'));

  assert.equal(byId.status, 200);
  assert.deepEqual(byId.body, created.body);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, [created.body]);
});

test('AC-3.1 the device capture time, status and observations sent by the client are stored', async () => {
  const response = await create(validBody({
    capturedAt: '2030-05-01T08:10:00.000Z',
    status: 'IN_PROGRESS',
    observations: [{ description: 'Label missing', severity: 'MEDIUM', remedialAction: 'Fit a label' }]
  }));

  assert.equal(response.status, 201);
  assert.equal(response.body.capturedAt, '2030-05-01T08:10:00.000Z');
  assert.equal(response.body.status, 'IN_PROGRESS');
  assert.equal(response.body.observations.length, 1);
  assert.equal(typeof response.body.observations[0].id, 'string');
  assert.equal(response.body.observations[0].description, 'Label missing');
  assert.equal(response.body.observations[0].severity, 'MEDIUM');
  assert.equal(response.body.observations[0].remedialAction, 'Fit a label');
});

test('AC-3.1 the register is asked on behalf of the caller: the caller token is forwarded', async () => {
  const token = tokenFor('INSPECTOR');

  const response = await create(validBody(), `Bearer ${token}`);

  assert.equal(response.status, 201);
  assert.ok(context.register.calls.length > 0);
  for (const call of context.register.calls) {
    assert.equal(call.bearerToken, token);
  }
  assert.ok(context.register.calls.some((call) => call.method === 'findSystem' && call.systemId === SYSTEM_ID));
});

test('AC-3.2 an unknown system returns 422 with the reason and stores nothing', async () => {
  const response = await create(validBody({ systemId: UNKNOWN_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Firestop system not found in this project');
  assert.equal(context.store.size, 0);
});

test('AC-3.2 a system that belongs to another project returns 422 and stores nothing', async () => {
  const response = await create(validBody({ systemId: OTHER_PROJECT_SYSTEM_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Firestop system not found in this project');
  assert.equal(context.store.size, 0);
});

test('AC-3.2 an inactive system returns 422 with the reason and stores nothing', async () => {
  context.register.systems.get(SYSTEM_ID)!.active = false;

  const response = await create(validBody());

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Firestop system is inactive');
  assert.equal(context.store.size, 0);
});

test('AC-3.2 an unknown project returns 422 with the reason and stores nothing', async () => {
  const response = await create(validBody({ projectId: UNKNOWN_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Project not found');
  assert.equal(context.store.size, 0);
});

test('AC-3.2 an inactive project returns 422 with the reason and stores nothing', async () => {
  context.register.projects.get(PROJECT_ID)!.active = false;

  const response = await create(validBody());

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'Project is inactive');
  assert.equal(context.store.size, 0);
});

test('AC-3.3 when the register is unavailable, create returns 503 and stores nothing', async () => {
  context.register.unavailable = true;

  const response = await create(validBody());

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'The register service is unavailable. Try again later.');
  assert.equal(context.store.size, 0);
});

test('AC-3.4 posting the same clientId twice returns the same record and stores one', async () => {
  const first = await create(validBody({ clientId: CLIENT_ID }));
  const second = await create(validBody({ clientId: CLIENT_ID }));

  assert.equal(first.status, 201);
  assert.equal(first.body.clientId, CLIENT_ID);
  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
  assert.equal(context.store.size, 1);
});

test('AC-3.4 a repeat with the same clientId does not change the stored record', async () => {
  const first = await create(validBody({ clientId: CLIENT_ID, notes: 'First upload' }));

  const second = await create(validBody({ clientId: CLIENT_ID, notes: 'Second upload', location: 'Elsewhere' }));

  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
});

test('AC-3.4 a repeat with the same clientId is answered even while the register is unavailable', async () => {
  const first = await create(validBody({ clientId: CLIENT_ID }));
  context.register.unavailable = true;

  const second = await create(validBody({ clientId: CLIENT_ID }));

  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
});

test('AC-3.4 records without a clientId are never treated as repeats', async () => {
  const first = await create(validBody());
  const second = await create(validBody());

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(second.body.id, first.body.id);
  assert.equal(context.store.size, 2);
});

const invalidBodies: Array<[string, Record<string, unknown>]> = [
  ['a missing projectId', validBody({ projectId: undefined })],
  ['a projectId that is not a UUID', validBody({ projectId: 'not-a-uuid' })],
  ['a missing systemId', validBody({ systemId: undefined })],
  ['a systemId that is not a UUID', validBody({ systemId: 42 })],
  ['a missing location', validBody({ location: undefined })],
  ['a blank location', validBody({ location: '   ' })],
  ['notes that are not text', validBody({ notes: 42 })],
  ['notes longer than 5000 characters', validBody({ notes: 'x'.repeat(5001) })],
  ['an unknown status', validBody({ status: 'APPROVED' })],
  ['a clientId that is not a UUID', validBody({ clientId: 'device-1' })],
  ['a capturedAt that is not a date', validBody({ capturedAt: 'yesterday' })],
  ['observations that are not a list', validBody({ observations: 'none' })],
  ['an observation with an unknown severity', validBody({ observations: [{ description: 'x', severity: 'URGENT' }] })]
];

for (const [description, body] of invalidBodies) {
  test(`AC-3.7 ${description} returns 400 with a message, asks the register nothing and stores nothing`, async () => {
    const response = await create(body);

    assert.equal(response.status, 400);
    assert.equal(typeof response.body.error, 'string');
    assert.ok(response.body.error.length > 0);
    assert.equal(context.register.calls.length, 0);
    assert.equal(context.store.size, 0);
  });
}

test('AC-3.8 creating without a token returns 401 and stores nothing', async () => {
  const response = await request(context.app).post(INSPECTIONS).send(validBody());

  assert.equal(response.status, 401);
  assert.equal(context.store.size, 0);
});

test('AC-3.8 a viewer cannot create a record: 403 and nothing stored', async () => {
  const response = await create(validBody(), bearer('VIEWER'));

  assert.equal(response.status, 403);
  assert.equal(context.store.size, 0);
});

test('AC-3.8 an admin can create a record', async () => {
  const response = await create(validBody(), bearer('ADMIN'));

  assert.equal(response.status, 201);
});

test('AC-3.8 only an admin can delete a record', async () => {
  const created = await create(validBody());
  const path = `${INSPECTIONS}/${created.body.id}`;

  const byInspector = await request(context.app).delete(path).set('authorization', bearer('INSPECTOR'));
  const byViewer = await request(context.app).delete(path).set('authorization', bearer('VIEWER'));
  assert.equal(byInspector.status, 403);
  assert.equal(byViewer.status, 403);
  assert.equal(context.store.size, 1);

  const byAdmin = await request(context.app).delete(path).set('authorization', bearer('ADMIN'));
  assert.equal(byAdmin.status, 204);
  assert.equal(context.store.size, 0);
});

test('AC-3.8 reading or deleting an unknown record returns 404', async () => {
  const read = await request(context.app).get(`${INSPECTIONS}/${UNKNOWN_ID}`).set('authorization', bearer('VIEWER'));
  const removed = await request(context.app)
    .delete(`${INSPECTIONS}/${UNKNOWN_ID}`)
    .set('authorization', bearer('ADMIN'));

  assert.equal(read.status, 404);
  assert.equal(removed.status, 404);
});

test('AC-3.1 a record for a second project copies that project and its own system', async () => {
  const response = await create(validBody({ projectId: OTHER_PROJECT_ID, systemId: OTHER_PROJECT_SYSTEM_ID }));

  assert.equal(response.status, 201);
  assert.equal(response.body.projectName, 'Other Project');
  assert.equal(response.body.system.materials, 'Demo putty C');
});
