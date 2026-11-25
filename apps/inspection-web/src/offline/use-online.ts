import { useCallback, useSyncExternalStore } from 'react';
import { useOffline } from './offline-context';

const ALWAYS_ONLINE = () => true;
const NO_SUBSCRIPTION = () => () => undefined;

/**
 * Whether the device has a connection, kept current as it changes. Without offline services the app has
 * no way of working offline, so it simply reports "online" and lets requests succeed or fail.
 */
export function useOnline(): boolean {
  const connectivity = useOffline()?.connectivity;
  const subscribe = useCallback(
    (onChange: () => void) => (connectivity ? connectivity.subscribe(() => onChange()) : NO_SUBSCRIPTION()),
    [connectivity]
  );
  return useSyncExternalStore(subscribe, connectivity ? () => connectivity.isOnline() : ALWAYS_ONLINE);
}
