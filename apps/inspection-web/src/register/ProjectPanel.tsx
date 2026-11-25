import { useState, type FormEvent } from 'react';
import type { Project, ProjectInput } from '../api/types';
import { Field } from '../components/Field';
import { ErrorAlert, fieldMessagesOf, messageOf } from '../components/feedback';

interface ProjectPanelProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  /** Stores a new project. Rejects with the server's error when it is refused. */
  onCreate: (input: ProjectInput) => Promise<void>;
}

const EMPTY = { code: '', name: '', address: '' };

/** The list of projects, and the form that adds one. */
export function ProjectPanel({ projects, selectedId, onSelect, onCreate }: ProjectPanelProps) {
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    const address = draft.address.trim();
    try {
      await onCreate({ code: draft.code.trim(), name: draft.name.trim(), ...(address ? { address } : {}) });
      setDraft(EMPTY);
    } catch (failure) {
      setFieldErrors(fieldMessagesOf(failure));
      setError(messageOf(failure, 'The project could not be added'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel register-panel">
      <div className="panel-heading"><h3>Projects</h3></div>
      <ul className="project-list">
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              className={`project-item ${project.id === selectedId ? 'selected' : ''}`}
              aria-pressed={project.id === selectedId}
              onClick={() => onSelect(project.id)}
            >
              <strong>{project.code}</strong> <span>{project.name}</span>
              {!project.active && <> <span className="badge inactive">Inactive</span></>}
            </button>
          </li>
        ))}
      </ul>
      <form className="register-form" onSubmit={submit}>
        <h4>Add a project</h4>
        <ErrorAlert message={error} />
        <Field label="Project code" error={fieldErrors.code}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              required
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            />
          )}
        </Field>
        <Field label="Project name" error={fieldErrors.name}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Address" error={fieldErrors.address}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
            />
          )}
        </Field>
        <button className="button primary" disabled={submitting}>Add project</button>
      </form>
    </section>
  );
}
