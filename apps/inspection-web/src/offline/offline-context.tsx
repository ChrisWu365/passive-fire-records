import { createContext, useContext, type ReactNode } from 'react';
import type { Connectivity } from './connectivity';
import type { SnapshotSource } from './snapshot-download';
import type { SnapshotStore } from './snapshot-store';

/** Everything the screens need to work without a network. */
export interface OfflineServices {
  connectivity: Connectivity;
  snapshotStore: SnapshotStore;
  snapshotSource: SnapshotSource;
  /** Supplies the current time; tests pass a fixed clock. */
  now: () => Date;
}

const OfflineContext = createContext<OfflineServices | null>(null);

/** Makes the offline services available to every screen below it. */
export function OfflineProvider({ services, children }: { services: OfflineServices; children: ReactNode }) {
  return <OfflineContext.Provider value={services}>{children}</OfflineContext.Provider>;
}

/**
 * The offline services, or null when the app runs without them (for example in a browser that cannot
 * store the local copy). Screens must work in both cases: without them, everything needs the network.
 */
export function useOffline(): OfflineServices | null {
  return useContext(OfflineContext);
}
