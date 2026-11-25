import { Field } from '../components/Field';

interface PhotoSectionProps {
  photos: string[];
  canEdit: boolean;
  /** False until the record has been saved once: photos are attached to a stored record. */
  recordIsSaved: boolean;
  onUpload: (files: File[]) => void;
  onRemove: (position: number) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

/** The record's site photos, with upload and removal for users who may edit. */
export function PhotoSection({ photos, canEdit, recordIsSaved, onUpload, onRemove }: PhotoSectionProps) {
  return (
    <>
      {canEdit && (
        <Field label="Site photos">
          {({ id }) => (
            <input
              id={id}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              disabled={!recordIsSaved}
              onChange={(event) => {
                onUpload(Array.from(event.target.files ?? []));
                // Cleared so that choosing the same file again raises a change event.
                event.target.value = '';
              }}
            />
          )}
        </Field>
      )}
      {photos.length > 0 && (
        <div className="photo-list">
          {photos.map((photo, position) => (
            <div key={photo} className="photo-item">
              <img src={photo} alt="Inspection evidence" />
              {canEdit && (
                <button
                  type="button"
                  className="button ghost photo-delete"
                  aria-label={`Remove photo ${position + 1}`}
                  onClick={() => onRemove(position)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
