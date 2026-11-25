import { createContext, useContext, type ReactNode } from 'react';
import type { QueueStore } from './queue-store';
import type { SyncEngine } from './sync-engine';

/** What the screens need to capture records on the device and send them later. */
export interface QueueServices {
  queueStore: QueueStore;
  syncEngine: SyncEngine;
  /** Supplies the capture time; tests pass a fixed clock. */
  now: () => Date;
}

const QueueContext = createContext<QueueServices | null>(null);

/** Makes the device queue available to every screen below it. */
export function QueueProvider({ services, children }: { services: QueueServices; children: ReactNode }) {
  return <QueueContext.Provider value={services}>{children}</QueueContext.Provider>;
}

/**
 * The device queue, or null when the app runs without one. Without it a record can only be saved
 * while online.
 */
export function useQueue(): QueueServices | null {
  return useContext(QueueContext);
}
