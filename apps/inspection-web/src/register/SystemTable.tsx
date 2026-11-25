import type { FirestopSystem } from '../api/types';

interface SystemTableProps {
  systems: FirestopSystem[];
  onEdit: (system: FirestopSystem) => void;
  /** Deactivates an active system, or reactivates an inactive one. Systems are never deleted. */
  onToggleActive: (system: FirestopSystem) => void;
}

/** A project's approved systems, active and inactive. */
export function SystemTable({ systems, onEdit, onToggleActive }: SystemTableProps) {
  if (systems.length === 0) return <p className="muted register-empty">This project has no systems yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Code</th><th>Substrate</th><th>Service type</th><th>Fire rating</th><th>Materials</th>
            <th>State</th><th />
          </tr>
        </thead>
        <tbody>
          {systems.map((system) => (
            <tr key={system.id}>
              <td><strong>{system.code}</strong></td>
              <td>{system.substrate}</td>
              <td>{system.serviceType}</td>
              <td>{system.fireRating}</td>
              <td>{system.materials}</td>
              <td>
                <span className={`badge ${system.active ? 'active' : 'inactive'}`}>
                  {system.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="button link"
                  aria-label={`Edit ${system.code}`}
                  onClick={() => onEdit(system)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button link"
                  aria-label={`${system.active ? 'Deactivate' : 'Reactivate'} ${system.code}`}
                  onClick={() => onToggleActive(system)}
                >
                  {system.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
