import { useState, type FormEvent } from 'react';
import type { FirestopSystem, FirestopSystemInput } from '../api/types';
import { Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { ErrorAlert, fieldMessagesOf, messageOf } from '../components/feedback';

interface SystemDialogProps {
  /** The system being edited, or null when the dialog adds a new one. */
  editing: FirestopSystem | null;
  /** Stores the system. Rejects with the server's error when it is refused. */
  onSubmit: (input: FirestopSystemInput) => Promise<void>;
  onClose: () => void;
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
 * The dialog that adds a system to the selected project, or edits one. Validation is the register's: its
 * messages are shown beside the fields, and the dialog stays open with what the user typed.
 */
export function SystemDialog({ editing, onSubmit, onClose }: SystemDialogProps) {
  const [draft, setDraft] = useState<Draft>(editing ? draftFrom(editing) : EMPTY);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await onSubmit(draft);
    } catch (failure) {
      setFieldErrors(fieldMessagesOf(failure));
      setError(messageOf(failure, 'The system could not be saved'));
      setSubmitting(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${editing.code}` : 'New system'} eyebrow="FIRESTOP SYSTEM" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorAlert message={error} />
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
              return multiline ? <textarea rows={3} {...shared} /> : <input {...shared} />;
            }}
          </Field>
        ))}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={submitting}>{editing ? 'Save system' : 'Add system'}</button>
        </div>
      </form>
    </Modal>
  );
}
