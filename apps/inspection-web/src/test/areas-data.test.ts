import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api/api';
import { ApiError } from '../api/api-error';
import { createHttpApi } from '../api/http-api';
import type { InspectionInput } from '../api/types';
import { createSyncEngine, type SyncEngine } from '../offline/queue/sync-engine';
import {
  createLiveReferenceData,
  createOfflineReferenceData,
  NothingDownloadedError,
  type ReferenceData
} from '../offline/reference-data';
import { AREA_ID, createFakeApi, PROJECT_ID, SYSTEM_ID, type FakeApi } from './fake-api';
import { DOWNLOADED_PROJECT_ID, FIXED_NOW, InMemorySnapshotStore, snapshot } from './offline-fakes';
import { draft, FakeInspectionServer, InMemoryQueueStore, INSPECTOR } from './queue-fakes';

const UNREACHABLE = new ApiError('The server could not be reached. Check your connection and try again.', 0);
const TOKEN = 'header.payload.signature';

describe('HTTP API: areas', () => {
  interface SentRequest {
    url: string;
    method: string;
    headers: Headers;
    body: BodyInit | null | undefined;
  }

  let sent: SentRequest[];
  let api: Api;

  beforeEach(() => {
    sent = [];
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body });
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    api = createHttpApi({ baseUrl: '', getToken: () => TOKEN, fetch: fakeFetch as typeof fetch });
  });

  it('AC-9.1 listAreas reads the project\'s areas from the register, with the sign-in token', async () => {
    await api.register.listAreas(PROJECT_ID);

    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('GET');
    expect(sent[0].url).toBe(`/api/register/projects/${PROJECT_ID}/areas`);
    expect(sent[0].headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('AC-9.1 createArea posts the area to the project', async () => {
    await api.register.createArea(PROJECT_ID, { name: 'Level 3' });

    expect(sent[0].method).toBe('POST');
    expect(sent[0].url).toBe(`/api/register/projects/${PROJECT_ID}/areas`);
    expect(JSON.parse(String(sent[0].body))).toEqual({ name: 'Level 3' });
  });

  it('AC-9.1 updateArea puts the change to the area under its project', async () => {
    await api.register.updateArea(PROJECT_ID, AREA_ID, { name: 'Level 3 east', active: false });

    expect(sent[0].method).toBe('PUT');
    expect(sent[0].url).toBe(`/api/register/projects/${PROJECT_ID}/areas/${AREA_ID}`);
    expect(JSON.parse(String(sent[0].body))).toEqual({ name: 'Level 3 east', active: false });
  });

  it('AC-9.3 a record\'s area id is sent with the record', async () => {
    const input: InspectionInput = {
      projectId: PROJECT_ID, systemId: SYSTEM_ID, areaId: AREA_ID, location: 'Riser 2', notes: '', status: 'DRAFT',
      observations: []
    };

    await api.inspections.create(input);

    expect(JSON.parse(String(sent[0].body))).toMatchObject({ areaId: AREA_ID, location: 'Riser 2' });
  });
});

describe('Reference data: areas', () => {
  let api: FakeApi;
  let store: InMemorySnapshotStore;
  let reference: ReferenceData;

  beforeEach(() => {
    api = createFakeApi();
    store = new InMemorySnapshotStore();
    reference = createOfflineReferenceData(api.register, store);
  });

  it('AC-9.6 areas come from the register, marked live, even when a download exists', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listAreas(PROJECT_ID);

    expect(api.register.listAreas).toHaveBeenCalledWith(PROJECT_ID);
    expect(result.source).toEqual({ kind: 'live' });
    expect(result.items.map((area) => area.name)).toEqual(['Basement car park', 'Level 3', 'Old site office']);
  });

  it('AC-9.6 without a device copy to fall back on, areas are read from the register only', async () => {
    const result = await createLiveReferenceData(api.register).listAreas(PROJECT_ID);

    expect(result.source).toEqual({ kind: 'live' });
    expect(result.items).toHaveLength(3);
  });

  it('AC-9.7 when the register cannot be reached, areas come from the device, marked as downloaded', async () => {
    api.register.listAreas.mockRejectedValue(UNREACHABLE);
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listAreas(DOWNLOADED_PROJECT_ID);

    expect(result.source).toEqual({ kind: 'downloaded', downloadedAt: FIXED_NOW });
    expect(result.items.map((area) => area.name)).toEqual(['Basement plant room', 'Podium level']);
  });

  it('AC-9.7 a gateway answer that means the register is down also falls back to the device', async () => {
    api.register.listAreas.mockRejectedValue(new ApiError('Bad gateway', 502));
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listAreas(DOWNLOADED_PROJECT_ID);

    expect(result.source.kind).toBe('downloaded');
  });

  it('AC-9.7 when the register cannot be reached and nothing was downloaded, it says so', async () => {
    api.register.listAreas.mockRejectedValue(UNREACHABLE);

    await expect(reference.listAreas(PROJECT_ID)).rejects.toBeInstanceOf(NothingDownloadedError);
  });

  it('AC-9.7 a failure that is not about reachability is passed on, not hidden behind the device copy', async () => {
    const expired = new ApiError('Invalid or expired token', 401);
    api.register.listAreas.mockRejectedValue(expired);
    await store.replace(snapshot(), FIXED_NOW);

    await expect(reference.listAreas(DOWNLOADED_PROJECT_ID)).rejects.toBe(expired);
  });
});

describe('Sync engine: records captured with an area', () => {
  let queue: InMemoryQueueStore;
  let server: FakeInspectionServer;
  let engine: SyncEngine;

  beforeEach(() => {
    queue = new InMemoryQueueStore();
    server = new FakeInspectionServer();
    server.areaNames.set(AREA_ID, 'Level 3');
    engine = createSyncEngine({ queue, inspections: server });
  });

  it('AC-9.7 a record captured offline with an area reaches the server with that area', async () => {
    await queue.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), []);

    const result = await engine.run({ id: INSPECTOR.id });

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect(server.records[0]).toMatchObject({ areaId: AREA_ID, areaName: 'Level 3', location: 'Level 2 riser' });
  });

  it('AC-9.7 a record captured with no area is sent without an area', async () => {
    const create = vi.spyOn(server, 'create');
    await queue.add(draft(), []);

    await engine.run({ id: INSPECTOR.id });

    expect(create.mock.calls[0][0]).not.toHaveProperty('areaId');
    expect(server.records[0]).toMatchObject({ areaId: null, areaName: null });
  });

  it('AC-9.7 a record whose sending was interrupted is sent again with the same area, and stored once', async () => {
    await queue.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), []);
    server.failNext('create', UNREACHABLE, 'after');

    const first = await engine.run({ id: INSPECTOR.id });
    const second = await engine.run({ id: INSPECTOR.id });

    expect(first.outcome).toBe('unreachable');
    expect(second).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect(server.records).toHaveLength(1);
    expect(server.records[0].areaId).toBe(AREA_ID);
  });

  it('AC-9.8 a record whose area the server refuses ends in FAILED with the reason and stays on the device', async () => {
    const queued = await queue.add(draft({ areaId: AREA_ID, areaName: 'Level 3' }), []);
    server.failNext('create', new ApiError('Area is inactive', 422));

    const result = await engine.run({ id: INSPECTOR.id });

    expect(result).toEqual({ outcome: 'completed', synced: 0, failed: 1 });
    expect(await queue.find(queued.clientId)).toMatchObject({
      state: 'FAILED', lastError: 'Area is inactive', areaId: AREA_ID, areaName: 'Level 3'
    });
    expect(server.records).toHaveLength(0);
  });

  it('AC-9.8 a refused record does not stop the records after it', async () => {
    await queue.add(draft({ areaId: AREA_ID, areaName: 'Level 3', capturedAt: '2030-06-01T07:00:00.000Z' }), []);
    await queue.add(draft({ location: 'Second record', capturedAt: '2030-06-01T07:05:00.000Z' }), []);
    server.failNext('create', new ApiError('Area is inactive', 422));

    const result = await engine.run({ id: INSPECTOR.id });

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 1 });
    expect(server.records.map((record) => record.location)).toEqual(['Second record']);
  });
});
