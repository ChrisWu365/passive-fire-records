import { useId, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  /** A message shown under the control, such as a validation error from the server. */
  error?: string;
  /** Receives the id to put on the control, and the id of the error text for aria-describedby. */
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * A labelled form control. The label is tied to the control by id, not by wrapping it, so the label's
 * text stays exactly the label, whatever the control contains.
 */
export function Field({ label, error, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy: error ? errorId : undefined })}
      {error && <span className="field-error" id={errorId}>{error}</span>}
    </div>
  );
}
