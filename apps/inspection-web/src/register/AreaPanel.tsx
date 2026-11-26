import { useEffect, useState } from 'react';
import { useApi } from '../api/api-context';
import type { Area, Project } from '../api/types';
import { ErrorAlert, messageOf } from '../components/feedback';
import { AreaDialog } from './AreaDialog';

/** Which dialog is open: none, the one that adds an area, or the one that renames the given area. */
type OpenDialog = { kind: 'none' } | { kind: 'new' } | { kind: 'rename'; area: Area };

const NO_DIALOG: OpenDialog = { kind: 'none' };
const NO_AREAS = 'This project has no areas yet.';

function byName(left: Area, right: Area): number {
  return left.name.localeCompare(right.name);
}

/** Adds the area, or replaces the one with the same id, keeping the list ordered by name. */
function upsert(areas: Area[], area: Area): Area[] {
  return [...areas.filter((existing) => existing.id !== area.id), area].sort(byName);
}

/**
 * The selected project's levels and areas: the list, with a dialog to add or rename one and a button to
 * deactivate or reactivate each. Areas are never deleted. It reads and writes through useApi().
 */
export function AreaPanel({ project }: { project: Project }) {
  const { register } = useApi();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog>(NO_DIALOG);
  const [error, setError] = useState('');
  const projectId = project.id;

  useEffect(() => {
    setAreas([]);
    setLoaded(false);
    setDialog(NO_DIALOG);
    setError('');
    let cancelled = false;
    register.listAreas(projectId)
      .then((listed) => {
        if (cancelled) return;
        setAreas([...listed].sort(byName));
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(messageOf(failure, 'The areas could not be loaded'));
      });
    return () => { cancelled = true; };
  }, [register, projectId]);

  const save = async (editing: Area | null, name: string) => {
    const saved = editing
      ? await register.updateArea(projectId, editing.id, { name, active: editing.active })
      : await register.createArea(projectId, { name });
    setAreas((current) => upsert(current, saved));
    setDialog(NO_DIALOG);
  };

  const toggle = async (area: Area) => {
    setError('');
    try {
      const saved = await register.updateArea(projectId, area.id, { name: area.name, active: !area.active });
      setAreas((current) => upsert(current, saved));
    } catch (failure) {
      setError(messageOf(failure, 'The area could not be changed'));
    }
  };

  return (
    <section className="panel register-panel">
      <div className="panel-heading register-heading">
        <h3>Areas of {project.name}</h3>
        <button type="button" className="button primary" onClick={() => setDialog({ kind: 'new' })}>New area</button>
      </div>
      <ErrorAlert message={error} />
      {loaded && areas.length === 0 && <p className="muted register-empty">{NO_AREAS}</p>}
      <ul className="area-list" aria-label="Areas">
        {areas.map((area) => (
          <li key={area.id} aria-label={area.active ? area.name : `${area.name}, Inactive`}>
            <span className="area-name">{area.name}</span>
            {!area.active && <span className="badge inactive">Inactive</span>}
            <span className="area-actions">
              <button
                type="button"
                className="button link"
                aria-label={`Rename area ${area.name}`}
                onClick={() => setDialog({ kind: 'rename', area })}
              >
                Rename
              </button>
              <button
                type="button"
                className="button link"
                aria-label={`${area.active ? 'Deactivate' : 'Reactivate'} area ${area.name}`}
                onClick={() => void toggle(area)}
              >
                {area.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {dialog.kind === 'new' && (
        <AreaDialog editing={null} onSubmit={(name) => save(null, name)} onClose={() => setDialog(NO_DIALOG)} />
      )}
      {dialog.kind === 'rename' && (
        <AreaDialog
          editing={dialog.area}
          onSubmit={(name) => save(dialog.area, name)}
          onClose={() => setDialog(NO_DIALOG)}
        />
      )}
    </section>
  );
}
