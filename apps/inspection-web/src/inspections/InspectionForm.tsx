import { useEffect, useId, useState } from 'react';
import { useApi } from '../api/api-context';
import {
  STATUSES,
  type FirestopSystem,
  type Inspection,
  type InspectionInput,
  type Project,
  type Status,
  type SystemSnapshot
} from '../api/types';
import { Field } from '../components/Field';
import { ErrorAlert, messageOf, StatusMessage } from '../components/feedback';
import { AiDraftNote } from './AiDraftNote';
import { ObservationsEditor } from './ObservationsEditor';
import { PhotoSection } from './PhotoSection';
import { projectOptions, systemOptions } from './reference-options';
import { SystemDetails } from './SystemDetails';

export interface InspectionFormProps {
  /** The record to open, or null to start a new one. */
  initial: Inspection | null;
  /** False for viewers: every field is read-only and no action that changes the record is offered. */
  canEdit: boolean;
  onClose: () => void;
  /** Called with the stored record after every successful save, upload, photo removal or AI draft. */
  onSaved: (inspection: Inspection) => void;
}

const DEFAULT_AI_INSTRUCTION =
  'Provide a concise, non-definitive passive fire inspection observation draft. Never decide compliance. '
  + 'State that a qualified human must verify the result.';
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const INCOMPLETE = 'Choose a project, a firestop system and enter a location.';
const SAVE_BEFORE_AI = 'Save the inspection before requesting an AI draft.';

const EMPTY_INPUT: InspectionInput = {
  projectId: '', systemId: '', location: '', notes: '', status: 'DRAFT', observations: []
};

function inputFrom(record: Inspection): InspectionInput {
  return {
    projectId: record.projectId,
    systemId: record.systemId,
    location: record.location,
    notes: record.notes,
    status: record.status,
    observations: record.observations
  };
}

/**
 * The inspection record dialog: project and firestop system pickers fed by the register, the record's
 * fields, observations, photos, and the AI draft. It reads and writes through useApi().
 */
export function InspectionForm({ initial, canEdit, onClose, onSaved }: InspectionFormProps) {
  const api = useApi();
  const titleId = useId();
  /** The record as last stored by the server; null until a new record has been saved once. */
  const [record, setRecord] = useState<Inspection | null>(initial);
  const [form, setForm] = useState<InspectionInput>(initial ? inputFrom(initial) : EMPTY_INPUT);
  const [projects, setProjects] = useState<Project[]>([]);
  const [systems, setSystems] = useState<FirestopSystem[]>([]);
  const [aiInstruction, setAiInstruction] = useState(DEFAULT_AI_INSTRUCTION);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.register.listProjects()
      .then((loaded) => { if (!cancelled) setProjects(loaded); })
      .catch((failure: unknown) => {
        if (!cancelled) setError(`The projects could not be loaded. ${messageOf(failure, '')}`.trim());
      });
    return () => { cancelled = true; };
  }, [api]);

  const projectId = form.projectId;
  useEffect(() => {
    setSystems([]);
    if (!projectId) return undefined;
    let cancelled = false;
    api.register.listSystems(projectId)
      .then((loaded) => { if (!cancelled) setSystems(loaded); })
      .catch((failure: unknown) => {
        if (!cancelled) setError(`The firestop systems could not be loaded. ${messageOf(failure, '')}`.trim());
      });
    return () => { cancelled = true; };
  }, [api, projectId]);

  const patch = (change: Partial<InspectionInput>) => setForm((current) => ({ ...current, ...change }));
  const keepsStoredReference = record !== null
    && record.projectId === form.projectId && record.systemId === form.systemId;
  const shownSystem = systemToShow(form.systemId, systems, keepsStoredReference ? record.system : undefined);

  /** Runs one server action with the shared busy, message and error handling. */
  const run = async (action: () => Promise<string>, fallbackError: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setMessage(await action());
    } catch (failure) {
      setError(messageOf(failure, fallbackError));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!form.projectId || !form.systemId || !form.location.trim()) {
      setMessage('');
      setError(INCOMPLETE);
      return;
    }
    void run(async () => {
      const saved = record ? await api.inspections.update(record.id, form) : await api.inspections.create(form);
      setRecord(saved);
      setForm(inputFrom(saved));
      onSaved(saved);
      return 'Saved';
    }, 'The inspection could not be saved');
  };

  /** Photos and AI drafts change the stored record but must not discard what the user is still typing. */
  const acceptStored = (stored: Inspection) => {
    setRecord(stored);
    onSaved(stored);
  };

  const requestAiDraft = () => {
    if (!record) {
      setMessage('');
      setError(SAVE_BEFORE_AI);
      return;
    }
    void run(async () => {
      const result = await api.inspections.requestAiDraft(record.id, aiInstruction);
      acceptStored(result.inspection);
      return 'AI draft added. A person must review it.';
    }, 'The AI draft could not be generated');
  };

  const uploadPhotos = (files: File[]) => {
    if (!record || files.length === 0) return;
    const problem = photoProblem(files, record.photos.length);
    if (problem) {
      setMessage('');
      setError(problem);
      return;
    }
    void run(async () => {
      acceptStored(await api.inspections.uploadPhotos(record.id, files));
      return 'Photo added';
    }, 'The upload failed');
  };

  const removePhoto = (position: number) => {
    if (!record) return;
    void run(async () => {
      acceptStored(await api.inspections.deletePhoto(record.id, position));
      return 'Photo removed';
    }, 'The photo could not be removed');
  };

  return (
    <div className="modal-backdrop">
      <article className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">INSPECTION RECORD</span>
            <h2 id={titleId}>{record ? record.projectName : 'New inspection'}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        <ErrorAlert message={error} />
        <StatusMessage message={message} />

        <div className="form-grid">
          <Field label="Project">
            {({ id }) => (
              <select
                id={id}
                disabled={!canEdit}
                value={form.projectId}
                onChange={(event) => patch({ projectId: event.target.value, systemId: '' })}
              >
                <option value="">Select a project…</option>
                {projectOptions(projects, form.projectId, record?.projectName).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Firestop system">
            {({ id }) => (
              <select
                id={id}
                disabled={!canEdit || !form.projectId}
                value={form.systemId}
                onChange={(event) => patch({ systemId: event.target.value })}
              >
                <option value="">Select a system…</option>
                {systemOptions(systems, form.systemId, keepsStoredReference ? record.system : undefined).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {shownSystem && <SystemDetails system={shownSystem} />}

        <div className="form-grid">
          <Field label="Location">
            {({ id }) => (
              <input
                id={id}
                disabled={!canEdit}
                value={form.location}
                onChange={(event) => patch({ location: event.target.value })}
              />
            )}
          </Field>
          <Field label="Status">
            {({ id }) => (
              <select
                id={id}
                disabled={!canEdit}
                value={form.status}
                onChange={(event) => patch({ status: event.target.value as Status })}
              >
                {STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            )}
          </Field>
        </div>
        <Field label="Inspection notes">
          {({ id }) => (
            <textarea
              id={id}
              rows={4}
              disabled={!canEdit}
              placeholder="What was inspected, and what evidence was reviewed?"
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          )}
        </Field>

        <ObservationsEditor
          observations={form.observations}
          canEdit={canEdit}
          onChange={(observations) => patch({ observations })}
        />
        <PhotoSection
          photos={record?.photos ?? []}
          canEdit={canEdit}
          recordIsSaved={record !== null}
          onUpload={uploadPhotos}
          onRemove={removePhoto}
        />
        <AiDraftNote status={record?.aiStatus ?? 'NONE'} summary={record?.aiSummary ?? null} />

        <div className="modal-actions">
          {canEdit && (
            <>
              <Field label="AI instruction">
                {({ id }) => (
                  <textarea
                    id={id}
                    rows={2}
                    value={aiInstruction}
                    onChange={(event) => setAiInstruction(event.target.value)}
                  />
                )}
              </Field>
              <button type="button" className="button secondary" disabled={busy} onClick={requestAiDraft}>
                ✦ Generate AI draft
              </button>
              <button type="button" className="button primary" disabled={busy} onClick={save}>
                Save inspection
              </button>
            </>
          )}
          {record && (
            <button type="button" className="button ghost" onClick={() => window.print()}>Print report</button>
          )}
          <button type="button" className="button ghost" onClick={onClose}>Close</button>
        </div>
      </article>
    </div>
  );
}

/**
 * The details to show under the pickers: the record's own copy while it still refers to the same system,
 * otherwise the register's current details of the newly chosen system.
 */
function systemToShow(
  systemId: string,
  systems: FirestopSystem[],
  storedCopy: SystemSnapshot | undefined
): SystemSnapshot | undefined {
  if (!systemId) return undefined;
  return storedCopy ?? systems.find((system) => system.id === systemId);
}

/** @returns why these files cannot be uploaded, or undefined when they can */
function photoProblem(files: File[], alreadyOnRecord: number): string | undefined {
  if (files.length > MAX_PHOTOS) return `At most ${MAX_PHOTOS} photos can be uploaded at once.`;
  const oversized = files.find((file) => file.size > MAX_PHOTO_BYTES);
  if (oversized) return `${oversized.name} is larger than 10 MB.`;
  if (alreadyOnRecord + files.length > MAX_PHOTOS) {
    return `A record can hold at most ${MAX_PHOTOS} photos; this one already has ${alreadyOnRecord}.`;
  }
  return undefined;
}
