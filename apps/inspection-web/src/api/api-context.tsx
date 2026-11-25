import { createContext, useContext, type ReactNode } from 'react';
import type { Api } from './api';

const ApiContext = createContext<Api | null>(null);

/** Makes an Api available to every screen below it. The app passes the HTTP one; tests pass fakes. */
export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/** @throws when no ApiProvider is above the calling component */
export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside an ApiProvider');
  return api;
}
