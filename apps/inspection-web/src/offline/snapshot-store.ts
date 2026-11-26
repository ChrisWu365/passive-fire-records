import type { Area, FirestopSystem, Project } from '../api/types';
import type { RegisterSnapshot, SnapshotInfo } from './snapshot';

/**
 * The device's own copy of the register, kept so that projects and systems can be chosen with no network.
 * It holds exactly one snapshot: the last one downloaded.
 */
export interface SnapshotStore {
  /**
   * Replaces the whole local copy with this snapshot, in one transaction: afterwards the device holds
   * exactly what the snapshot holds, and if anything fails it still holds what it held before.
   *
   * @param downloadedAt when the device received the snapshot (ISO 8601)
   */
  replace(snapshot: RegisterSnapshot, downloadedAt: string): Promise<void>;

  /** Details of the stored snapshot, or null when nothing has been downloaded to this device. */
  info(): Promise<SnapshotInfo | null>;

  /** The stored projects, ordered by code. All are active: a snapshot holds active projects only. */
  listProjects(): Promise<Project[]>;

  /** The stored systems of one project, ordered by code; empty when the project is not stored. */
  listSystems(projectId: string): Promise<FirestopSystem[]>;

  /** The stored areas of one project, ordered by name; empty when the project is not stored. */
  listAreas(projectId: string): Promise<Area[]>;
}
