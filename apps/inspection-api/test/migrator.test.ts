import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { migrate } from '../src/database/migrator.js';
import { dropSchema, newPool, uniqueSchemaName } from './support/test-database.js';

let pool: pg.Pool;
let schema: string;

before(() => {
  pool = newPool();
});

beforeEach(() => {
  schema = uniqueSchemaName();
});

afterEach(async () => {
  await dropSchema(pool, schema);
});

after(async () => {
  await pool.end();
});

async function tableNames(): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    'select table_name from information_schema.tables where table_schema = $1 order by table_name',
    [schema]
  );
  return result.rows.map((row) => row.table_name);
}

test('AC-3.6 the first run creates the schema and the inspection, observation and photo tables', async () => {
  const result = await migrate(pool, schema);

  assert.ok(result.applied.length > 0);
  const tables = await tableNames();
  for (const expected of ['inspection', 'observation', 'photo']) {
    assert.ok(tables.includes(expected), `expected table ${expected} in ${tables.join(', ')}`);
  }
});

test('AC-3.6 a second run applies nothing and leaves the data in place', async () => {
  const first = await migrate(pool, schema);
  await pool.query(
    `insert into ${schema}.inspection
       (id, project_id, project_name, system_id, system_code, system_substrate, system_service_type,
        system_fire_rating, system_materials, system_method, location, notes, status, inspector_id,
        inspector_name, ai_status, captured_at, created_at, updated_at)
     values (gen_random_uuid(), gen_random_uuid(), 'P', gen_random_uuid(), 'SYS-01', 's', 't', 'r', 'm', 'i',
        'L', '', 'DRAFT', 'u', 'U', 'NONE', now(), now(), now())`
  );

  const second = await migrate(pool, schema);

  assert.deepEqual(second.applied, []);
  assert.ok(first.applied.length > 0);
  const count = await pool.query<{ count: string }>(`select count(*) from ${schema}.inspection`);
  assert.equal(count.rows[0].count, '1');
});

test('AC-3.6 two instances migrating at the same moment both succeed and apply each migration once', async () => {
  const [left, right] = await Promise.all([migrate(pool, schema), migrate(pool, schema)]);

  const appliedInTotal = left.applied.length + right.applied.length;
  const afterwards = await migrate(pool, schema);
  assert.ok(appliedInTotal > 0);
  assert.equal(new Set([...left.applied, ...right.applied]).size, appliedInTotal);
  assert.deepEqual(afterwards.applied, []);
});

test('AC-3.4 the database itself refuses two records with the same clientId', async () => {
  await migrate(pool, schema);
  const insert = `insert into ${schema}.inspection
       (id, client_id, project_id, project_name, system_id, system_code, system_substrate, system_service_type,
        system_fire_rating, system_materials, system_method, location, notes, status, inspector_id,
        inspector_name, ai_status, captured_at, created_at, updated_at)
     values (gen_random_uuid(), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', gen_random_uuid(), 'P', gen_random_uuid(),
        'SYS-01', 's', 't', 'r', 'm', 'i', 'L', '', 'DRAFT', 'u', 'U', 'NONE', now(), now(), now())`;
  await pool.query(insert);

  await assert.rejects(pool.query(insert), { code: '23505' });
});

for (const badName of ['Inspection', 'inspection-test', 'inspection; drop schema public', '', '1starts_with_digit']) {
  test(`AC-3.6 the schema name "${badName}" is rejected before anything is run`, async () => {
    await assert.rejects(migrate(pool, badName), /schema/i);
  });
}
