import { useEffect, useState, type FormEvent } from 'react';
import type { FirestopSystem, FirestopSystemInput } from '../api/types';
import { Field } from '../components/Field';
import { ErrorAlert, fieldMessagesOf, messageOf } from '../components/feedback';

interface SystemFormProps {
  /** The system being edited, or null when the form adds a new one. */
  editing: FirestopSystem | null;
  /** Stores the system. Rejects with the server's error when it is refused. */
  onSubmit: (input: FirestopSystemInput) => Promise<void>;
  onCancelEdit: () => void;
}

type Draft = Required<Omit<FirestopSystemInput, 'active'>>;
type DraftField = keyof Draft;

const EMPTY: Draft = {
  code: '', substrate: '', serviceType: '', fireRating: '', materials: '', installationMethod: ''
};

const FIELDS: ReadonlyArray<{ name: DraftField; label: string; multiline?: boolean }> = [
  { name: 'code', label: 'System code' },
  { name: 'substrate', label: 'Substrate' },
  { name: 'serviceType', label: 'Service type' },
  { name: 'fireRating', label: 'Fire rating' },
  { name: 'materials', label: 'Materials' },
  { name: 'installationMethod', label: 'Installation method', multiline: true }
];

function draftFrom(system: FirestopSystem): Draft {
  return {
    code: system.code,
    substrate: system.substrate,
    serviceType: system.serviceType,
    fireRating: system.fireRating,
    materials: system.materials,
    installationMethod: system.installationMethod
  };
}

/**
 * Adds a system to the selected project, or edits one. Validation is the register's: its field messages
 * are shown beside the fields, and what the user typed is kept so they can correct it.
 */
export function SystemForm({ editing, onSubmit, onCancelEdit }: SystemFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDraft(editing ? draftFrom(editing) : EMPTY);
    setError('');
    setFieldErrors({});
  }, [editing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await onSubmit(draft);
      setDraft(EMPTY);
    } catch (failure) {
      setFieldErrors(fieldMessagesOf(failure));
      setError(messageOf(failure, 'The system could not be saved'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="register-form" onSubmit={submit}>
      <h4>{editing ? `Edit ${editing.code}` : 'Add a system'}</h4>
      <ErrorAlert message={error} />
      <div className="form-grid">
        {FIELDS.map(({ name, label, multiline }) => (
          <Field key={name} label={label} error={fieldErrors[name]}>
            {({ id, describedBy }) => {
              const shared = {
                id,
                'aria-describedby': describedBy,
                required: true,
                value: draft[name],
                onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [name]: event.target.value })
              };
              return multiline ? <textarea rows={2} {...shared} /> : <input {...shared} />;
            }}
          </Field>
        ))}
      </div>
      <div className="form-actions">
        <button className="button primary" disabled={submitting}>{editing ? 'Save system' : 'Add system'}</button>
        {editing && <button type="button" className="button ghost" onClick={onCancelEdit}>Cancel edit</button>}
      </div>
    </form>
  );
}
