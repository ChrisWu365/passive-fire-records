import type { InspectionApi } from '../api/api';
import { ApiError } from '../api/api-error';
import type { AiDraftResult, Inspection, InspectionInput } from '../api/types';
import type { QueueServices } from '../offline/queue/queue-context';
import type { QueueStore } from '../offline/queue/queue-store';
import type {
  AiOutcome,
  NewQueuedPhoto,
  QueuedInspection,
  QueuedInspectionDraft,
  QueuedPhoto
} from '../offline/queue/queued-inspection';
import { createSyncEngine } from '../offline/queue/sync-engine';
import { PROJECT_ID, SYSTEM_ID } from './fake-api';

export const CAPTURED_AT = '2030-06-01T07:15:00.000Z';
export const INSPECTOR = { id: 'user-inspector', name: 'Demo INSPECTOR' } as const;
export const OTHER_USER = { id: 'user-other', name: 'Other Installer' } as const;

export const UNREACHABLE = new ApiError('The server could not be reached. Check your connection and try again.', 0);
export const SIGN_IN_EXPIRED = new ApiError('Invalid or expired token', 401);
export const SYSTEM_INACTIVE = new ApiError('Firestop system is inactive', 422);
export const AI_PROVIDER_FAILED = new ApiError('The AI provider failed. The record was kept; try again later.', 502);

/** What a user would have entered offline. Each call may override any field. */
export function draft(overrides: Partial<QueuedInspectionDraft> = {}): QueuedInspectionDraft {
  return {
    projectId: PROJECT_ID,
    projectName: 'Harbour View Apartments',
    systemId: SYSTEM_ID,
    system: {
      code: 'SYS-01',
      substrate: 'Plasterboard wall',
      serviceType: 'Plastic pipe up to 50 mm',
      fireRating: '-/60/60',
      materials: 'Demo collar A',
      installationMethod: 'Fit one collar on each side of the wall.'
    },
    areaId: null,
    areaName: null,
    location: 'Level 2 riser',
    notes: 'Sealed on site.',
    status: 'DRAFT',
    observations: [{ description: 'Label missing', severity: 'MEDIUM', remedialAction: 'Fit a label' }],
    aiInstruction: 'Describe the seal.',
    capturedAt: CAPTURED_AT,
    createdBy: { ...INSPECTOR },
    ...overrides
  };
}

export function photo(fileName: string, bytes: number[] = [1, 2, 3]): NewQueuedPhoto {
  return { fileName, mimeType: 'image/png', bytes: new Uint8Array(bytes) };
}

/** Test double for the device queue: follows the QueueStore contract, in memory. */
export class InMemoryQueueStore implements QueueStore {
  private readonly records = new Map<string, QueuedInspection>();
  private readonly photosByRecord = new Map<string, QueuedPhoto[]>();
  private nextNumber = 1;

  async add(input: QueuedInspectionDraft, photos: NewQueuedPhoto[]): Promise<QueuedInspection> {
    const clientId = `c1c1c1c1-0000-4000-8000-${String(this.nextNumber++).padStart(12, '0')}`;
    const queued: QueuedInspection = {
      ...structuredClone(input),
      clientId,
      state: 'PENDING',
      serverId: null,
      photoCount: photos.length,
      aiOutcome: 'NONE',
      lastError: null
    };
    this.records.set(clientId, queued);
    this.photosByRecord.set(clientId, photos.map((item, position) => ({ ...item, bytes: item.bytes.slice(), position })));
    return structuredClone(queued);
  }

  async list(): Promise<QueuedInspection[]> {
    return [...this.records.values()]
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt) || left.clientId.localeCompare(right.clientId))
      .map((item) => structuredClone(item));
  }

  async find(clientId: string): Promise<QueuedInspection | undefined> {
    const found = this.records.get(clientId);
    return found ? structuredClone(found) : undefined;
  }

  async photos(clientId: string): Promise<QueuedPhoto[]> {
    return (this.photosByRecord.get(clientId) ?? []).map((item) => ({ ...item, bytes: item.bytes.slice() }));
  }

  async recordServerId(clientId: string, serverId: string): Promise<void> {
    this.change(clientId, { serverId });
  }

  async markSynced(clientId: string, aiOutcome: AiOutcome): Promise<void> {
    this.change(clientId, { state: 'SYNCED', aiOutcome, lastError: null });
    this.photosByRecord.set(clientId, []);
  }

  async markFailed(clientId: string, reason: string): Promise<void> {
    this.change(clientId, { state: 'FAILED', lastError: reason });
  }

  async markPending(clientId: string): Promise<void> {
    this.change(clientId, { state: 'PENDING', lastError: null });
  }

  async discard(clientId: string): Promise<void> {
    this.records.delete(clientId);
    this.photosByRecord.delete(clientId);
  }

  async clearSynced(): Promise<number> {
    const synced = [...this.records.values()].filter((item) => item.state === 'SYNCED');
    synced.forEach((item) => {
      this.records.delete(item.clientId);
      this.photosByRecord.delete(item.clientId);
    });
    return synced.length;
  }

  private change(clientId: string, patch: Partial<QueuedInspection>): void {
    const existing = this.records.get(clientId);
    if (!existing) throw new Error(`The device queue has no record ${clientId}`);
    this.records.set(clientId, { ...existing, ...patch });
  }
}

type ServerMethod = 'create' | 'uploadPhotos' | 'requestAiDraft';

interface PlannedFailure {
  method: ServerMethod;
  error: Error;
  /**
   * 'before': the request never reached the server, so nothing changed there.
   * 'after': the server did the work, but its answer was lost on the way back.
   */
  when: 'before' | 'after';
}

/**
 * Test double for the inspection service as the sync engine sees it. It behaves like the real one where
 * that matters for syncing: create is idempotent per clientId, photos are appended in order, and an AI
 * request records DONE or FAILED on the record. Tests plan failures for particular calls, and can hold
 * calls back to look at the state in between.
 */
export class FakeInspectionServer implements InspectionApi {
  readonly records: Inspection[] = [];
  readonly calls: string[] = [];
  /** The names the server copies onto a record for the area ids it knows; any other area is refused. */
  readonly areaNames = new Map<string, string>();
  /** While true, the AI provider fails: the record is marked FAILED and the request answers 502. */
  aiProviderDown = false;
  private readonly planned: PlannedFailure[] = [];
  private gate: Promise<void> | null = null;
  private openGate: (() => void) | null = null;
  private nextNumber = 1;

  /** Makes the next call to this method fail once, either before or after the server did the work. */
  failNext(method: ServerMethod, error: Error, when: 'before' | 'after' = 'before'): void {
    this.planned.push({ method, error, when });
  }

  /** Makes every later call wait until release() is called. */
  hold(): void {
    this.gate = new Promise((resolve) => { this.openGate = resolve; });
  }

  release(): void {
    this.openGate?.();
    this.gate = null;
    this.openGate = null;
  }

  async list(): Promise<Inspection[]> {
    return this.records.map((record) => structuredClone(record));
  }

  async create(input: InspectionInput): Promise<Inspection> {
    return this.call('create', `create ${input.clientId ?? 'no-client-id'}`, () => {
      const existing = this.records.find((record) => record.clientId !== null && record.clientId === input.clientId);
      if (existing) return existing;
      if (input.areaId !== undefined && !this.areaNames.has(input.areaId)) {
        throw new ApiError('Area not found in this project', 422);
      }
      const now = new Date().toISOString();
      const created: Inspection = {
        id: `5e5e5e5e-0000-4000-8000-${String(this.nextNumber++).padStart(12, '0')}`,
        clientId: input.clientId ?? null,
        projectId: input.projectId,
        projectName: 'Harbour View Apartments',
        systemId: input.systemId,
        system: draft().system,
        areaId: input.areaId ?? null,
        areaName: input.areaId === undefined ? null : this.areaNames.get(input.areaId) ?? null,
        location: input.location,
        notes: input.notes,
        status: input.status,
        inspectorId: INSPECTOR.id,
        inspectorName: INSPECTOR.name,
        observations: input.observations,
        photos: [],
        aiInstruction: null,
        aiSummary: null,
        aiStatus: 'NONE',
        capturedAt: input.capturedAt ?? now,
        createdAt: now,
        updatedAt: now
      };
      this.records.push(created);
      return created;
    });
  }

  async update(id: string, input: InspectionInput): Promise<Inspection> {
    const record = this.require(id);
    Object.assign(record, input);
    return structuredClone(record);
  }

  async uploadPhotos(id: string, files: File[]): Promise<Inspection> {
    return this.call('uploadPhotos', `uploadPhotos ${files.map((file) => file.name).join(',')}`, () => {
      const record = this.require(id);
      record.photos = [...record.photos, ...files.map((file) => `/uploads/${file.name}`)];
      return record;
    });
  }

  async deletePhoto(id: string, position: number): Promise<Inspection> {
    const record = this.require(id);
    record.photos = record.photos.filter((_, index) => index !== position);
    return structuredClone(record);
  }

  async requestAiDraft(id: string, instruction: string): Promise<AiDraftResult> {
    const inspection = await this.call('requestAiDraft', `requestAiDraft ${instruction}`, () => {
      const record = this.require(id);
      record.aiInstruction = instruction;
      if (this.aiProviderDown) {
        record.aiStatus = 'FAILED';
        record.aiSummary = null;
        throw AI_PROVIDER_FAILED;
      }
      record.aiStatus = 'DONE';
      record.aiSummary = `Draft for ${record.location}`;
      return record;
    });
    return { summary: inspection.aiSummary ?? '', source: 'mock', requiresReview: true, inspection };
  }

  /** Runs one call: waits at the gate, applies any planned failure, and returns a copy of the record. */
  private async call(method: ServerMethod, description: string, work: () => Inspection): Promise<Inspection> {
    this.calls.push(description);
    if (this.gate) await this.gate;
    const index = this.planned.findIndex((failure) => failure.method === method);
    const failure = index === -1 ? undefined : this.planned.splice(index, 1)[0];
    if (failure?.when === 'before') throw failure.error;
    const result = structuredClone(work());
    if (failure?.when === 'after') throw failure.error;
    return result;
  }

  private require(id: string): Inspection {
    const record = this.records.find((item) => item.id === id);
    if (!record) throw new ApiError('Inspection not found', 404);
    return record;
  }
}

export interface FakeQueueServices extends QueueServices {
  queueStore: InMemoryQueueStore;
  /** The fake inspection service the real sync engine sends to. */
  server: FakeInspectionServer;
}

/** A device queue for component tests: an in-memory store, and the real sync engine over a fake server. */
export function createFakeQueueServices(server: FakeInspectionServer = new FakeInspectionServer()): FakeQueueServices {
  const queueStore = new InMemoryQueueStore();
  return {
    queueStore,
    server,
    syncEngine: createSyncEngine({ queue: queueStore, inspections: server }),
    now: () => new Date(CAPTURED_AT)
  };
}
