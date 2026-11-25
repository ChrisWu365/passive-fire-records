import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { App } from './App';
import type { Api } from './api/api';
import { createHttpApi } from './api/http-api';
import { readToken } from './auth/session';
import { createDeviceServices, type DeviceServices } from './offline/browser/browser-offline-services';

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

/**
 * The device services, or undefined when this browser cannot provide them (no private file system, or
 * the app is already open in another tab, which holds the device database). The app still works then;
 * it just needs the network for everything.
 */
async function deviceServices(api: Api): Promise<DeviceServices | undefined> {
  try {
    return await createDeviceServices({ baseUrl: API_BASE_URL, inspections: api.inspections });
  } catch (error) {
    // The browser console is this app's only log. Nothing sensitive is written: only the reason.
    console.warn('Offline use is unavailable in this tab:', error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function start(): Promise<void> {
  // Caches the app itself, so that it opens with no network. Only the built app has a service worker.
  registerSW({ immediate: true });
  const api = createHttpApi({ baseUrl: API_BASE_URL, getToken: readToken });
  // The device database is opened before the first render, so that a page opened offline can read the
  // downloaded copy and the waiting records straight away instead of first reporting a failed request.
  const device = await deviceServices(api);
  createRoot(document.getElementById('root')!).render(
    <StrictMode><App api={api} offline={device?.offline} queue={device?.queue} /></StrictMode>
  );
}

void start();
