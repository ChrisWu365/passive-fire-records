import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { createSyncEngine, type SyncEngine } from '../offline/queue/sync-engine';
import {
  CAPTURED_AT,
  draft,
  FakeInspectionServer,
  InMemoryQueueStore,
  INSPECTOR,
  OTHER_USER,
  photo,
  SIGN_IN_EXPIRED,
  SYSTEM_INACTIVE,
  UNREACHABLE
} from './queue-fakes';

let queue: InMemoryQueueStore;
let server: FakeInspectionServer;
let engine: SyncEngine;

beforeEach(() => {
  queue = new InMemoryQueueStore();
  server = new FakeInspectionServer();
  engine = createSyncEngine({ queue, inspections: server });
});

function run() {
  return engine.run({ id: INSPECTOR.id });
}

async function onlyQueued() {
  const all = await queue.list();
  expect(all).toHaveLength(1);
  return all[0];
}

describe('Sync engine: a record captured offline, with the network back', () => {
  it('AC-6.1 creates the record, uploads its photo and requests the AI draft, with no further input', async () => {
    const queued = await queue.add(draft(), [photo('seal.png')]);

    const result = await run();

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect(server.records).toHaveLength(1);
    expect(server.records[0]).toMatchObject({
      clientId: queued.clientId,
      location: 'Level 2 riser',
      notes: 'Sealed on site.',
      photos: ['/uploads/seal.png'],
      aiStatus: 'DONE',
      aiInstruction: 'Describe the seal.'
    });
  });

  it('AC-6.1 sends exactly what the user entered, under the device\'s clientId', async () => {
    const queued = await queue.add(draft(), []);
    let sent: unknown;
    const originalCreate = server.create.bind(server);
    server.create = async (input) => {
      sent = input;
      return originalCreate(input);
    };

    await run();

    expect(sent).toEqual({
      projectId: queued.projectId,
      systemId: queued.systemId,
      location: 'Level 2 riser',
      notes: 'Sealed on site.',
      status: 'DRAFT',
      observations: [{ description: 'Label missing', severity: 'MEDIUM', remedialAction: 'Fit a label' }],
      clientId: queued.clientId,
      capturedAt: CAPTURED_AT
    });
  });

  it('AC-6.1 uploads each photo as a file with its name, type and bytes', async () => {
    await queue.add(draft(), [photo('seal.png', [9, 8, 7])]);
    const uploaded: File[] = [];
    const originalUpload = server.uploadPhotos.bind(server);
    server.uploadPhotos = async (id, files) => {
      uploaded.push(...files);
      return originalUpload(id, files);
    };

    await run();

    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].name).toBe('seal.png');
    expect(uploaded[0].type).toBe('image/png');
    expect(new Uint8Array(await uploaded[0].arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('AC-6.1 afterwards the device record is SYNCED, knows the server id, and its photo files are gone', async () => {
    await queue.add(draft(), [photo('seal.png')]);

    await run();

    const queued = await onlyQueued();
    expect(queued.state).toBe('SYNCED');
    expect(queued.serverId).toBe(server.records[0].id);
    expect(queued.aiOutcome).toBe('DONE');
    expect(queued.lastError).toBeNull();
    expect(await queue.photos(queued.clientId)).toEqual([]);
  });

  it('AC-6.1 several photos are uploaded one per request, in the order they were added', async () => {
    await queue.add(draft(), [photo('first.png'), photo('second.png'), photo('third.png')]);

    await run();

    expect(server.calls.filter((call) => call.startsWith('uploadPhotos'))).toEqual([
      'uploadPhotos first.png', 'uploadPhotos second.png', 'uploadPhotos third.png'
    ]);
    expect(server.records[0].photos).toEqual(['/uploads/first.png', '/uploads/second.png', '/uploads/third.png']);
  });

  it('AC-6.1 a record without photos is created and still gets its AI draft', async () => {
    await queue.add(draft(), []);

    await run();

    expect(server.calls.some((call) => call.startsWith('uploadPhotos'))).toBe(false);
    expect(server.records[0].aiStatus).toBe('DONE');
    expect((await onlyQueued()).state).toBe('SYNCED');
  });

  it('AC-6.1 several records are sent oldest capture first', async () => {
    await queue.add(draft({ location: 'Captured second', capturedAt: '2030-06-01T08:00:00.000Z' }), []);
    await queue.add(draft({ location: 'Captured first', capturedAt: '2030-06-01T07:00:00.000Z' }), []);

    const result = await run();

    expect(result.synced).toBe(2);
    expect(server.records.map((record) => record.location)).toEqual(['Captured first', 'Captured second']);
  });

  it('AC-6.6 the device capture time is what the server stores as the capture time', async () => {
    await queue.add(draft({ capturedAt: '2030-05-31T22:45:10.000Z' }), []);

    await run();

    expect(server.records[0].capturedAt).toBe('2030-05-31T22:45:10.000Z');
    expect(server.records[0].createdAt).not.toBe('2030-05-31T22:45:10.000Z');
  });

  it('AC-6.1 with nothing to send, a run completes and calls nothing', async () => {
    expect(await run()).toEqual({ outcome: 'completed', synced: 0, failed: 0 });
    expect(server.calls).toEqual([]);
  });
});

describe('Sync engine: the network is cut part-way and comes back', () => {
  it('AC-6.2 when the server cannot be reached at all, the record stays PENDING and nothing is lost', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('create', UNREACHABLE);

    const result = await run();

    expect(result).toEqual({ outcome: 'unreachable', synced: 0, failed: 0 });
    const queued = await onlyQueued();
    expect(queued.state).toBe('PENDING');
    expect(await queue.photos(queued.clientId)).toHaveLength(1);
    expect(server.records).toEqual([]);
  });

  it('AC-6.2 cut before a photo upload: the next run finishes with one record and the photo once', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('uploadPhotos', UNREACHABLE);

    expect((await run()).outcome).toBe('unreachable');
    expect((await run()).outcome).toBe('completed');

    expect(server.records).toHaveLength(1);
    expect(server.records[0].photos).toEqual(['/uploads/seal.png']);
    expect((await onlyQueued()).state).toBe('SYNCED');
  });

  it('AC-6.2 the create answer is lost: the next run does not make a second record', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('create', UNREACHABLE, 'after');

    expect((await run()).outcome).toBe('unreachable');
    expect(server.records).toHaveLength(1);
    expect((await run()).outcome).toBe('completed');

    expect(server.records).toHaveLength(1);
    expect(server.records[0].photos).toEqual(['/uploads/seal.png']);
  });

  it('AC-6.2 a photo reached the server but its answer was lost: the next run does not upload it again', async () => {
    await queue.add(draft(), [photo('first.png'), photo('second.png'), photo('third.png')]);
    server.failNext('uploadPhotos', UNREACHABLE);
    await run();
    server.calls.length = 0;
    // Second attempt: first.png gets there, but the connection drops before the answer returns.
    server.failNext('uploadPhotos', UNREACHABLE, 'after');
    expect((await run()).outcome).toBe('unreachable');

    expect((await run()).outcome).toBe('completed');

    expect(server.records).toHaveLength(1);
    expect(server.records[0].photos).toEqual(['/uploads/first.png', '/uploads/second.png', '/uploads/third.png']);
    expect(server.calls.filter((call) => call === 'uploadPhotos first.png')).toHaveLength(1);
  });

  it('AC-6.2 cut between the second and third photo: only the third is sent on the next run', async () => {
    await queue.add(draft(), [photo('first.png'), photo('second.png'), photo('third.png')]);
    const originalUpload = server.uploadPhotos.bind(server);
    let uploads = 0;
    server.uploadPhotos = async (id, files) => {
      uploads += 1;
      if (uploads === 3) throw UNREACHABLE;
      return originalUpload(id, files);
    };

    expect((await run()).outcome).toBe('unreachable');
    server.calls.length = 0;
    expect((await run()).outcome).toBe('completed');

    expect(server.calls.filter((call) => call.startsWith('uploadPhotos'))).toEqual(['uploadPhotos third.png']);
    expect(server.records[0].photos).toEqual(['/uploads/first.png', '/uploads/second.png', '/uploads/third.png']);
  });

  it('AC-6.2 the AI answer is lost: the next run sees the draft is there and does not ask again', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('requestAiDraft', UNREACHABLE, 'after');

    expect((await run()).outcome).toBe('unreachable');
    expect((await onlyQueued()).state).toBe('PENDING');
    server.calls.length = 0;
    expect((await run()).outcome).toBe('completed');

    expect(server.calls.some((call) => call.startsWith('requestAiDraft'))).toBe(false);
    expect(server.calls.some((call) => call.startsWith('uploadPhotos'))).toBe(false);
    expect((await onlyQueued()).aiOutcome).toBe('DONE');
  });

  it('AC-6.2 once the server is unreachable, the run stops and leaves later records untouched', async () => {
    await queue.add(draft({ location: 'First', capturedAt: '2030-06-01T07:00:00.000Z' }), []);
    await queue.add(draft({ location: 'Second', capturedAt: '2030-06-01T08:00:00.000Z' }), []);
    server.failNext('create', UNREACHABLE);

    const result = await run();

    expect(result.outcome).toBe('unreachable');
    expect(server.calls).toHaveLength(1);
    expect((await queue.list()).map((item) => item.state)).toEqual(['PENDING', 'PENDING']);
  });

  it.each([502, 503, 504])('AC-6.2 a %i from the gateway on create is treated as unreachable, not as a refusal', async (status) => {
    await queue.add(draft(), []);
    server.failNext('create', new ApiError(`Request failed (${status})`, status));

    const result = await run();

    expect(result.outcome).toBe('unreachable');
    expect((await onlyQueued()).state).toBe('PENDING');
  });
});

describe('Sync engine: the server refuses a record', () => {
  it('AC-6.3 a deactivated system ends in FAILED with the server\'s reason, and the record stays on the device', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('create', SYSTEM_INACTIVE);

    const result = await run();

    expect(result).toEqual({ outcome: 'completed', synced: 0, failed: 1 });
    const queued = await onlyQueued();
    expect(queued.state).toBe('FAILED');
    expect(queued.lastError).toBe('Firestop system is inactive');
    expect(await queue.photos(queued.clientId)).toHaveLength(1);
    expect(server.records).toEqual([]);
  });

  it('AC-6.3 a refused record does not hold up the records after it', async () => {
    await queue.add(draft({ location: 'Refused', capturedAt: '2030-06-01T07:00:00.000Z' }), []);
    await queue.add(draft({ location: 'Accepted', capturedAt: '2030-06-01T08:00:00.000Z' }), []);
    server.failNext('create', SYSTEM_INACTIVE);

    const result = await run();

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 1 });
    expect(server.records.map((record) => record.location)).toEqual(['Accepted']);
    expect((await queue.list()).map((item) => item.state)).toEqual(['FAILED', 'SYNCED']);
  });

  it('AC-6.3 a FAILED record is not sent again by later runs until it is put back in line', async () => {
    const queued = await queue.add(draft(), []);
    server.failNext('create', SYSTEM_INACTIVE);
    await run();
    server.calls.length = 0;

    expect(await run()).toEqual({ outcome: 'completed', synced: 0, failed: 0 });
    expect(server.calls).toEqual([]);

    await queue.markPending(queued.clientId);
    expect(await run()).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect((await onlyQueued()).state).toBe('SYNCED');
  });

  it.each([
    [400, 'location is required'],
    [403, 'Insufficient permissions'],
    [500, 'Internal server error']
  ])('AC-6.3 a %i is a refusal too: FAILED with the server\'s message', async (status, message) => {
    await queue.add(draft(), []);
    server.failNext('create', new ApiError(message, status));

    await run();

    const queued = await onlyQueued();
    expect(queued.state).toBe('FAILED');
    expect(queued.lastError).toBe(message);
  });

  it('AC-6.3 a photo the server refuses fails the record but keeps what was already sent', async () => {
    await queue.add(draft(), [photo('first.png'), photo('second.png')]);
    const originalUpload = server.uploadPhotos.bind(server);
    let uploads = 0;
    server.uploadPhotos = async (id, files) => {
      uploads += 1;
      if (uploads === 2) throw new ApiError('Upload rejected: File too large', 400);
      return originalUpload(id, files);
    };

    await run();

    const queued = await onlyQueued();
    expect(queued.state).toBe('FAILED');
    expect(queued.lastError).toBe('Upload rejected: File too large');
    expect(queued.serverId).toBe(server.records[0].id);
    expect(server.records[0].photos).toEqual(['/uploads/first.png']);
  });
});

describe('Sync engine: the AI draft', () => {
  it('AC-6.4 when the AI provider fails, the record is still SYNCED, with the AI draft marked FAILED', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.aiProviderDown = true;

    const result = await run();

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    const queued = await onlyQueued();
    expect(queued.state).toBe('SYNCED');
    expect(queued.aiOutcome).toBe('FAILED');
    expect(server.records[0].photos).toEqual(['/uploads/seal.png']);
    expect(server.records[0].aiStatus).toBe('FAILED');
  });

  it('AC-6.4 an AI failure is not retried by later runs; retrying is the user\'s choice, on the record', async () => {
    await queue.add(draft(), []);
    server.aiProviderDown = true;
    await run();
    server.aiProviderDown = false;
    server.calls.length = 0;

    await run();

    expect(server.calls).toEqual([]);
    expect(server.records[0].aiStatus).toBe('FAILED');
  });

  it('AC-6.4 when the AI request cannot reach the server, the record waits and the next run asks again', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('requestAiDraft', UNREACHABLE);

    expect((await run()).outcome).toBe('unreachable');
    expect((await onlyQueued()).state).toBe('PENDING');
    expect((await run()).outcome).toBe('completed');

    expect((await onlyQueued()).aiOutcome).toBe('DONE');
    expect(server.records[0].photos).toEqual(['/uploads/seal.png']);
  });

  it('AC-6.4 a 502 that did not come from the AI provider is not mistaken for an AI failure', async () => {
    await queue.add(draft(), []);
    // A gateway 502: the request never reached the inspection service, so the record still says NONE.
    server.failNext('requestAiDraft', new ApiError('Request failed (502)', 502));

    expect((await run()).outcome).toBe('unreachable');

    expect((await onlyQueued()).state).toBe('PENDING');
    expect(server.records[0].aiStatus).toBe('NONE');
  });
});

describe('Sync engine: the sign-in has expired', () => {
  it('AC-6.5 the run stops asking for sign-in, and every record stays as it was', async () => {
    await queue.add(draft({ location: 'First', capturedAt: '2030-06-01T07:00:00.000Z' }), [photo('seal.png')]);
    await queue.add(draft({ location: 'Second', capturedAt: '2030-06-01T08:00:00.000Z' }), []);
    server.failNext('create', SIGN_IN_EXPIRED);

    const result = await run();

    expect(result).toEqual({ outcome: 'sign-in-required', synced: 0, failed: 0 });
    expect(engine.status().signInRequired).toBe(true);
    expect((await queue.list()).map((item) => item.state)).toEqual(['PENDING', 'PENDING']);
    expect((await queue.list()).every((item) => item.lastError === null)).toBe(true);
    expect(server.calls).toHaveLength(1);
  });

  it('AC-6.5 after signing in again, the next run sends everything and clears the sign-in prompt', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.failNext('create', SIGN_IN_EXPIRED);
    await run();

    const result = await run();

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect(engine.status().signInRequired).toBe(false);
    expect(server.records[0].photos).toEqual(['/uploads/seal.png']);
  });

  it('AC-6.5 a sign-in that expires part-way through a record does not duplicate anything afterwards', async () => {
    await queue.add(draft(), [photo('first.png'), photo('second.png')]);
    const originalUpload = server.uploadPhotos.bind(server);
    let uploads = 0;
    server.uploadPhotos = async (id, files) => {
      uploads += 1;
      if (uploads === 2) throw SIGN_IN_EXPIRED;
      return originalUpload(id, files);
    };

    expect((await run()).outcome).toBe('sign-in-required');
    expect((await run()).outcome).toBe('completed');

    expect(server.records).toHaveLength(1);
    expect(server.records[0].photos).toEqual(['/uploads/first.png', '/uploads/second.png']);
  });
});

describe('Sync engine: whose records, and one run at a time', () => {
  it('AC-6.5 only the signed-in user\'s records are sent; another user\'s wait for their sign-in', async () => {
    await queue.add(draft({ location: 'Mine' }), []);
    await queue.add(draft({ location: 'Theirs', createdBy: { ...OTHER_USER } }), []);

    const result = await run();

    expect(result).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect(server.records.map((record) => record.location)).toEqual(['Mine']);
    const theirs = (await queue.list()).find((item) => item.location === 'Theirs');
    expect(theirs?.state).toBe('PENDING');

    await engine.run({ id: OTHER_USER.id });
    expect(server.records.map((record) => record.location)).toEqual(['Mine', 'Theirs']);
  });

  it('AC-6.2 a second run started while one is in progress does nothing, so nothing is sent twice', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    server.hold();

    const first = run();
    const second = await run();
    server.release();

    expect(second).toEqual({ outcome: 'already-running', synced: 0, failed: 0 });
    expect(await first).toEqual({ outcome: 'completed', synced: 1, failed: 0 });
    expect(server.records).toHaveLength(1);
    expect(server.records[0].photos).toEqual(['/uploads/seal.png']);
  });

  it('AC-6.1 while a record is being sent, the status names it; afterwards the status is idle', async () => {
    const queued = await queue.add(draft(), []);
    server.hold();

    const running = run();
    await vi.waitFor(() => {
      expect(engine.status()).toMatchObject({ running: true, syncingClientId: queued.clientId });
    });
    server.release();
    await running;

    expect(engine.status()).toEqual({ running: false, syncingClientId: null, signInRequired: false });
  });

  it('AC-6.1 subscribers are told as records progress, and not after they unsubscribe', async () => {
    await queue.add(draft(), [photo('seal.png')]);
    let notifications = 0;
    const unsubscribe = engine.subscribe(() => { notifications += 1; });

    await run();
    const duringRun = notifications;
    unsubscribe();
    await queue.add(draft({ location: 'Another' }), []);
    await run();

    expect(duringRun).toBeGreaterThanOrEqual(2);
    expect(notifications).toBe(duringRun);
  });

  it('AC-6.3 a failure reading the device queue is reported as a rejected run, never swallowed', async () => {
    const brokenQueue = new InMemoryQueueStore();
    brokenQueue.list = async () => { throw new Error('The device database is not readable'); };
    const broken = createSyncEngine({ queue: brokenQueue, inspections: server });

    await expect(broken.run({ id: INSPECTOR.id })).rejects.toThrow('The device database is not readable');
    expect(broken.status().running).toBe(false);
  });
});
