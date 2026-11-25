import type { RegisterApi } from '../api/api';
import type { FirestopSystem, Project } from '../api/types';
import { isUnreachable } from './reachability';
import type { SnapshotStore } from './snapshot-store';

/** Where a list of projects or systems came from. */
export type ReferenceSource =
  /** Read from the register just now. */
  | { kind: 'live' }
  /** The register could not be reached; this is the device's downloaded copy. */
  | { kind: 'downloaded'; downloadedAt: string };

export interface ReferenceResult<T> {
  items: T[];
  source: ReferenceSource;
}

/**
 * Projects and systems for the pickers on a record. Reads the register when it can be reached, and the
 * device's downloaded copy when it cannot.
 */
export interface ReferenceData {
  /**
   * @throws NothingDownloadedError when the register cannot be reached and nothing was downloaded
   * @throws ApiError for failures that are not about reachability (for example an expired sign-in)
   */
  listProjects(): Promise<ReferenceResult<Project>>;

  /** Same rules as listProjects, for one project's systems. */
  listSystems(projectId: string): Promise<ReferenceResult<FirestopSystem>>;
}

/** The register cannot be reached and this device holds no downloaded copy to fall back on. */
export class NothingDownloadedError extends Error {
  constructor() {
    super('You are offline and the register has not been downloaded to this device yet.');
    this.name = 'NothingDownloadedError';
  }
}

const LIVE: ReferenceSource = { kind: 'live' };

/** Reads the register only; used where there is no local copy to fall back on. */
export function createLiveReferenceData(register: RegisterApi): ReferenceData {
  return {
    listProjects: async () => ({ items: await register.listProjects(), source: LIVE }),
    listSystems: async (projectId) => ({ items: await register.listSystems(projectId), source: LIVE })
  };
}

/**
 * Reads the register first and falls back to the downloaded copy when the register cannot be reached:
 * no connection, or a gateway answer that means the service behind it is down (502, 503, 504).
 * Any other failure is passed on unchanged.
 */
export function createOfflineReferenceData(register: RegisterApi, store: SnapshotStore): ReferenceData {
  const live = createLiveReferenceData(register);

  /** Runs the live read; if the register is unreachable, answers from the device instead. */
  async function liveOrDownloaded<T>(
    readLive: () => Promise<ReferenceResult<T>>,
    readDownloaded: () => Promise<T[]>
  ): Promise<ReferenceResult<T>> {
    try {
      return await readLive();
    } catch (error) {
      if (!isUnreachable(error)) throw error;
      const info = await store.info();
      if (!info) throw new NothingDownloadedError();
      return { items: await readDownloaded(), source: { kind: 'downloaded', downloadedAt: info.downloadedAt } };
    }
  }

  return {
    listProjects: () => liveOrDownloaded(() => live.listProjects(), () => store.listProjects()),
    listSystems: (projectId) =>
      liveOrDownloaded(() => live.listSystems(projectId), () => store.listSystems(projectId))
  };
}
