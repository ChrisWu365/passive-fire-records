import type { Observation, Status, SystemSnapshot } from '../../api/types';

/**
 * PENDING: waiting to be sent, or part-way through being sent.
 * FAILED: the server refused it; it stays on the device until the user retries or discards it.
 * SYNCED: the server has the record and its photos.
 */
export type QueueState = 'PENDING' | 'FAILED' | 'SYNCED';

/** What became of the AI draft request made for a synced record. NONE until the request has an answer. */
export type AiOutcome = 'NONE' | 'DONE' | 'FAILED';

/** Who captured a record on the device. Only that user's sign-in may send it. */
export interface QueuedBy {
  id: string;
  name: string;
}

/** What the user entered for a record captured on the device. */
export interface QueuedInspectionDraft {
  projectId: string;
  /** Kept so that the record can be shown on the device before the server has stored it. */
  projectName: string;
  systemId: string;
  system: SystemSnapshot;
  location: string;
  notes: string;
  status: Status;
  observations: Observation[];
  aiInstruction: string;
  /** When the user saved the record on the device (ISO 8601). Sent to the server as the capture time. */
  capturedAt: string;
  createdBy: QueuedBy;
}

/** A record held on the device, with how far sending it has got. */
export interface QueuedInspection extends QueuedInspectionDraft {
  /** Chosen by the device. The server stores at most one record per clientId, which makes resending safe. */
  clientId: string;
  state: QueueState;
  /** The server's id for the record, once the server has stored it. */
  serverId: string | null;
  /** How many photos were captured with the record. */
  photoCount: number;
  aiOutcome: AiOutcome;
  /** Why the server refused the record, when state is FAILED. */
  lastError: string | null;
}

export interface NewQueuedPhoto {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface QueuedPhoto extends NewQueuedPhoto {
  /** Order in which the photo was added, from 0. Photos are sent in this order. */
  position: number;
}
