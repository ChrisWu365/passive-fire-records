import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { migrate } from '../src/database/migrator.js';
import type { NewInspection } from '../src/inspections/inspection.js';
import { PostgresInspectionStore } from '../src/inspections/postgres-inspection-store.js';
import { dropSchema, newPool, uniqueSchemaName } from './support/test-database.js';

const AREA_ID = '66666666-6666-4666-8666-666666666666';
const SECOND_AREA_ID = '77777777-7777-4777-8777-777777777777';
const LEGACY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
    areaId: AREA_ID,
    areaName: 'Level 4',
    location: 'Riser cupboard R4-12',
    notes: '',
    status: 'DRAFT',
    inspectorId: 'user-inspector',
    inspectorName: 'Demo Inspector',
    observations: [],
    photos: [],
    aiInstruction: null,
    aiSummary: null,
    aiStatus: 'NONE',
    capturedAt: '2030-05-01T08:10:00.000Z',
    ...overrides
  };
}

test('AC-9.3 a record with an area is read back with the area id and name, by a new store instance', async () => {
  const { inspection: written } = await store.create(newInspection());

  const read = await new PostgresInspectionStore(pool, schema).findById(written.id);

  assert.equal(written.areaId, AREA_ID);
  assert.equal(written.areaName, 'Level 4');
  assert.deepEqual(read, written);
});

test('AC-9.3 the list returns each record with its own area', async () => {
  await store.create(newInspection({ location: 'First' }));
  await store.create(newInspection({ location: 'Second', areaId: SECOND_AREA_ID, areaName: 'Basement car park' }));

  const areasByLocation = new Map((await store.list()).map((record) => [record.location, record.areaName]));

  assert.equal(areasByLocation.get('First'), 'Level 4');
  assert.equal(areasByLocation.get('Second'), 'Basement car park');
});

test('AC-9.3 an update replaces the area id and name', async () => {
  const { inspection } = await store.create(newInspection());

  const updated = await store.update({ ...inspection, areaId: SECOND_AREA_ID, areaName: 'Basement car park' });

  assert.equal(updated?.areaId, SECOND_AREA_ID);
  assert.equal(updated?.areaName, 'Basement car park');
  assert.equal((await store.findById(inspection.id))?.areaName, 'Basement car park');
});

test('AC-9.5 a record with no area is stored and read back with nulls', async () => {
  const { inspection } = await store.create(newInspection({ areaId: null, areaName: null }));

  const read = await store.findById(inspection.id);

  assert.equal(read?.areaId, null);
  assert.equal(read?.areaName, null);
});

test('AC-9.5 an update can remove the area from a record', async () => {
  const { inspection } = await store.create(newInspection());

  const updated = await store.update({ ...inspection, areaId: null, areaName: null });

  assert.equal(updated?.areaId, null);
  assert.equal(updated?.areaName, null);
});

test('AC-9.5 a row written with only the columns that existed before this slice reads and updates', async () => {
  await pool.query(
    `insert into ${schema}.inspection
       (id, client_id, project_id, project_name, system_id, system_code, system_substrate, system_service_type,
        system_fire_rating, system_materials, system_method, location, notes, status, inspector_id,
        inspector_name, ai_status, captured_at, created_at, updated_at)
     values ($1, null, gen_random_uuid(), 'Old Project', gen_random_uuid(), 'SYS-01', 's', 't', 'r', 'm', 'i',
        'Level 2 riser', '', 'DRAFT', 'u', 'U', 'NONE', now(), now(), now())`,
    [LEGACY_ID]
  );

  const read = await store.findById(LEGACY_ID);
  const updated = await store.update({ ...read!, notes: 'Edited after the upgrade' });

  assert.equal(read?.areaId, null);
  assert.equal(read?.areaName, null);
  assert.equal(read?.location, 'Level 2 riser');
  assert.equal(updated?.notes, 'Edited after the upgrade');
  assert.equal(updated?.areaId, null);
});

test('AC-9.5 migrating a schema that already holds records keeps them and adds the area columns empty', async () => {
  const upgraded = uniqueSchemaName();
  try {
    await migrate(pool, upgraded);
    await pool.query(
      `insert into ${upgraded}.inspection
         (id, client_id, project_id, project_name, system_id, system_code, system_substrate, system_service_type,
          system_fire_rating, system_materials, system_method, location, notes, status, inspector_id,
          inspector_name, ai_status, captured_at, created_at, updated_at)
       values ($1, null, gen_random_uuid(), 'Old Project', gen_random_uuid(), 'SYS-01', 's', 't', 'r', 'm', 'i',
          'Level 2 riser', '', 'DRAFT', 'u', 'U', 'NONE', now(), now(), now())`,
      [LEGACY_ID]
    );

    const again = await migrate(pool, upgraded);
    const columns = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = $1 and table_name = 'inspection' and column_name in ('area_id', 'area_name')
       order by column_name`,
      [upgraded]
    );

    assert.deepEqual(again.applied, []);
    assert.deepEqual(columns.rows, [
      { column_name: 'area_id', is_nullable: 'YES' },
      { column_name: 'area_name', is_nullable: 'YES' }
    ]);
    assert.equal((await new PostgresInspectionStore(pool, upgraded).findById(LEGACY_ID))?.location, 'Level 2 riser');
  } finally {
    await dropSchema(pool, upgraded);
  }
});
