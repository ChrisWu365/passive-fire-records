import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { App } from './App';
import { createBrowserOfflineServices } from './offline/browser/browser-offline-services';
import type { OfflineServices } from './offline/offline-context';

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

/**
 * The offline services, or undefined when this browser cannot provide them (no private file system, or
 * the app is already open in another tab, which holds the device database). The app still works then;
 * it just needs the network for everything.
 */
async function offlineServices(): Promise<OfflineServices | undefined> {
  try {
    return await createBrowserOfflineServices(API_BASE_URL);
  } catch (error) {
    // The browser console is this app's only log. Nothing sensitive is written: only the reason.
    console.warn('Offline use is unavailable in this tab:', error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function start(): Promise<void> {
  // Caches the app itself, so that it opens with no network. Only the built app has a service worker.
  registerSW({ immediate: true });
  // The device database is opened before the first render, so that a page opened offline can read the
  // downloaded copy straight away instead of first reporting a failed request.
  const offline = await offlineServices();
  createRoot(document.getElementById('root')!).render(
    <StrictMode><App offline={offline} /></StrictMode>
  );
}

void start();
