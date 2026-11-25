import type { Inspection, Status } from '../api/types';

interface InspectionListProps {
  inspections: Inspection[];
  loading: boolean;
  onOpen: (inspection: Inspection) => void;
}

/** The summary tiles and the table of records, most recently updated first. */
export function InspectionList({ inspections, loading, onOpen }: InspectionListProps) {
  const countWithStatus = (status: Status) => inspections.filter((item) => item.status === status).length;
  return (
    <>
      <div className="stats">
        <Stat label="Total inspections" value={inspections.length} />
        <Stat label="Action required" value={countWithStatus('ACTION_REQUIRED')} tone="warning" />
        <Stat label="Completed" value={countWithStatus('COMPLETED')} tone="success" />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Recent inspections</h3>
            <span className="muted">
              Evidence register · {loading ? 'Refreshing…' : `${inspections.length} records`}
            </span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Project / location</th><th>Status</th><th>Inspector</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr key={inspection.id}>
                  <td>
                    <strong>{inspection.projectName}</strong>
                    <span className="subline">{inspection.location}</span>
                  </td>
                  <td><StatusBadge status={inspection.status} /></td>
                  <td>{inspection.inspectorName}</td>
                  <td>{new Date(inspection.updatedAt).toLocaleDateString()}</td>
                  <td><button className="button link" onClick={() => onOpen(inspection)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status ${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>;
}
