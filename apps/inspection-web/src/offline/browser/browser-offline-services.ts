import { readToken } from '../../auth/session';
import { createBrowserConnectivity } from '../connectivity';
import type { OfflineServices } from '../offline-context';
import { createHttpSnapshotSource } from '../snapshot-download';
import { SqliteSnapshotStore } from '../sqlite-snapshot-store';
import { openWorkerDatabase } from './worker-database';

/**
 * Builds the real offline services for this browser: SQLite in a worker for storage, the gateway for
 * downloads, and the browser's own online/offline state.
 *
 * @param baseUrl origin of the API; empty for the page's own origin
 * @throws when the device database cannot be opened; the app then runs without offline services
 */
export async function createBrowserOfflineServices(baseUrl: string): Promise<OfflineServices> {
  const database = await openWorkerDatabase();
  return {
    connectivity: createBrowserConnectivity(),
    snapshotStore: new SqliteSnapshotStore(database),
    snapshotSource: createHttpSnapshotSource({ baseUrl, getToken: readToken }),
    now: () => new Date()
  };
}
