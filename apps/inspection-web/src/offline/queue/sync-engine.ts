import type { InspectionApi } from '../../api/api';
import { ApiError } from '../../api/api-error';
import type { Inspection, InspectionInput } from '../../api/types';
import { isUnreachable } from '../reachability';
import type { QueueStore } from './queue-store';
import type { AiOutcome, QueuedInspection, QueuedPhoto } from './queued-inspection';

/**
 * completed: every record that could be sent was sent or refused; nothing is waiting on the network.
 * unreachable: the server could not be reached; what is left stays PENDING for the next run.
 * sign-in-required: the server no longer accepts the sign-in; the queue is untouched.
 * already-running: another run was in progress; this call did nothing.
 */
export type SyncOutcome = 'completed' | 'unreachable' | 'sign-in-required' | 'already-running';

export interface SyncRunResult {
  outcome: SyncOutcome;
  /** Records this run finished sending. */
  synced: number;
  /** Records the server refused during this run. */
  failed: number;
}

export interface SyncStatus {
  running: boolean;
  /** The record being sent right now, if any. Shown to the user as "Syncing". */
  syncingClientId: string | null;
  /** True after the server rejected the sign-in, until a later run gets past that. */
  signInRequired: boolean;
}

export interface SyncEngineDependencies {
  queue: QueueStore;
  inspections: InspectionApi;
}

/**
 * Sends the device's PENDING records to the server, oldest first, one at a time.
 *
 * For each record: create it on the server (safe to repeat, thanks to its clientId), upload the photos
 * the server does not have yet, one per request and in order, then ask for the AI draft. Every run starts
 * each record from the create step, and the server's answer says how far an earlier run got, so a run
 * interrupted at any point can simply be run again: nothing is created or uploaded twice.
 */
export interface SyncEngine {
  /**
   * Sends what it can. Only records captured by this user are sent; others wait for their own sign-in.
   * Anything the server does or fails to do is reported in the result and recorded on the records.
   *
   * @throws only when the device queue itself cannot be read or written
   */
  run(user: { id: string }): Promise<SyncRunResult>;

  status(): SyncStatus;

  /**
   * Calls the listener whenever the status or any record's progress changes.
   * @returns a function that stops the notifications
   */
  subscribe(listener: () => void): () => void;
}

/** What became of one record in one run. */
type RecordOutcome = 'synced' | 'failed' | 'unreachable' | 'sign-in-required';

const SIGN_IN_REJECTED = 401;
/** The inspection service answers 502 when the AI provider failed; so does a gateway whose service is down. */
const BAD_GATEWAY = 502;

export function createSyncEngine({ queue, inspections }: SyncEngineDependencies): SyncEngine {
  const listeners = new Set<() => void>();
  let running = false;
  let syncingClientId: string | null = null;
  let signInRequired = false;

  const notify = () => listeners.forEach((listener) => listener());

  /** The create request for a queued record. Sending it again returns the record the server already has. */
  const createOnServer = (item: QueuedInspection): Promise<Inspection> => {
    const input: InspectionInput = {
      projectId: item.projectId,
      systemId: item.systemId,
      location: item.location,
      notes: item.notes,
      status: item.status,
      observations: item.observations,
      clientId: item.clientId,
      capturedAt: item.capturedAt
    };
    return inspections.create(input);
  };

  /**
   * Makes sure the record has an AI outcome. The server's record is the source of truth: if it already
   * says DONE or FAILED, an earlier run got that far and the provider is not asked again.
   */
  const settleAiDraft = async (item: QueuedInspection, record: Inspection): Promise<AiOutcome> => {
    if (record.aiStatus !== 'NONE') return record.aiStatus;
    try {
      await inspections.requestAiDraft(record.id, item.aiInstruction);
      return 'DONE';
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== BAD_GATEWAY) throw error;
      // A 502 is ambiguous. Reading the record back settles it: only the inspection service itself marks
      // a record FAILED, so anything else means the request never got that far.
      const current = await createOnServer(item);
      if (current.aiStatus === 'NONE') throw error;
      return current.aiStatus;
    }
  };

  const sendToServer = async (item: QueuedInspection): Promise<void> => {
    let record = await createOnServer(item);
    if (item.serverId !== record.id) {
      await queue.recordServerId(item.clientId, record.id);
      notify();
    }
    // Photos go one per request and in order, so the number the server holds says exactly which are left.
    const remaining = (await queue.photos(item.clientId)).slice(record.photos.length);
    for (const photo of remaining) {
      record = await inspections.uploadPhotos(record.id, [toFile(photo)]);
    }
    await queue.markSynced(item.clientId, await settleAiDraft(item, record));
  };

  /** Sends one record and sorts whatever happens into an outcome. Device-store errors are not caught. */
  const sendOne = async (item: QueuedInspection): Promise<RecordOutcome> => {
    try {
      await sendToServer(item);
      return 'synced';
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (isUnreachable(error)) return 'unreachable';
      if (error.status === SIGN_IN_REJECTED) return 'sign-in-required';
      await queue.markFailed(item.clientId, error.message);
      return 'failed';
    }
  };

  const run = async (user: { id: string }): Promise<SyncRunResult> => {
    if (running) return { outcome: 'already-running', synced: 0, failed: 0 };
    // Set before the first await, so that a second call made in the same moment sees it.
    running = true;
    notify();
    const result: SyncRunResult = { outcome: 'completed', synced: 0, failed: 0 };
    try {
      const mine = (await queue.list()).filter((item) => item.state === 'PENDING' && item.createdBy.id === user.id);
      for (const item of mine) {
        syncingClientId = item.clientId;
        notify();
        const outcome = await sendOne(item);
        if (outcome === 'synced') result.synced += 1;
        if (outcome === 'failed') result.failed += 1;
        if (outcome === 'unreachable' || outcome === 'sign-in-required') {
          result.outcome = outcome;
          break;
        }
      }
      // An unreachable server says nothing about the sign-in; any other outcome does.
      if (result.outcome !== 'unreachable') signInRequired = result.outcome === 'sign-in-required';
      return result;
    } finally {
      running = false;
      syncingClientId = null;
      notify();
    }
  };

  return {
    run,
    status: () => ({ running, syncingClientId, signInRequired }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function toFile(photo: QueuedPhoto): File {
  // Copied into a fresh array, which is always backed by a plain ArrayBuffer as File requires.
  return new File([new Uint8Array(photo.bytes)], photo.fileName, { type: photo.mimeType });
}
