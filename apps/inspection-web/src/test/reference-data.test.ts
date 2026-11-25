import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/api-error';
import {
  createLiveReferenceData,
  createOfflineReferenceData,
  NothingDownloadedError,
  type ReferenceData
} from '../offline/reference-data';
import { createFakeApi, PROJECT_ID, type FakeApi } from './fake-api';
import { DOWNLOADED_PROJECT_ID, FIXED_NOW, InMemorySnapshotStore, snapshot } from './offline-fakes';

const UNREACHABLE = new ApiError('The server could not be reached. Check your connection and try again.', 0);

let api: FakeApi;
let store: InMemorySnapshotStore;
let reference: ReferenceData;

beforeEach(() => {
  api = createFakeApi();
  store = new InMemorySnapshotStore();
  reference = createOfflineReferenceData(api.register, store);
});

describe('Reference data: the register can be reached', () => {
  it('AC-5.1 projects come from the register, marked live, even when a download exists', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listProjects();

    expect(result.source).toEqual({ kind: 'live' });
    expect(result.items.map((project) => project.code)).toEqual(['HVA', 'MKT', 'OLD']);
  });

  it('AC-5.1 systems come from the register, marked live', async () => {
    const result = await reference.listSystems(PROJECT_ID);

    expect(api.register.listSystems).toHaveBeenCalledWith(PROJECT_ID);
    expect(result.source).toEqual({ kind: 'live' });
    expect(result.items.map((system) => system.code)).toEqual(['SYS-01', 'SYS-02', 'SYS-03']);
  });
});

describe('Reference data: the register cannot be reached', () => {
  beforeEach(() => {
    api.register.listProjects.mockRejectedValue(UNREACHABLE);
    api.register.listSystems.mockRejectedValue(UNREACHABLE);
  });

  it('AC-5.1 projects come from the device, marked with the download time', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listProjects();

    expect(result.source).toEqual({ kind: 'downloaded', downloadedAt: FIXED_NOW });
    expect(result.items.map((project) => project.code)).toEqual(['DWN', 'EMP']);
  });

  it('AC-5.1 systems come from the device, marked with the download time', async () => {
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listSystems(DOWNLOADED_PROJECT_ID);

    expect(result.source).toEqual({ kind: 'downloaded', downloadedAt: FIXED_NOW });
    expect(result.items.map((system) => system.code)).toEqual(['SYS-11', 'SYS-12']);
  });

  it('AC-5.4 with nothing downloaded, the failure says so in plain words', async () => {
    await expect(reference.listProjects()).rejects.toBeInstanceOf(NothingDownloadedError);
    await expect(reference.listSystems(DOWNLOADED_PROJECT_ID)).rejects.toThrow(
      'You are offline and the register has not been downloaded to this device yet.'
    );
  });

  it.each([502, 503, 504])('AC-5.1 a %i from the gateway also falls back to the device', async (status) => {
    api.register.listProjects.mockRejectedValue(new ApiError(`Request failed (${status})`, status));
    await store.replace(snapshot(), FIXED_NOW);

    const result = await reference.listProjects();

    expect(result.source.kind).toBe('downloaded');
  });
});

describe('Reference data: failures that are not about reachability', () => {
  it.each([
    [401, 'Invalid or expired token'],
    [403, 'Insufficient permissions'],
    [404, 'Project not found'],
    [500, 'Internal server error']
  ])('AC-5.4 a %i is passed on unchanged, never hidden behind the downloaded copy', async (status, message) => {
    const failure = new ApiError(message, status);
    api.register.listProjects.mockRejectedValue(failure);
    api.register.listSystems.mockRejectedValue(failure);
    await store.replace(snapshot(), FIXED_NOW);

    await expect(reference.listProjects()).rejects.toBe(failure);
    await expect(reference.listSystems(PROJECT_ID)).rejects.toBe(failure);
  });
});

describe('Reference data: without a device store', () => {
  it('AC-5.4 live-only reference data reads the register and passes every failure on', async () => {
    const live = createLiveReferenceData(api.register);

    expect((await live.listProjects()).source).toEqual({ kind: 'live' });
    expect((await live.listSystems(PROJECT_ID)).items.map((system) => system.code)).toEqual(['SYS-01', 'SYS-02', 'SYS-03']);

    api.register.listProjects.mockRejectedValue(UNREACHABLE);
    await expect(live.listProjects()).rejects.toBe(UNREACHABLE);
  });
});
