import { useState, type FormEvent } from 'react';
import type { Area } from '../api/types';
import { Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { ErrorAlert, fieldMessagesOf, messageOf } from '../components/feedback';

interface AreaDialogProps {
  /** The area being renamed, or null when the dialog adds a new one. */
  editing: Area | null;
  /** Stores the name. Rejects with the server's error when it is refused. */
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

/**
 * The dialog that adds an area to the selected project, or renames one. Validation is the register's: its
 * messages are shown in the dialog, which stays open with what the user typed.
 */
export function AreaDialog({ editing, onSubmit, onClose }: AreaDialogProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await onSubmit(name.trim());
    } catch (failure) {
      setFieldErrors(fieldMessagesOf(failure));
      setError(messageOf(failure, 'The area could not be saved'));
      setSubmitting(false);
    }
  };

  return (
    <Modal title={editing ? `Rename area ${editing.name}` : 'New area'} eyebrow="LEVEL OR AREA" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorAlert message={error} />
        <Field label="Area name" error={fieldErrors.name}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={submitting}>{editing ? 'Save area' : 'Add area'}</button>
        </div>
      </form>
    </Modal>
  );
}
