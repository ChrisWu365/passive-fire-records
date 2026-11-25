import { createRequester, type HttpRequestOptions } from '../api/http-request';
import type { RegisterSnapshot, SnapshotInfo } from './snapshot';
import type { SnapshotStore } from './snapshot-store';

/** Fetches the register's current snapshot. Rejects with ApiError when the request fails. */
export interface SnapshotSource {
  fetchSnapshot(): Promise<RegisterSnapshot>;
}

export type HttpSnapshotSourceOptions = HttpRequestOptions;

const SNAPSHOT_PATH = '/api/register/snapshot';
const NOT_A_SNAPSHOT = 'The register sent something that is not a snapshot. The copy on this device is unchanged.';
const SYSTEM_TEXT_FIELDS = ['id', 'code', 'substrate', 'serviceType', 'fireRating', 'materials', 'installationMethod'];

/** The real SnapshotSource: GET /api/register/snapshot through the gateway, with the sign-in token. */
export function createHttpSnapshotSource(options: HttpSnapshotSourceOptions): SnapshotSource {
  const request = createRequester(options);
  return { fetchSnapshot: () => request<RegisterSnapshot>('GET', SNAPSHOT_PATH) };
}

/**
 * Downloads the register's snapshot and replaces the device's local copy with it. If the download or the
 * storing fails, the device keeps the copy it had.
 *
 * @param now supplies the download time; tests pass a fixed clock
 * @returns details of the newly stored snapshot
 * @throws ApiError when the register cannot be reached or refuses the request
 */
export async function downloadSnapshot(
  source: SnapshotSource,
  store: SnapshotStore,
  now: () => Date
): Promise<SnapshotInfo> {
  const snapshot: unknown = await source.fetchSnapshot();
  // Checked before anything is written: what arrives over the network is not trusted to be well formed.
  if (!isSnapshot(snapshot)) throw new Error(NOT_A_SNAPSHOT);
  await store.replace(snapshot, now().toISOString());
  const info = await store.info();
  if (!info) throw new Error('The device stored the register but cannot read it back.');
  return info;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasTextFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof value[field] === 'string');
}

function isSnapshot(value: unknown): value is RegisterSnapshot {
  return isRecord(value)
    && typeof value.generatedAt === 'string'
    && Array.isArray(value.projects)
    && value.projects.every(isSnapshotProject);
}

function isSnapshotProject(value: unknown): boolean {
  return isRecord(value)
    && hasTextFields(value, ['id', 'code', 'name'])
    && (value.address === null || value.address === undefined || typeof value.address === 'string')
    && Array.isArray(value.systems)
    && value.systems.every((system) => isRecord(system) && hasTextFields(system, SYSTEM_TEXT_FIELDS));
}
