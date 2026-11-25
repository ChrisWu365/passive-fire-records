import { SEVERITIES, type Observation, type Severity } from '../api/types';

interface ObservationsEditorProps {
  observations: Observation[];
  canEdit: boolean;
  onChange: (observations: Observation[]) => void;
}

const NEW_OBSERVATION: Observation = { description: '', severity: 'MEDIUM', remedialAction: '' };

/** The record's observations and the remedial action for each. */
export function ObservationsEditor({ observations, canEdit, onChange }: ObservationsEditorProps) {
  const patch = (position: number, change: Partial<Observation>) =>
    onChange(observations.map((item, index) => (index === position ? { ...item, ...change } : item)));

  return (
    <>
      <div className="section-heading">
        <h3>Observations & remedial actions</h3>
        {canEdit && (
          <button
            type="button"
            className="button secondary"
            onClick={() => onChange([...observations, { ...NEW_OBSERVATION }])}
          >
            + Add observation
          </button>
        )}
      </div>
      {observations.map((observation, position) => (
        <div className="observation" key={observation.id ?? `new-${position}`}>
          <textarea
            rows={2}
            disabled={!canEdit}
            placeholder="Observation"
            aria-label={`Observation ${position + 1}`}
            value={observation.description}
            onChange={(event) => patch(position, { description: event.target.value })}
          />
          <div className="observation-row">
            <select
              disabled={!canEdit}
              aria-label={`Severity of observation ${position + 1}`}
              value={observation.severity}
              onChange={(event) => patch(position, { severity: event.target.value as Severity })}
            >
              {SEVERITIES.map((severity) => <option key={severity}>{severity}</option>)}
            </select>
            <input
              disabled={!canEdit}
              placeholder="Recommended remedial action"
              aria-label={`Remedial action for observation ${position + 1}`}
              value={observation.remedialAction}
              onChange={(event) => patch(position, { remedialAction: event.target.value })}
            />
          </div>
        </div>
      ))}
    </>
  );
}
