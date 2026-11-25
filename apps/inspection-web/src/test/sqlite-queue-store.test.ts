// @vitest-environment node
// (SQLite's WebAssembly build runs under Node with an in-memory database; it needs no browser.)
import { beforeEach, describe, expect, it } from 'vitest';
import type { SqlDatabase } from '../offline/sql-database';
import { SqliteQueueStore } from '../offline/queue/sqlite-queue-store';
import { openMemoryDatabase } from './node-sqlite';
import { draft, photo } from './queue-fakes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

let database: SqlDatabase;
let store: SqliteQueueStore;

beforeEach(async () => {
  database = await openMemoryDatabase();
  store = new SqliteQueueStore(database);
});

describe('SQLite queue store: capturing a record', () => {
  it('AC-6.1 an empty device lists nothing', async () => {
    expect(await store.list()).toEqual([]);
    expect(await store.find(UNKNOWN)).toBeUndefined();
    expect(await store.photos(UNKNOWN)).toEqual([]);
  });

  it('AC-6.1 a new record is stored PENDING under a new clientId, with everything the user entered', async () => {
    const queued = await store.add(draft(), [photo('seal.png')]);

    expect(queued.clientId).toMatch(UUID);
    expect(queued).toEqual({
      ...draft(),
      clientId: queued.clientId,
      state: 'PENDING',
      serverId: null,
      photoCount: 1,
      aiOutcome: 'NONE',
      lastError: null
    });
    expect(await store.find(queued.clientId)).toEqual(queued);
    expect(await store.list()).toEqual([queued]);
  });

  it('AC-6.6 the capture time is kept exactly as given', async () => {
    const queued = await store.add(draft({ capturedAt: '2030-05-31T22:45:10.000Z' }), []);

    expect((await store.find(queued.clientId))?.capturedAt).toBe('2030-05-31T22:45:10.000Z');
  });

  it('AC-6.1 photos keep their bytes, names, types and order', async () => {
    const queued = await store.add(draft(), [photo('first.png', [1, 2, 3]), photo('second.png', [250, 0, 255, 7])]);

    const stored = await store.photos(queued.clientId);

    expect(stored.map((item) => [item.position, item.fileName, item.mimeType])).toEqual([
      [0, 'first.png', 'image/png'], [1, 'second.png', 'image/png']
    ]);
    expect(Array.from(stored[0].bytes)).toEqual([1, 2, 3]);
    expect(Array.from(stored[1].bytes)).toEqual([250, 0, 255, 7]);
    expect(stored[1].bytes).toBeInstanceOf(Uint8Array);
  });

  it('AC-6.1 each record gets its own clientId, and its own photos', async () => {
    const first = await store.add(draft({ location: 'First' }), [photo('a.png')]);
    const second = await store.add(draft({ location: 'Second' }), [photo('b.png'), photo('c.png')]);

    expect(second.clientId).not.toBe(first.clientId);
    expect((await store.photos(first.clientId)).map((item) => item.fileName)).toEqual(['a.png']);
    expect((await store.photos(second.clientId)).map((item) => item.fileName)).toEqual(['b.png', 'c.png']);
  });

  it('AC-6.1 records are listed oldest capture first, whatever order they were added in', async () => {
    await store.add(draft({ location: 'Later', capturedAt: '2030-06-01T08:00:00.000Z' }), []);
    await store.add(draft({ location: 'Earlier', capturedAt: '2030-06-01T07:00:00.000Z' }), []);

    expect((await store.list()).map((item) => item.location)).toEqual(['Earlier', 'Later']);
  });

  it('AC-6.1 text is stored as data: notes that look like SQL are kept as written', async () => {
    const queued = await store.add(draft({ notes: "x'); drop table queued_inspection; --" }), []);

    expect((await store.find(queued.clientId))?.notes).toBe("x'); drop table queued_inspection; --");
  });

  it('AC-6.2 a record and its photos are stored together or not at all', async () => {
    const good = photo('good.png');
    const broken = { fileName: 'broken.png', mimeType: 'image/png', bytes: null as unknown as Uint8Array };

    await expect(store.add(draft(), [good, broken])).rejects.toThrow();

    expect(await store.list()).toEqual([]);
    expect(await database.query('select count(*) as n from queued_photo')).toEqual([{ n: 0 }]);
  });

  it('AC-6.2 a new store opened on the same database finds the records and photos still there', async () => {
    const queued = await store.add(draft(), [photo('seal.png', [5, 6])]);

    const reopened = new SqliteQueueStore(database);

    expect(await reopened.list()).toEqual([queued]);
    expect(Array.from((await reopened.photos(queued.clientId))[0].bytes)).toEqual([5, 6]);
  });
});

describe('SQLite queue store: recording progress', () => {
  it('AC-6.2 remembers the server id while the record is still PENDING', async () => {
    const queued = await store.add(draft(), [photo('seal.png')]);

    await store.recordServerId(queued.clientId, 'server-id-1');

    expect(await store.find(queued.clientId)).toMatchObject({ serverId: 'server-id-1', state: 'PENDING' });
    expect(await store.photos(queued.clientId)).toHaveLength(1);
  });

  it('AC-6.1 marking a record SYNCED keeps it listed, records the AI outcome and removes its photo files', async () => {
    const queued = await store.add(draft(), [photo('seal.png'), photo('more.png')]);
    await store.recordServerId(queued.clientId, 'server-id-1');

    await store.markSynced(queued.clientId, 'DONE');

    expect(await store.find(queued.clientId)).toMatchObject({
      state: 'SYNCED', aiOutcome: 'DONE', serverId: 'server-id-1', photoCount: 2, lastError: null
    });
    expect(await store.photos(queued.clientId)).toEqual([]);
  });

  it('AC-6.4 a record can be SYNCED with a failed AI draft', async () => {
    const queued = await store.add(draft(), []);

    await store.markSynced(queued.clientId, 'FAILED');

    expect(await store.find(queued.clientId)).toMatchObject({ state: 'SYNCED', aiOutcome: 'FAILED' });
  });

  it('AC-6.3 marking a record FAILED keeps it and its photos on the device, with the reason', async () => {
    const queued = await store.add(draft(), [photo('seal.png')]);

    await store.markFailed(queued.clientId, 'Firestop system is inactive');

    expect(await store.find(queued.clientId)).toMatchObject({
      state: 'FAILED', lastError: 'Firestop system is inactive'
    });
    expect(await store.photos(queued.clientId)).toHaveLength(1);
  });

  it('AC-6.3 putting a failed record back in line clears the reason and keeps its progress', async () => {
    const queued = await store.add(draft(), [photo('seal.png')]);
    await store.recordServerId(queued.clientId, 'server-id-1');
    await store.markFailed(queued.clientId, 'Upload rejected');

    await store.markPending(queued.clientId);

    expect(await store.find(queued.clientId)).toMatchObject({
      state: 'PENDING', lastError: null, serverId: 'server-id-1'
    });
  });

  it('AC-6.3 discarding removes the record and its photos, and nothing else', async () => {
    const discarded = await store.add(draft({ location: 'Discard me' }), [photo('a.png')]);
    const kept = await store.add(draft({ location: 'Keep me' }), [photo('b.png')]);

    await store.discard(discarded.clientId);

    expect((await store.list()).map((item) => item.location)).toEqual(['Keep me']);
    expect(await store.photos(discarded.clientId)).toEqual([]);
    expect(await store.photos(kept.clientId)).toHaveLength(1);
    expect(await database.query('select count(*) as n from queued_photo')).toEqual([{ n: 1 }]);
  });

  it('AC-6.1 clearing synced records removes only those, and says how many', async () => {
    const synced = await store.add(draft({ location: 'Synced' }), []);
    await store.add(draft({ location: 'Pending' }), []);
    const failed = await store.add(draft({ location: 'Failed' }), []);
    await store.markSynced(synced.clientId, 'DONE');
    await store.markFailed(failed.clientId, 'Refused');

    expect(await store.clearSynced()).toBe(1);

    expect((await store.list()).map((item) => item.location).sort()).toEqual(['Failed', 'Pending']);
    expect(await store.clearSynced()).toBe(0);
  });

  it('AC-6.3 changing a record that is not on the device is an error, not a silent no-op', async () => {
    await expect(store.markFailed(UNKNOWN, 'x')).rejects.toThrow();
    await expect(store.markSynced(UNKNOWN, 'DONE')).rejects.toThrow();
    await expect(store.markPending(UNKNOWN)).rejects.toThrow();
    await expect(store.recordServerId(UNKNOWN, 'server-id-1')).rejects.toThrow();
  });
});
