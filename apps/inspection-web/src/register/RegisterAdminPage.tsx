import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api/api-context';
import type { FirestopSystem, FirestopSystemInput, Project, ProjectInput } from '../api/types';
import { ErrorAlert, messageOf } from '../components/feedback';
import { OfflineNotice } from '../offline/OfflineNotice';
import { useOffline } from '../offline/offline-context';
import { isNetworkFailure } from '../offline/reachability';
import { useOnline } from '../offline/use-online';
import { AreaPanel } from './AreaPanel';
import { ProjectDialog } from './ProjectDialog';
import { ProjectPanel } from './ProjectPanel';
import { SystemDialog } from './SystemDialog';
import { SystemTable } from './SystemTable';

/** Which dialog is open, and for an edit, what it is editing. */
type OpenDialog =
  | { kind: 'none' }
  | { kind: 'new-project' }
  | { kind: 'edit-project'; project: Project }
  | { kind: 'new-system' }
  | { kind: 'edit-system'; system: FirestopSystem };

const NO_DIALOG: OpenDialog = { kind: 'none' };
const NEEDS_CONNECTION = 'You are offline. The register can be viewed and changed only while online.';

function byCode<T extends { code: string }>(left: T, right: T): number {
  return left.code.localeCompare(right.code);
}

/** Adds the item, or replaces the one with the same id, keeping the list ordered by code. */
function upsert<T extends { id: string; code: string }>(items: T[], item: T): T[] {
  return [...items.filter((existing) => existing.id !== item.id), item].sort(byCode);
}

function projectInput(project: Project, active: boolean): ProjectInput {
  return { code: project.code, name: project.name, ...(project.address ? { address: project.address } : {}), active };
}

function systemInput(system: FirestopSystem, active: boolean): FirestopSystemInput {
  const { id: _id, projectId: _projectId, active: _active, ...details } = system;
  return { ...details, active };
}

/**
 * Admin screen for the register: the list of projects, and for the selected project its approved firestop
 * systems and its areas. Adding and editing happen in dialogs opened from each panel's heading. It reads and writes
 * through useApi().
 */
export function RegisterAdminPage() {
  const { register } = useApi();
  const connectivity = useOffline()?.connectivity;
  const online = useOnline();
  /** True when the projects could not load because the device has no connection; not an error to fix. */
  const [waitingForConnection, setWaitingForConnection] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [systems, setSystems] = useState<FirestopSystem[]>([]);
  const [dialog, setDialog] = useState<OpenDialog>(NO_DIALOG);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadProjects = useCallback(async () => {
    setLoadError('');
    try {
      setProjects((await register.listProjects()).sort(byCode));
      setWaitingForConnection(false);
    } catch (failure) {
      const offline = isNetworkFailure(failure) && connectivity !== undefined && !connectivity.isOnline();
      setWaitingForConnection(offline);
      setLoadError(offline ? '' : messageOf(failure, 'The projects could not be loaded'));
    }
  }, [register, connectivity]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // When the connection comes back, load what could not be loaded while it was away.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) void loadProjects();
    wasOnline.current = online;
  }, [online, loadProjects]);

  useEffect(() => {
    setSystems([]);
    setDialog(NO_DIALOG);
    setActionError('');
    if (!selectedId) return undefined;
    let cancelled = false;
    register.listSystems(selectedId)
      .then((loaded) => { if (!cancelled) setSystems(loaded.sort(byCode)); })
      .catch((failure: unknown) => {
        if (!cancelled) setActionError(messageOf(failure, 'The systems could not be loaded'));
      });
    return () => { cancelled = true; };
  }, [register, selectedId]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  const createProject = async (input: ProjectInput) => {
    const created = await register.createProject(input);
    setProjects((current) => upsert(current, created));
    setSelectedId(created.id);
    setDialog(NO_DIALOG);
  };

  /** Saves the edited details. The dialog does not offer the active state, so it is kept as it is. */
  const saveProject = async (project: Project, input: ProjectInput) => {
    const saved = await register.updateProject(project.id, { ...input, active: project.active });
    setProjects((current) => upsert(current, saved));
    setDialog(NO_DIALOG);
  };

  const saveSystem = async (editing: FirestopSystem | null, input: FirestopSystemInput) => {
    if (!selected) return;
    const saved = editing
      ? await register.updateSystem(selected.id, editing.id, input)
      : await register.createSystem(selected.id, input);
    setSystems((current) => upsert(current, saved));
    setDialog(NO_DIALOG);
  };

  const closeDialog = () => setDialog(NO_DIALOG);

  /** Runs a one-click change and reports a failure in the page's own alert. */
  const attempt = async (change: () => Promise<void>, fallback: string) => {
    setActionError('');
    try {
      await change();
    } catch (failure) {
      setActionError(messageOf(failure, fallback));
    }
  };

  const toggleSystem = (system: FirestopSystem) => attempt(async () => {
    const saved = await register.updateSystem(system.projectId, system.id, systemInput(system, !system.active));
    setSystems((current) => upsert(current, saved));
  }, 'The system could not be changed');

  const toggleProject = (project: Project) => attempt(async () => {
    const saved = await register.updateProject(project.id, projectInput(project, !project.active));
    setProjects((current) => upsert(current, saved));
  }, 'The project could not be changed');

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">REGISTER</span>
          <h2>Register</h2>
          <p>Projects and the firestop systems approved for each. Installers choose from this list on site.</p>
        </div>
      </section>
      <ErrorAlert message={loadError}>
        {' '}<button type="button" className="button link" onClick={() => void loadProjects()}>Try again</button>
      </ErrorAlert>
      {waitingForConnection && <OfflineNotice message={NEEDS_CONNECTION} />}
      <div className="register-layout">
        <ProjectPanel
          projects={projects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setDialog({ kind: 'new-project' })}
        />
        <div className="register-main">
          {selected && <AreaPanel project={selected} />}
          <section className="panel register-panel">
            {selected ? (
              <>
                <div className="panel-heading register-heading">
                  <h3>Approved systems for {selected.name}</h3>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button ghost"
                      aria-label={`Edit project ${selected.code}`}
                      onClick={() => setDialog({ kind: 'edit-project', project: selected })}
                    >
                      Edit project
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      aria-label={`${selected.active ? 'Deactivate' : 'Reactivate'} project ${selected.code}`}
                      onClick={() => void toggleProject(selected)}
                    >
                      {selected.active ? 'Deactivate project' : 'Reactivate project'}
                    </button>
                    <button type="button" className="button primary" onClick={() => setDialog({ kind: 'new-system' })}>
                      New system
                    </button>
                  </div>
                </div>
                <ErrorAlert message={actionError} />
                <SystemTable
                  systems={systems}
                  onEdit={(system) => setDialog({ kind: 'edit-system', system })}
                  onToggleActive={(system) => void toggleSystem(system)}
                />
              </>
            ) : (
              <p className="muted register-empty">Select a project to see its approved systems.</p>
            )}
          </section>
        </div>
      </div>
      {dialog.kind === 'new-project' && (
        <ProjectDialog editing={null} onSubmit={createProject} onClose={closeDialog} />
      )}
      {dialog.kind === 'edit-project' && (
        <ProjectDialog
          editing={dialog.project}
          onSubmit={(input) => saveProject(dialog.project, input)}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === 'new-system' && (
        <SystemDialog editing={null} onSubmit={(input) => saveSystem(null, input)} onClose={closeDialog} />
      )}
      {dialog.kind === 'edit-system' && (
        <SystemDialog
          editing={dialog.system}
          onSubmit={(input) => saveSystem(dialog.system, input)}
          onClose={closeDialog}
        />
      )}
    </>
  );
}
