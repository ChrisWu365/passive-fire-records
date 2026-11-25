import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { createHttpSnapshotSource, downloadSnapshot, type SnapshotSource } from '../offline/snapshot-download';
import { FIXED_NOW, InMemorySnapshotStore, snapshot } from './offline-fakes';

const TOKEN = 'header.payload.signature';
const now = () => new Date(FIXED_NOW);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Downloading the register snapshot', () => {
  let store: InMemorySnapshotStore;

  beforeEach(() => {
    store = new InMemorySnapshotStore();
  });

  it('AC-5.1 stores what the register sent and reports the download', async () => {
    const source: SnapshotSource = { fetchSnapshot: async () => snapshot() };

    const info = await downloadSnapshot(source, store, now);

    expect(info).toEqual({
      generatedAt: '2030-06-01T07:14:58.000Z', downloadedAt: FIXED_NOW, projectCount: 2, systemCount: 2
    });
    expect(await store.info()).toEqual(info);
    expect((await store.listProjects()).map((project) => project.code)).toEqual(['DWN', 'EMP']);
  });

  it('AC-5.3 a second download replaces the first', async () => {
    const source = { fetchSnapshot: vi.fn<SnapshotSource['fetchSnapshot']>() };
    source.fetchSnapshot.mockResolvedValueOnce(snapshot());
    source.fetchSnapshot.mockResolvedValueOnce({ generatedAt: '2030-06-02T08:59:00.000Z', projects: [] });
    await downloadSnapshot(source, store, now);

    const info = await downloadSnapshot(source, store, () => new Date('2030-06-02T09:00:00.000Z'));

    expect(info.projectCount).toBe(0);
    expect(info.downloadedAt).toBe('2030-06-02T09:00:00.000Z');
    expect(await store.listProjects()).toEqual([]);
  });

  it('AC-5.3 when the register cannot be reached, the failure is passed on and the old copy is kept', async () => {
    await store.replace(snapshot(), FIXED_NOW);
    const unreachable = new ApiError('The server could not be reached. Check your connection and try again.', 0);
    const source: SnapshotSource = { fetchSnapshot: async () => { throw unreachable; } };

    await expect(downloadSnapshot(source, store, () => new Date('2030-06-02T09:00:00.000Z'))).rejects.toBe(unreachable);

    expect((await store.info())?.downloadedAt).toBe(FIXED_NOW);
    expect((await store.listProjects()).map((project) => project.code)).toEqual(['DWN', 'EMP']);
  });

  it('AC-5.3 when the device store refuses the write, the failure is passed on and the old copy is kept', async () => {
    await store.replace(snapshot(), FIXED_NOW);
    store.failNextReplace = true;
    const source: SnapshotSource = { fetchSnapshot: async () => ({ generatedAt: 'x', projects: [] }) };

    await expect(downloadSnapshot(source, store, now)).rejects.toThrow('The device store refused the write');

    expect((await store.listProjects()).length).toBe(2);
  });

  it('AC-5.3 an answer that is not shaped like a snapshot is refused and the old copy is kept', async () => {
    await store.replace(snapshot(), FIXED_NOW);
    const source = { fetchSnapshot: async () => ({ unexpected: true }) } as unknown as SnapshotSource;

    await expect(downloadSnapshot(source, store, now)).rejects.toThrow(/snapshot/i);

    expect((await store.listProjects()).length).toBe(2);
  });
});

describe('HTTP snapshot source', () => {
  it('AC-5.1 reads /api/register/snapshot on the page\'s own origin with the sign-in token', async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const source = createHttpSnapshotSource({
      baseUrl: '',
      getToken: () => TOKEN,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') });
        return json(200, snapshot());
      }) as typeof fetch
    });

    const received = await source.fetchSnapshot();

    expect(requests).toEqual([{ url: '/api/register/snapshot', authorization: `Bearer ${TOKEN}` }]);
    expect(received).toEqual(snapshot());
  });

  it('AC-5.4 a network failure becomes an ApiError with status 0', async () => {
    const source = createHttpSnapshotSource({
      baseUrl: '',
      getToken: () => TOKEN,
      fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch
    });

    await expect(source.fetchSnapshot()).rejects.toMatchObject({ name: 'ApiError', status: 0 });
  });

  it('AC-5.4 an error answer becomes an ApiError with the server\'s message', async () => {
    const source = createHttpSnapshotSource({
      baseUrl: '',
      getToken: () => null,
      fetch: (async () => json(401, { error: 'Authentication required' })) as typeof fetch
    });

    await expect(source.fetchSnapshot()).rejects.toMatchObject({ status: 401, message: 'Authentication required' });
  });
});
