import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../api/api-context';
import type { FirestopSystem, FirestopSystemInput, Project, ProjectInput } from '../api/types';
import { ErrorAlert, messageOf } from '../components/feedback';
import { ProjectPanel } from './ProjectPanel';
import { SystemForm } from './SystemForm';
import { SystemTable } from './SystemTable';

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
 * systems, with forms to add, edit, deactivate and reactivate them. It reads and writes through useApi().
 */
export function RegisterAdminPage() {
  const { register } = useApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [systems, setSystems] = useState<FirestopSystem[]>([]);
  const [editing, setEditing] = useState<FirestopSystem | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadProjects = useCallback(async () => {
    setLoadError('');
    try {
      setProjects((await register.listProjects()).sort(byCode));
    } catch (failure) {
      setLoadError(messageOf(failure, 'The projects could not be loaded'));
    }
  }, [register]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setSystems([]);
    setEditing(null);
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
  };

  const submitSystem = async (input: FirestopSystemInput) => {
    if (!selected) return;
    const saved = editing
      ? await register.updateSystem(selected.id, editing.id, input)
      : await register.createSystem(selected.id, input);
    setSystems((current) => upsert(current, saved));
    setEditing(null);
  };

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
      <div className="register-layout">
        <ProjectPanel projects={projects} selectedId={selectedId} onSelect={setSelectedId} onCreate={createProject} />
        <section className="panel register-panel">
          {selected ? (
            <>
              <div className="panel-heading register-heading">
                <h3>Approved systems for {selected.name}</h3>
                <button
                  type="button"
                  className="button ghost"
                  aria-label={`${selected.active ? 'Deactivate' : 'Reactivate'} project ${selected.code}`}
                  onClick={() => void toggleProject(selected)}
                >
                  {selected.active ? 'Deactivate project' : 'Reactivate project'}
                </button>
              </div>
              <ErrorAlert message={actionError} />
              <SystemTable systems={systems} onEdit={setEditing} onToggleActive={(system) => void toggleSystem(system)} />
              <SystemForm editing={editing} onSubmit={submitSystem} onCancelEdit={() => setEditing(null)} />
            </>
          ) : (
            <p className="muted register-empty">Select a project to see its approved systems.</p>
          )}
        </section>
      </div>
    </>
  );
}
