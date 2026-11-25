import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { migrate } from '../src/database/migrator.js';
import type { Inspection, NewInspection } from '../src/inspections/inspection.js';
import { PostgresInspectionStore } from '../src/inspections/postgres-inspection-store.js';
import { dropSchema, newPool, uniqueSchemaName } from './support/test-database.js';

const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';
const CLIENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

let pool: pg.Pool;
let schema: string;
let store: PostgresInspectionStore;

before(async () => {
  pool = newPool();
  schema = uniqueSchemaName();
  await migrate(pool, schema);
});

beforeEach(async () => {
  await pool.query(`truncate ${schema}.inspection cascade`);
  store = new PostgresInspectionStore(pool, schema);
});

after(async () => {
  await dropSchema(pool, schema);
  await pool.end();
});

function newInspection(overrides: Partial<NewInspection> = {}): NewInspection {
  return {
    clientId: null,
    projectId: '11111111-1111-4111-8111-111111111111',
    projectName: 'Harbour View Apartments',
    systemId: '33333333-3333-4333-8333-333333333333',
    system: {
      code: 'SYS-01',
      substrate: 'Plasterboard wall',
      serviceType: 'Plastic pipe up to 50 mm',
      fireRating: '-/60/60',
      materials: 'Demo collar A',
      installationMethod: 'Fit one collar on each side of the wall.'
    },
    location: 'Level 4, riser cupboard R4-12',
    notes: 'Pipe sealed after installation.',
    status: 'IN_PROGRESS',
    inspectorId: 'user-inspector',
    inspectorName: 'Demo Inspector',
    observations: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', description: 'Label missing', severity: 'MEDIUM', remedialAction: 'Fit a label' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', description: 'Gap at the top', severity: 'HIGH', remedialAction: 'Reseal' }
    ],
    photos: ['/uploads/first.png', '/uploads/second.png'],
    aiInstruction: 'Describe the seal.',
    aiSummary: 'A draft.',
    aiStatus: 'DONE',
    capturedAt: '2030-05-01T08:10:00.000Z',
    ...overrides
  };
}

test('AC-3.6 a record written by one store instance is read back complete by a new instance on a new pool', async () => {
  const input = newInspection({ clientId: CLIENT_ID });
  const { inspection: written, created } = await store.create(input);

  const secondPool = newPool();
  try {
    const restarted = new PostgresInspectionStore(secondPool, schema);
    const read = await restarted.findById(written.id);

    assert.equal(created, true);
    assert.deepEqual(read, written);
    assert.deepEqual(read, { ...input, id: written.id, createdAt: written.createdAt, updatedAt: written.updatedAt });
  } finally {
    await secondPool.end();
  }
});

test('AC-3.6 photo references and observations keep their order', async () => {
  const { inspection } = await store.create(newInspection());

  const read = await store.findById(inspection.id);

  assert.deepEqual(read?.photos, ['/uploads/first.png', '/uploads/second.png']);
  assert.deepEqual(read?.observations.map((observation) => observation.description), ['Label missing', 'Gap at the top']);
});

test('AC-3.6 a record with no optional values is stored and read back with nulls and empty lists', async () => {
  const input = newInspection({
    observations: [], photos: [], aiInstruction: null, aiSummary: null, aiStatus: 'NONE', notes: ''
  });

  const { inspection } = await store.create(input);
  const read = await store.findById(inspection.id);

  assert.equal(read?.clientId, null);
  assert.equal(read?.aiInstruction, null);
  assert.equal(read?.aiSummary, null);
  assert.deepEqual(read?.observations, []);
  assert.deepEqual(read?.photos, []);
});

test('AC-3.6 the store assigns the id and timestamps as ISO strings', async () => {
  const { inspection } = await store.create(newInspection());

  assert.match(inspection.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(inspection.createdAt).toISOString(), inspection.createdAt);
  assert.equal(inspection.updatedAt, inspection.createdAt);
  assert.equal(inspection.capturedAt, '2030-05-01T08:10:00.000Z');
});

test('AC-3.6 list returns every record, most recently updated first', async () => {
  const first = (await store.create(newInspection({ location: 'First' }))).inspection;
  const second = (await store.create(newInspection({ location: 'Second' }))).inspection;
  await store.update({ ...first, notes: 'Touched last' });

  const listed = await store.list();

  assert.deepEqual(listed.map((inspection) => inspection.id), [first.id, second.id]);
});

test('AC-3.6 update replaces the fields, observations and photos, and advances updatedAt', async () => {
  const { inspection } = await store.create(newInspection({ clientId: CLIENT_ID }));

  const updated = await store.update({
    ...inspection,
    systemId: '44444444-4444-4444-8444-444444444444',
    system: { ...inspection.system, code: 'SYS-02', materials: 'Demo sealant B' },
    location: 'Level 5',
    notes: 'Edited',
    status: 'COMPLETED',
    observations: [{ id: 'aaaaaaaa-0000-4000-8000-000000000003', description: 'Only one', severity: 'LOW', remedialAction: '' }],
    photos: ['/uploads/second.png'],
    aiInstruction: null,
    aiSummary: null,
    aiStatus: 'FAILED'
  });

  assert.ok(updated);
  assert.equal(updated.systemId, '44444444-4444-4444-8444-444444444444');
  assert.equal(updated.system.code, 'SYS-02');
  assert.equal(updated.location, 'Level 5');
  assert.equal(updated.status, 'COMPLETED');
  assert.equal(updated.aiStatus, 'FAILED');
  assert.equal(updated.aiSummary, null);
  assert.deepEqual(updated.photos, ['/uploads/second.png']);
  assert.deepEqual(updated.observations.map((observation) => observation.description), ['Only one']);
  assert.ok(updated.updatedAt >= inspection.updatedAt);
  assert.deepEqual(await store.findById(inspection.id), updated);
});

test('AC-3.6 update never changes the id, clientId, capture time or creation time', async () => {
  const { inspection } = await store.create(newInspection({ clientId: CLIENT_ID }));

  const updated = await store.update({
    ...inspection,
    clientId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    capturedAt: '2031-01-01T00:00:00.000Z',
    createdAt: '2031-01-01T00:00:00.000Z'
  });

  assert.equal(updated?.id, inspection.id);
  assert.equal(updated?.clientId, CLIENT_ID);
  assert.equal(updated?.capturedAt, inspection.capturedAt);
  assert.equal(updated?.createdAt, inspection.createdAt);
});

test('AC-3.6 an unknown id gives undefined on find and update, and false on delete', async () => {
  const { inspection } = await store.create(newInspection());

  assert.equal(await store.findById(UNKNOWN_ID), undefined);
  assert.equal(await store.update({ ...inspection, id: UNKNOWN_ID }), undefined);
  assert.equal(await store.delete(UNKNOWN_ID), false);
});

test('AC-3.6 delete removes the record together with its observations and photos', async () => {
  const { inspection } = await store.create(newInspection());

  assert.equal(await store.delete(inspection.id), true);

  assert.equal(await store.findById(inspection.id), undefined);
  for (const table of ['inspection', 'observation', 'photo']) {
    const count = await pool.query<{ count: string }>(`select count(*) from ${schema}.${table}`);
    assert.equal(count.rows[0].count, '0', `${table} should be empty`);
  }
});

test('AC-3.6 a failed write leaves nothing behind: the record and its child rows are stored together or not at all', async () => {
  const duplicatedObservationId = 'aaaaaaaa-0000-4000-8000-000000000009';
  const input = newInspection({
    observations: [
      { id: duplicatedObservationId, description: 'One', severity: 'LOW', remedialAction: '' },
      { id: duplicatedObservationId, description: 'Same id again', severity: 'LOW', remedialAction: '' }
    ]
  });

  await assert.rejects(store.create(input));

  assert.deepEqual(await store.list(), []);
  const observations = await pool.query<{ count: string }>(`select count(*) from ${schema}.observation`);
  assert.equal(observations.rows[0].count, '0');
});

test('AC-3.4 creating with a clientId that already exists returns the existing record and inserts nothing', async () => {
  const first = await store.create(newInspection({ clientId: CLIENT_ID, notes: 'First upload' }));

  const second = await store.create(newInspection({ clientId: CLIENT_ID, notes: 'Second upload' }));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(second.inspection, first.inspection);
  assert.equal((await store.list()).length, 1);
});

test('AC-3.4 five simultaneous creates with one clientId store one record and all return it', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => store.create(newInspection({ clientId: CLIENT_ID })))
  );

  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(new Set(results.map((result) => result.inspection.id)).size, 1);
  assert.equal((await store.list()).length, 1);
});

test('AC-3.4 records without a clientId are always inserted', async () => {
  const first = await store.create(newInspection());
  const second = await store.create(newInspection());

  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.notEqual(second.inspection.id, first.inspection.id);
});

function assertIsInspection(value: Inspection | undefined): asserts value is Inspection {
  assert.ok(value);
}

test('AC-3.6 reading by a client id written earlier still works after an update', async () => {
  const { inspection } = await store.create(newInspection({ clientId: CLIENT_ID }));
  await store.update({ ...inspection, notes: 'Edited' });

  const repeat = await store.create(newInspection({ clientId: CLIENT_ID }));

  assert.equal(repeat.created, false);
  assertIsInspection(repeat.inspection);
  assert.equal(repeat.inspection.notes, 'Edited');
});
