/** A system as it appears in the register's snapshot. Snapshots hold active systems only. */
export interface SnapshotSystem {
  id: string;
  code: string;
  substrate: string;
  serviceType: string;
  fireRating: string;
  materials: string;
  installationMethod: string;
}

/** An area as it appears in the register's snapshot. Snapshots hold active areas only. */
export interface SnapshotArea {
  id: string;
  name: string;
}

/** A project as it appears in the register's snapshot. Snapshots hold active projects only. */
export interface SnapshotProject {
  id: string;
  code: string;
  name: string;
  address: string | null;
  systems: SnapshotSystem[];
  areas: SnapshotArea[];
}

/** What the register returns from GET /api/register/snapshot. */
export interface RegisterSnapshot {
  /** When the register produced the snapshot (ISO 8601). */
  generatedAt: string;
  projects: SnapshotProject[];
}

/** What the device knows about its local copy of the register. */
export interface SnapshotInfo {
  /** When the register produced the snapshot that is stored (ISO 8601). */
  generatedAt: string;
  /** When this device stored it (ISO 8601). */
  downloadedAt: string;
  projectCount: number;
  systemCount: number;
}
