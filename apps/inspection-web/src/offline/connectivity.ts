/**
 * Whether the device currently has a network connection, as far as the browser can tell. "Online" only
 * means a network is attached; a request can still fail, and every caller must still handle that.
 */
export interface Connectivity {
  isOnline(): boolean;

  /**
   * Calls the listener whenever the device goes online or offline.
   * @returns a function that stops the notifications
   */
  subscribe(listener: (online: boolean) => void): () => void;
}

/** Connectivity as the browser reports it: navigator.onLine and the window's online/offline events. */
export function createBrowserConnectivity(): Connectivity {
  return {
    isOnline: () => window.navigator.onLine,
    subscribe(listener) {
      const wentOnline = () => listener(true);
      const wentOffline = () => listener(false);
      window.addEventListener('online', wentOnline);
      window.addEventListener('offline', wentOffline);
      return () => {
        window.removeEventListener('online', wentOnline);
        window.removeEventListener('offline', wentOffline);
      };
    }
  };
}
