import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserConnectivity } from '../offline/connectivity';

function setNavigatorOnline(online: boolean): void {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Browser connectivity', () => {
  it('AC-5.4 reports what the browser reports', () => {
    setNavigatorOnline(false);
    expect(createBrowserConnectivity().isOnline()).toBe(false);

    setNavigatorOnline(true);
    expect(createBrowserConnectivity().isOnline()).toBe(true);
  });

  it('AC-5.4 tells subscribers when the device goes offline and comes back', () => {
    setNavigatorOnline(true);
    const connectivity = createBrowserConnectivity();
    const changes: boolean[] = [];
    connectivity.subscribe((online) => changes.push(online));

    setNavigatorOnline(false);
    window.dispatchEvent(new Event('offline'));
    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));

    expect(changes).toEqual([false, true]);
  });

  it('AC-5.4 stops telling a subscriber once it has unsubscribed', () => {
    setNavigatorOnline(true);
    const connectivity = createBrowserConnectivity();
    const changes: boolean[] = [];
    const unsubscribe = connectivity.subscribe((online) => changes.push(online));

    unsubscribe();
    window.dispatchEvent(new Event('offline'));

    expect(changes).toEqual([]);
  });
});
