import { Field } from '../components/Field';

interface PendingPhotosProps {
  /** Photos chosen for a record that is not stored anywhere yet. */
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (position: number) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Photo picker for a record being captured with no connection. The photos are held in the form until the
 * record is saved on the device; they are listed by name, since nothing has been uploaded to show.
 */
export function PendingPhotos({ files, onAdd, onRemove }: PendingPhotosProps) {
  return (
    <>
      <Field label="Site photos">
        {({ id }) => (
          <input
            id={id}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            onChange={(event) => {
              onAdd(Array.from(event.target.files ?? []));
              // Cleared so that choosing the same file again raises a change event.
              event.target.value = '';
            }}
          />
        )}
      </Field>
      {files.length > 0 && (
        <ul className="pending-photos">
          {files.map((file, position) => (
            <li key={`${file.name}-${position}`}>
              <span>{file.name}</span>
              <button
                type="button"
                className="button link"
                aria-label={`Remove photo ${position + 1}`}
                onClick={() => onRemove(position)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
