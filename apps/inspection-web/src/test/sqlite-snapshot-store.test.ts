// @vitest-environment node
// (SQLite's WebAssembly build runs under Node with an in-memory database; it needs no browser.)
import { beforeEach, describe, expect, it } from 'vitest';
import type { SqlDatabase } from '../offline/sql-database';
import { SqliteSnapshotStore } from '../offline/sqlite-snapshot-store';
import { openMemoryDatabase } from './node-sqlite';
import {
  DOWNLOADED_PROJECT_ID,
  DOWNLOADED_SYSTEM_ID,
  FIXED_NOW,
  SECOND_DOWNLOADED_PROJECT_ID,
  SECOND_DOWNLOADED_SYSTEM_ID,
  snapshot
} from './offline-fakes';

const LATER = '2030-06-02T09:00:00.000Z';

let database: SqlDatabase;
let store: SqliteSnapshotStore;

beforeEach(async () => {
  database = await openMemoryDatabase();
  store = new SqliteSnapshotStore(database);
});

describe('SQLite snapshot store: a device with nothing downloaded', () => {
  it('AC-5.1 reports no snapshot and lists nothing', async () => {
    expect(await store.info()).toBeNull();
    expect(await store.listProjects()).toEqual([]);
    expect(await store.listSystems(DOWNLOADED_PROJECT_ID)).toEqual([]);
  });
});

describe('SQLite snapshot store: after a download', () => {
  beforeEach(async () => {
    await store.replace(snapshot(), FIXED_NOW);
  });

  it('AC-5.1 lists the downloaded projects, ordered by code, all active', async () => {
    expect(await store.listProjects()).toEqual([
      { id: DOWNLOADED_PROJECT_ID, code: 'DWN', name: 'Downloaded Tower', address: '5 Device Lane', active: true },
      { id: SECOND_DOWNLOADED_PROJECT_ID, code: 'EMP', name: 'Empty Annex', address: null, active: true }
    ]);
  });

  it('AC-5.1 lists a project\'s downloaded systems with every detail, ordered by code', async () => {
    expect(await store.listSystems(DOWNLOADED_PROJECT_ID)).toEqual([
      {
        id: DOWNLOADED_SYSTEM_ID,
        projectId: DOWNLOADED_PROJECT_ID,
        code: 'SYS-11',
        substrate: 'Concrete wall',
        serviceType: 'Cable tray',
        fireRating: '-/90/90',
        materials: 'Demo pillow K',
        installationMethod: 'Pack the tray opening with pillows.',
        active: true
      },
      {
        id: SECOND_DOWNLOADED_SYSTEM_ID,
        projectId: DOWNLOADED_PROJECT_ID,
        code: 'SYS-12',
        substrate: 'Concrete floor',
        serviceType: 'Copper pipe',
        fireRating: '-/60/60',
        materials: 'Demo sealant L',
        installationMethod: 'Seal around the pipe.',
        active: true
      }
    ]);
  });

  it('AC-5.1 a project without systems, and an unknown project, list no systems', async () => {
    expect(await store.listSystems(SECOND_DOWNLOADED_PROJECT_ID)).toEqual([]);
    expect(await store.listSystems('99999999-9999-4999-8999-999999999999')).toEqual([]);
  });

  it('AC-5.1 reports when the snapshot was generated and downloaded, and how much it holds', async () => {
    expect(await store.info()).toEqual({
      generatedAt: '2030-06-01T07:14:58.000Z',
      downloadedAt: FIXED_NOW,
      projectCount: 2,
      systemCount: 2
    });
  });

  it('AC-5.2 a new store opened on the same database finds the download still there', async () => {
    const reopened = new SqliteSnapshotStore(database);

    expect((await reopened.info())?.downloadedAt).toBe(FIXED_NOW);
    expect((await reopened.listProjects()).map((project) => project.code)).toEqual(['DWN', 'EMP']);
    expect((await reopened.listSystems(DOWNLOADED_PROJECT_ID)).map((system) => system.code)).toEqual(['SYS-11', 'SYS-12']);
  });

  it('AC-5.3 downloading again replaces the copy: removed systems and projects disappear', async () => {
    const withoutSecondSystem = snapshot({ generatedAt: '2030-06-02T08:59:00.000Z' });
    withoutSecondSystem.projects = [
      { ...withoutSecondSystem.projects[0], systems: [withoutSecondSystem.projects[0].systems[0]] }
    ];

    await store.replace(withoutSecondSystem, LATER);

    expect((await store.listProjects()).map((project) => project.code)).toEqual(['DWN']);
    expect((await store.listSystems(DOWNLOADED_PROJECT_ID)).map((system) => system.code)).toEqual(['SYS-11']);
    expect(await store.listSystems(SECOND_DOWNLOADED_PROJECT_ID)).toEqual([]);
    expect(await store.info()).toEqual({
      generatedAt: '2030-06-02T08:59:00.000Z', downloadedAt: LATER, projectCount: 1, systemCount: 1
    });
  });

  it('AC-5.3 downloading again picks up changed details and new entries', async () => {
    const changed = snapshot();
    changed.projects[0].name = 'Renamed Tower';
    changed.projects[0].systems[0].materials = 'Demo pillow M';
    changed.projects[1].systems = [{ ...changed.projects[0].systems[1], id: 'aaaaaaaa-0000-4000-8000-000000000201', code: 'SYS-21' }];

    await store.replace(changed, LATER);

    expect((await store.listProjects())[0].name).toBe('Renamed Tower');
    expect((await store.listSystems(DOWNLOADED_PROJECT_ID))[0].materials).toBe('Demo pillow M');
    expect((await store.listSystems(SECOND_DOWNLOADED_PROJECT_ID)).map((system) => system.code)).toEqual(['SYS-21']);
  });

  it('AC-5.3 downloading an empty register empties the copy but still records the download', async () => {
    await store.replace({ generatedAt: '2030-06-02T08:59:00.000Z', projects: [] }, LATER);

    expect(await store.listProjects()).toEqual([]);
    expect(await store.info()).toEqual({
      generatedAt: '2030-06-02T08:59:00.000Z', downloadedAt: LATER, projectCount: 0, systemCount: 0
    });
  });

  it('AC-5.3 a replacement that fails part-way leaves the previous copy exactly as it was', async () => {
    const broken = snapshot({ generatedAt: '2030-06-02T08:59:00.000Z' });
    // Two systems with one id cannot both be stored, so the write fails after it has started.
    broken.projects[0].systems = [broken.projects[0].systems[0], { ...broken.projects[0].systems[0], code: 'SYS-99' }];
    broken.projects[0].name = 'Should not be stored';

    await expect(store.replace(broken, LATER)).rejects.toThrow();

    expect((await store.listProjects()).map((project) => project.name)).toEqual(['Downloaded Tower', 'Empty Annex']);
    expect((await store.listSystems(DOWNLOADED_PROJECT_ID)).map((system) => system.code)).toEqual(['SYS-11', 'SYS-12']);
    expect((await store.info())?.downloadedAt).toBe(FIXED_NOW);
  });

  it('AC-5.1 text is stored as data: a name that looks like SQL is kept as written', async () => {
    const tricky = snapshot();
    tricky.projects[0].name = "Tower'); drop table project; --";

    await store.replace(tricky, LATER);

    expect((await store.listProjects())[0].name).toBe("Tower'); drop table project; --");
    expect((await store.listProjects()).length).toBe(2);
  });
});
