// @vitest-environment node
// (SQLite's WebAssembly build runs under Node with an in-memory database; it needs no browser.)
import { beforeEach, describe, expect, it } from 'vitest';
import type { SqlDatabase } from '../offline/sql-database';
import { SqliteSnapshotStore } from '../offline/sqlite-snapshot-store';
import { openMemoryDatabase } from './node-sqlite';
import {
  DOWNLOADED_AREA_ID,
  DOWNLOADED_PROJECT_ID,
  FIXED_NOW,
  SECOND_DOWNLOADED_AREA_ID,
  SECOND_DOWNLOADED_PROJECT_ID,
  snapshot
} from './offline-fakes';

const LATER = '2030-06-02T09:00:00.000Z';
const UNKNOWN_PROJECT_ID = 'ffffffff-0000-4000-8000-000000000009';

/** The device tables exactly as the app created them before areas existed. */
const TABLES_BEFORE_AREAS: readonly string[] = [
  `create table snapshot_project (id text primary key, code text not null, name text not null, address text)`,
  `create table snapshot_system (
     id text primary key, project_id text not null, code text not null, substrate text not null,
     service_type text not null, fire_rating text not null, materials text not null,
     installation_method text not null
   )`,
  `create table snapshot_meta (
     id integer primary key check (id = 1), generated_at text not null, downloaded_at text not null
   )`,
  `insert into snapshot_project (id, code, name, address) values ('${DOWNLOADED_PROJECT_ID}', 'DWN', 'Downloaded Tower', null)`,
  `insert into snapshot_meta (id, generated_at, downloaded_at) values (1, '2030-05-01T00:00:00.000Z', '2030-05-01T00:00:01.000Z')`
];

let database: SqlDatabase;
let store: SqliteSnapshotStore;

beforeEach(async () => {
  database = await openMemoryDatabase();
  store = new SqliteSnapshotStore(database);
});

describe('SQLite snapshot store: areas', () => {
  it('AC-9.7 a device with nothing downloaded lists no areas', async () => {
    expect(await store.listAreas(DOWNLOADED_PROJECT_ID)).toEqual([]);
  });

  it('AC-9.7 lists a project\'s downloaded areas, ordered by name, all active', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    expect(await store.listAreas(DOWNLOADED_PROJECT_ID)).toEqual([
      { id: SECOND_DOWNLOADED_AREA_ID, projectId: DOWNLOADED_PROJECT_ID, name: 'Basement plant room', active: true },
      { id: DOWNLOADED_AREA_ID, projectId: DOWNLOADED_PROJECT_ID, name: 'Podium level', active: true }
    ]);
  });

  it('AC-9.7 a project without areas, and an unknown project, list no areas', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    expect(await store.listAreas(SECOND_DOWNLOADED_PROJECT_ID)).toEqual([]);
    expect(await store.listAreas(UNKNOWN_PROJECT_ID)).toEqual([]);
  });

  it('AC-9.7 a new store opened on the same database finds the areas still there', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    const reopened = new SqliteSnapshotStore(database);

    expect((await reopened.listAreas(DOWNLOADED_PROJECT_ID)).map((area) => area.name))
      .toEqual(['Basement plant room', 'Podium level']);
  });

  it('AC-9.7 downloading again replaces the areas: removed ones disappear, renamed ones change', async () => {
    await store.replace(snapshot(), FIXED_NOW);
    const next = snapshot();
    next.projects[0].areas = [{ id: DOWNLOADED_AREA_ID, name: 'Podium level east' }];

    await store.replace(next, LATER);

    expect(await store.listAreas(DOWNLOADED_PROJECT_ID)).toEqual([
      { id: DOWNLOADED_AREA_ID, projectId: DOWNLOADED_PROJECT_ID, name: 'Podium level east', active: true }
    ]);
  });

  it('AC-9.7 downloading an empty register removes every area', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    await store.replace(snapshot({ projects: [] }), LATER);

    expect(await store.listAreas(DOWNLOADED_PROJECT_ID)).toEqual([]);
  });

  it('AC-9.7 an area name that looks like SQL is kept as written', async () => {
    const hostile = snapshot();
    hostile.projects[0].areas = [{ id: DOWNLOADED_AREA_ID, name: "Level 1'); drop table snapshot_project; --" }];

    await store.replace(hostile, FIXED_NOW);

    expect((await store.listAreas(DOWNLOADED_PROJECT_ID))[0].name).toBe("Level 1'); drop table snapshot_project; --");
    expect(await store.listProjects()).toHaveLength(2);
  });
});

describe('SQLite snapshot store: a device that downloaded the register before areas existed', () => {
  beforeEach(async () => {
    await database.transaction(TABLES_BEFORE_AREAS.map((sql) => ({ sql })));
  });

  it('AC-9.7 still reads its earlier download, and lists no areas', async () => {
    expect((await store.listProjects()).map((project) => project.code)).toEqual(['DWN']);
    expect((await store.info())?.downloadedAt).toBe('2030-05-01T00:00:01.000Z');
    expect(await store.listAreas(DOWNLOADED_PROJECT_ID)).toEqual([]);
  });

  it('AC-9.7 the next download stores the areas', async () => {
    await store.replace(snapshot(), LATER);

    expect((await store.listAreas(DOWNLOADED_PROJECT_ID)).map((area) => area.name))
      .toEqual(['Basement plant room', 'Podium level']);
    expect((await store.info())?.downloadedAt).toBe(LATER);
  });
});
