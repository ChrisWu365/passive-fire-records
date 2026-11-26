import { useState, type FormEvent } from 'react';
import type { Project, ProjectInput } from '../api/types';
import { Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { ErrorAlert, fieldMessagesOf, messageOf } from '../components/feedback';

interface ProjectDialogProps {
  /** The project being edited, or null when the dialog adds a new one. */
  editing: Project | null;
  /** Stores the project. Rejects with the server's error when it is refused. */
  onSubmit: (input: ProjectInput) => Promise<void>;
  onClose: () => void;
}

interface Draft {
  code: string;
  name: string;
  address: string;
}

const EMPTY: Draft = { code: '', name: '', address: '' };

const FIELDS: ReadonlyArray<{ name: keyof Draft; label: string; required: boolean }> = [
  { name: 'code', label: 'Project code', required: true },
  { name: 'name', label: 'Project name', required: true },
  { name: 'address', label: 'Address', required: false }
];

function draftFrom(project: Project): Draft {
  return { code: project.code, name: project.name, address: project.address ?? '' };
}

/**
 * The dialog that adds a project or edits one. Validation is the register's: its messages are shown beside
 * the fields, and the dialog stays open with what the user typed so they can correct it.
 */
export function ProjectDialog({ editing, onSubmit, onClose }: ProjectDialogProps) {
  const [draft, setDraft] = useState<Draft>(editing ? draftFrom(editing) : EMPTY);
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
      await onSubmit({ code: draft.code.trim(), name: draft.name.trim(), ...(address ? { address } : {}) });
    } catch (failure) {
      setFieldErrors(fieldMessagesOf(failure));
      setError(messageOf(failure, editing ? 'The project could not be saved' : 'The project could not be added'));
      setSubmitting(false);
    }
  };

  return (
    <Modal title={editing ? `Edit project ${editing.code}` : 'New project'} eyebrow="PROJECT" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorAlert message={error} />
        {FIELDS.map(({ name, label, required }) => (
          <Field key={name} label={label} error={fieldErrors[name]}>
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                required={required}
                value={draft[name]}
                onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
              />
            )}
          </Field>
        ))}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={submitting}>{editing ? 'Save project' : 'Add project'}</button>
        </div>
      </form>
    </Modal>
  );
}
