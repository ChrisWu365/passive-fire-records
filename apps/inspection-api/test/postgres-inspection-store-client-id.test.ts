import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { migrate } from '../src/database/migrator.js';
import type { NewInspection } from '../src/inspections/inspection.js';
import { PostgresInspectionStore } from '../src/inspections/postgres-inspection-store.js';
import { dropSchema, newPool, uniqueSchemaName } from './support/test-database.js';

const CLIENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_CLIENT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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

function newInspection(clientId: string | null): NewInspection {
  return {
    clientId,
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
    areaId: null,
    areaName: null,
    location: 'Level 4',
    notes: '',
    status: 'DRAFT',
    inspectorId: 'user-inspector',
    inspectorName: 'Demo Inspector',
    observations: [{ id: 'observation-1', description: 'Label missing', severity: 'LOW', remedialAction: '' }],
    photos: ['/uploads/first.png'],
    aiInstruction: null,
    aiSummary: null,
    aiStatus: 'NONE',
    capturedAt: '2030-05-01T08:10:00.000Z'
  };
}

test('AC-3.4 findByClientId returns the complete record stored under that clientId', async () => {
  const { inspection } = await store.create(newInspection(CLIENT_ID));
  await store.create(newInspection(OTHER_CLIENT_ID));
  await store.create(newInspection(null));

  const found = await store.findByClientId(CLIENT_ID);

  assert.deepEqual(found, inspection);
});

test('AC-3.4 findByClientId returns undefined when no record has that clientId', async () => {
  await store.create(newInspection(null));

  assert.equal(await store.findByClientId(CLIENT_ID), undefined);
});
