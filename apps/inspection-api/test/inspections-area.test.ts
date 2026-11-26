import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Inspection } from '../src/inspections/inspection.js';
import {
  AREA_ID,
  OTHER_PROJECT_AREA_ID,
  OTHER_PROJECT_ID,
  OTHER_PROJECT_SYSTEM_ID,
  PROJECT_ID,
  SECOND_AREA_ID,
  UNKNOWN_ID
} from './support/fakes.js';
import { bearer, buildTestApp, tokenFor, validBody, type TestApp } from './support/test-app.js';

const INSPECTIONS = '/api/inspections';
const AREA_NOT_FOUND = 'Area not found in this project';
const AREA_INACTIVE = 'Area is inactive';

let context: TestApp;

beforeEach(async () => {
  context = await buildTestApp();
});

afterEach(async () => {
  await context.cleanUp();
});

function create(body: Record<string, unknown>) {
  return request(context.app).post(INSPECTIONS).set('authorization', bearer('INSPECTOR')).send(body);
}

function update(id: string, body: Record<string, unknown>) {
  return request(context.app).put(`${INSPECTIONS}/${id}`).set('authorization', bearer('INSPECTOR')).send(body);
}

async function stored(id: string): Promise<Inspection> {
  const response = await request(context.app).get(`${INSPECTIONS}/${id}`).set('authorization', bearer('VIEWER'));
  assert.equal(response.status, 200);
  return response.body;
}

/** Creates a record that must succeed, and returns it. */
async function created(body: Record<string, unknown>): Promise<Inspection> {
  const response = await create(body);
  assert.equal(response.status, 201);
  return response.body;
}

function areaCalls() {
  return context.register.calls.filter((call) => call.method === 'findArea');
}

test('AC-9.3 a record created with an active area of its project stores the area id and a copy of its name', async () => {
  const response = await create(validBody({ areaId: AREA_ID }));

  assert.equal(response.status, 201);
  assert.equal(response.body.areaId, AREA_ID);
  assert.equal(response.body.areaName, 'Level 4');
  assert.equal(response.body.location, 'Level 4, riser cupboard R4-12');
});

test('AC-9.3 the area is read back with the record, by id and in the list', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));

  const list = await request(context.app).get(INSPECTIONS).set('authorization', bearer('VIEWER'));

  assert.equal((await stored(record.id)).areaName, 'Level 4');
  assert.equal(list.body[0].areaId, AREA_ID);
  assert.equal(list.body[0].areaName, 'Level 4');
});

test('AC-9.3 the register is asked for the area under the record project, with the caller token', async () => {
  await created(validBody({ areaId: AREA_ID }));

  assert.deepEqual(areaCalls(), [{
    method: 'findArea', projectId: PROJECT_ID, areaId: AREA_ID, bearerToken: tokenFor('INSPECTOR')
  }]);
});

test('AC-9.3 renaming the area in the register afterwards does not change an existing record', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));

  context.register.areas.get(AREA_ID)!.name = 'Level 4 east';

  assert.equal((await stored(record.id)).areaName, 'Level 4');
});

test('AC-9.3 an update that keeps the area does not ask the register or touch the copy', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));
  context.register.areas.get(AREA_ID)!.name = 'Level 4 east';
  const callsBefore = context.register.calls.length;

  const response = await update(record.id, validBody({ areaId: AREA_ID, notes: 'Edited notes' }));

  assert.equal(response.status, 200);
  assert.equal(response.body.areaName, 'Level 4');
  assert.equal(response.body.notes, 'Edited notes');
  assert.equal(context.register.calls.length, callsBefore);
});

test('AC-9.3 an update that keeps the area works while the register is unavailable', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));
  context.register.unavailable = true;

  const response = await update(record.id, validBody({ areaId: AREA_ID, status: 'COMPLETED' }));

  assert.equal(response.status, 200);
  assert.equal(response.body.areaId, AREA_ID);
  assert.equal(response.body.status, 'COMPLETED');
});

test('AC-9.3 an update that changes the area asks the register and copies the new name', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));

  const response = await update(record.id, validBody({ areaId: SECOND_AREA_ID }));

  assert.equal(response.status, 200);
  assert.equal(response.body.areaId, SECOND_AREA_ID);
  assert.equal(response.body.areaName, 'Basement car park');
  assert.equal((await stored(record.id)).areaName, 'Basement car park');
});

test('AC-9.3 an update can give an area to a record that had none', async () => {
  const record = await created(validBody());

  const response = await update(record.id, validBody({ areaId: AREA_ID }));

  assert.equal(response.status, 200);
  assert.equal(response.body.areaId, AREA_ID);
  assert.equal(response.body.areaName, 'Level 4');
});

test('AC-9.3 a record moved to another project takes an area of that project', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));

  const response = await update(record.id, validBody({
    projectId: OTHER_PROJECT_ID, systemId: OTHER_PROJECT_SYSTEM_ID, areaId: OTHER_PROJECT_AREA_ID
  }));

  assert.equal(response.status, 200);
  assert.equal(response.body.projectName, 'Other Project');
  assert.equal(response.body.areaName, 'Level 1');
});

test('AC-9.4 an unknown area returns 422 with the reason and stores nothing', async () => {
  const response = await create(validBody({ areaId: UNKNOWN_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, AREA_NOT_FOUND);
  assert.equal(context.store.size, 0);
});

test('AC-9.4 an area that belongs to another project returns 422 and stores nothing', async () => {
  const response = await create(validBody({ areaId: OTHER_PROJECT_AREA_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, AREA_NOT_FOUND);
  assert.equal(context.store.size, 0);
});

test('AC-9.4 an inactive area returns 422 with the reason and stores nothing', async () => {
  context.register.areas.get(AREA_ID)!.active = false;

  const response = await create(validBody({ areaId: AREA_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, AREA_INACTIVE);
  assert.equal(context.store.size, 0);
});

test('AC-9.4 when the register is unavailable, creating a record with an area returns 503 and stores nothing', async () => {
  context.register.unavailable = true;

  const response = await create(validBody({ areaId: AREA_ID }));

  assert.equal(response.status, 503);
  assert.equal(context.store.size, 0);
});

test('AC-9.4 an areaId that is not a UUID returns 400 and stores nothing', async () => {
  for (const areaId of ['level-4', 4, '', {}]) {
    const response = await create(validBody({ areaId }));

    assert.equal(response.status, 400, `areaId ${JSON.stringify(areaId)}`);
    assert.match(response.body.error, /areaId/);
  }
  assert.equal(context.store.size, 0);
  assert.equal(areaCalls().length, 0);
});

test('AC-9.4 an update to an inactive area returns 422 and leaves the record unchanged', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));
  context.register.areas.get(SECOND_AREA_ID)!.active = false;

  const response = await update(record.id, validBody({ areaId: SECOND_AREA_ID, notes: 'Should not be saved' }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, AREA_INACTIVE);
  assert.deepEqual(await stored(record.id), record);
});

test('AC-9.4 an update to an unknown area returns 422 and leaves the record unchanged', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));

  const response = await update(record.id, validBody({ areaId: UNKNOWN_ID }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, AREA_NOT_FOUND);
  assert.deepEqual(await stored(record.id), record);
});

test('AC-9.4 a record moved to another project cannot keep the old project area: 422, unchanged', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));

  const response = await update(record.id, validBody({
    projectId: OTHER_PROJECT_ID, systemId: OTHER_PROJECT_SYSTEM_ID, areaId: AREA_ID
  }));

  assert.equal(response.status, 422);
  assert.equal(response.body.error, AREA_NOT_FOUND);
  assert.deepEqual(await stored(record.id), record);
});

test('AC-9.4 an update that changes the area while the register is unavailable returns 503, unchanged', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));
  context.register.unavailable = true;

  const response = await update(record.id, validBody({ areaId: SECOND_AREA_ID }));

  assert.equal(response.status, 503);
  assert.deepEqual(await stored(record.id), record);
});

test('AC-9.5 a record with no area is accepted, stores nulls, and the register is not asked about areas', async () => {
  const response = await create(validBody());

  assert.equal(response.status, 201);
  assert.equal(response.body.areaId, null);
  assert.equal(response.body.areaName, null);
  assert.equal(areaCalls().length, 0);
});

test('AC-9.5 an explicit null area is accepted on create', async () => {
  const response = await create(validBody({ areaId: null }));

  assert.equal(response.status, 201);
  assert.equal(response.body.areaId, null);
  assert.equal(response.body.areaName, null);
});

test('AC-9.5 a record with no area is updated without an area', async () => {
  const record = await created(validBody());

  const response = await update(record.id, validBody({ notes: 'Edited notes' }));

  assert.equal(response.status, 200);
  assert.equal(response.body.areaId, null);
  assert.equal(response.body.areaName, null);
  assert.equal(response.body.notes, 'Edited notes');
});

test('AC-9.5 an update without an area removes the area from the record, without asking the register', async () => {
  const record = await created(validBody({ areaId: AREA_ID }));
  const callsBefore = context.register.calls.length;

  const response = await update(record.id, validBody());

  assert.equal(response.status, 200);
  assert.equal(response.body.areaId, null);
  assert.equal(response.body.areaName, null);
  assert.equal(context.register.calls.length, callsBefore);
});
