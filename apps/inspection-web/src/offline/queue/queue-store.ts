import type { AiOutcome, NewQueuedPhoto, QueuedInspection, QueuedInspectionDraft, QueuedPhoto } from './queued-inspection';

/**
 * The records captured on this device that the server may not have yet. The store only keeps them and
 * their progress; deciding what to send, and when, is the sync engine's job.
 */
export interface QueueStore {
  /**
   * Stores a new record and its photos together, in state PENDING, under a new clientId.
   * Either all of it is stored or none of it.
   */
  add(draft: QueuedInspectionDraft, photos: NewQueuedPhoto[]): Promise<QueuedInspection>;

  /** Every record on the device, oldest capture first. */
  list(): Promise<QueuedInspection[]>;

  find(clientId: string): Promise<QueuedInspection | undefined>;

  /** The record's photos that are still on the device, in the order they were added. */
  photos(clientId: string): Promise<QueuedPhoto[]>;

  /** Remembers the server's id for the record, so that later steps and screens can refer to it. */
  recordServerId(clientId: string, serverId: string): Promise<void>;

  /**
   * Marks the record as on the server. Its photo files are removed from the device, since the server
   * now holds them; the record itself stays listed until the user clears it.
   */
  markSynced(clientId: string, aiOutcome: AiOutcome): Promise<void>;

  /** Marks the record as refused by the server, with the reason to show the user. */
  markFailed(clientId: string, reason: string): Promise<void>;

  /** Puts a failed record back in line to be sent, and forgets the earlier reason. */
  markPending(clientId: string): Promise<void>;

  /** Removes the record and its photos from the device for good. */
  discard(clientId: string): Promise<void>;

  /**
   * Removes every record that is already on the server.
   * @returns how many were removed
   */
  clearSynced(): Promise<number>;
}
