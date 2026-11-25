import { useMemo, useState } from 'react';
import type { Api } from './api/api';
import { ApiProvider } from './api/api-context';
import { createHttpApi } from './api/http-api';
import type { Session, User } from './api/types';
import { Login } from './auth/Login';
import { clearSession, readToken, readUser, saveSession } from './auth/session';
import { InspectionsPage } from './inspections/InspectionsPage';
import { OfflineProvider, type OfflineServices } from './offline/offline-context';
import { RegisterAdminPage } from './register/RegisterAdminPage';

type View = 'inspections' | 'register';

export interface AppProps {
  /** Lets tests replace the HTTP client; the running app leaves it out. */
  api?: Api;
  /** The services for working without a network. Left out, every screen needs the network. */
  offline?: OfflineServices;
}

export function App({ api, offline }: AppProps = {}) {
  const resolvedApi = useMemo(
    () => api ?? createHttpApi({ baseUrl: import.meta.env.VITE_API_URL ?? '', getToken: readToken }),
    [api]
  );
  const workspace = offline
    ? <OfflineProvider services={offline}><Workspace /></OfflineProvider>
    : <Workspace />;
  return <ApiProvider api={resolvedApi}>{workspace}</ApiProvider>;
}

function Workspace() {
  const [user, setUser] = useState<User | null>(readUser);
  const [view, setView] = useState<View>('inspections');

  const signIn = (session: Session) => {
    saveSession(session);
    setView('inspections');
    setUser(session.user);
  };
  const signOut = () => {
    clearSession();
    setUser(null);
  };

  if (!user) return <Login onSignedIn={signIn} />;

  // Hiding the register is a convenience, not the protection: the register service itself refuses
  // every write that does not carry an admin token.
  const isAdmin = user.role === 'ADMIN';
  return (
    <div className="app-shell">
      <header className="topbar">
        <div><span className="eyebrow">PASSIVE FIRE / FIELD DEMO</span><h1>Inspection workspace</h1></div>
        {isAdmin && (
          <nav className="view-switch" aria-label="Sections">
            <ViewButton label="Inspections" current={view === 'inspections'} onSelect={() => setView('inspections')} />
            <ViewButton label="Register" current={view === 'register'} onSelect={() => setView('register')} />
          </nav>
        )}
        <div className="user-menu">
          <span>{user.name} · <strong>{user.role}</strong></span>
          <button className="button ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="content">
        {isAdmin && view === 'register'
          ? <RegisterAdminPage />
          : <InspectionsPage canEdit={user.role !== 'VIEWER'} />}
      </main>
    </div>
  );
}

function ViewButton({ label, current, onSelect }: { label: string; current: boolean; onSelect: () => void }) {
  return (
    <button
      className={`button ${current ? 'secondary' : 'ghost'}`}
      aria-current={current ? 'page' : undefined}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
