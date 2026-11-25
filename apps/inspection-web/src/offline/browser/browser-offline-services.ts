import type { InspectionApi } from '../../api/api';
import { readToken } from '../../auth/session';
import { createBrowserConnectivity } from '../connectivity';
import type { OfflineServices } from '../offline-context';
import type { QueueServices } from '../queue/queue-context';
import { SqliteQueueStore } from '../queue/sqlite-queue-store';
import { createSyncEngine } from '../queue/sync-engine';
import { createHttpSnapshotSource } from '../snapshot-download';
import { SqliteSnapshotStore } from '../sqlite-snapshot-store';
import { openWorkerDatabase } from './worker-database';

/** Everything this browser provides for working without a network. */
export interface DeviceServices {
  offline: OfflineServices;
  queue: QueueServices;
}

export interface DeviceServicesOptions {
  /** Origin of the API; empty for the page's own origin. */
  baseUrl: string;
  /** The inspection service client the app uses; captured records are sent through it. */
  inspections: InspectionApi;
}

/**
 * Asks the browser not to evict this site's data when storage runs low. Records waiting to be sent exist
 * nowhere else, so this matters; but the browser may refuse, and the app works either way.
 */
async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Refusal or lack of support changes nothing the app can act on.
  }
}

/**
 * Builds the real device services: SQLite in a worker for storage, the gateway for downloads and sending,
 * and the browser's own online/offline state. The downloaded register and the queue share one database.
 *
 * @throws when the device database cannot be opened; the app then runs without device services
 */
export async function createDeviceServices(options: DeviceServicesOptions): Promise<DeviceServices> {
  const database = await openWorkerDatabase();
  void requestPersistentStorage();
  const now = () => new Date();
  const queueStore = new SqliteQueueStore(database);
  return {
    offline: {
      connectivity: createBrowserConnectivity(),
      snapshotStore: new SqliteSnapshotStore(database),
      snapshotSource: createHttpSnapshotSource({ baseUrl: options.baseUrl, getToken: readToken }),
      now
    },
    queue: {
      queueStore,
      syncEngine: createSyncEngine({ queue: queueStore, inspections: options.inspections }),
      now
    }
  };
}
