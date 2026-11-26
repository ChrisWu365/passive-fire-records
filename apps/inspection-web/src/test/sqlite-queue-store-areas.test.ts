// @vitest-environment node
// (SQLite's WebAssembly build runs under Node with an in-memory database; it needs no browser.)
import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteQueueStore } from '../offline/queue/sqlite-queue-store';
import type { SqlDatabase } from '../offline/sql-database';
import { AREA_ID } from './fake-api';
import { openMemoryDatabase } from './node-sqlite';
import { draft, photo } from './queue-fakes';

const EARLIER_CLIENT_ID = 'c1c1c1c1-0000-4000-8000-00000000000a';

/** The queue tables exactly as the app created them before areas existed, holding one waiting record. */
const TABLES_BEFORE_AREAS: readonly string[] = [
  `create table queued_inspection (
     client_id text primary key, project_id text not null, project_name text not null, system_id text not null,
     system_json text not null, location text not null, notes text not null, status text not null,
     observations_json text not null, ai_instruction text not null, captured_at text not null,
     created_by_id text not null, created_by_name text not null,
     state text not null check (state in ('PENDING', 'FAILED', 'SYNCED')), server_id text,
     photo_count integer not null, ai_outcome text not null check (ai_outcome in ('NONE', 'DONE', 'FAILED')),
     last_error text
   )`,
  `create table queued_photo (
     client_id text not null, position integer not null, file_name text not null, mime_type text not null,
     bytes blob not null, primary key (client_id, position)
   )`,
  `insert into queued_inspection values (
     '${EARLIER_CLIENT_ID}', 'p', 'Earlier Project', 's', '{"code":"SYS-01"}', 'Captured before the update', '',
     'DRAFT', '[]', 'Describe the seal.', '2030-05-01T08:00:00.000Z', 'user-inspector', 'Demo INSPECTOR',
     'PENDING', null, 0, 'NONE', null
   )`
];

let database: SqlDatabase;
let store: SqliteQueueStore;

beforeEach(async () => {
  database = await openMemoryDatabase();
  store = new SqliteQueueStore(database);
});

describe('SQLite queue store: areas', () => {
  it('AC-9.7 a record captured with an area keeps the area id and name', async () => {
    const queued = await store.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), [photo('seal.png')]);

    expect(queued.areaId).toBe(AREA_ID);
    expect(queued.areaName).toBe('Level 3');
    expect(await store.find(queued.clientId)).toEqual(queued);
    expect((await store.list())[0]).toEqual(queued);
  });

  it('AC-9.7 the area survives reopening the store on the same database', async () => {
    const queued = await store.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), []);

    const reopened = new SqliteQueueStore(database);

    expect(await reopened.find(queued.clientId)).toMatchObject({ areaId: AREA_ID, areaName: 'Level 3' });
  });

  it('AC-9.7 a record captured with no area keeps nulls', async () => {
    const queued = await store.add(draft(), []);

    expect(await store.find(queued.clientId)).toMatchObject({ areaId: null, areaName: null });
  });

  it('AC-9.7 the area is unchanged by the record\'s progress: failed, retried and synced', async () => {
    const queued = await store.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), []);

    await store.markFailed(queued.clientId, 'Area is inactive');
    await store.markPending(queued.clientId);
    await store.markSynced(queued.clientId, 'DONE');

    expect(await store.find(queued.clientId)).toMatchObject({ areaId: AREA_ID, areaName: 'Level 3', state: 'SYNCED' });
  });
});

describe('SQLite queue store: a device holding a record captured before areas existed', () => {
  beforeEach(async () => {
    await database.transaction(TABLES_BEFORE_AREAS.map((sql) => ({ sql })));
  });

  it('AC-9.7 still lists the earlier record, with no area', async () => {
    const records = await store.list();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      clientId: EARLIER_CLIENT_ID, location: 'Captured before the update', state: 'PENDING', areaId: null, areaName: null
    });
  });

  it('AC-9.7 a new record with an area is stored beside the earlier one', async () => {
    const queued = await store.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), []);

    expect(await store.list()).toHaveLength(2);
    expect(await store.find(queued.clientId)).toMatchObject({ areaId: AREA_ID, areaName: 'Level 3' });
    expect(await store.find(EARLIER_CLIENT_ID)).toMatchObject({ areaId: null });
  });
});
