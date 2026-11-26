import { useState } from 'react';
import { STATUSES, type Inspection, type Status } from '../api/types';
import { Pager } from '../components/Pager';
import { placeOf } from './place';

interface InspectionListProps {
  inspections: Inspection[];
  loading: boolean;
  onOpen: (inspection: Inspection) => void;
}

/** The status filter's value: one status, or the empty string for every status. */
type StatusFilter = Status | '';

const PAGE_SIZE = 25;
const FIRST_PAGE = 1;
const NO_MATCH = 'No inspections match.';

function statusLabel(status: Status): string {
  return status.replace('_', ' ');
}

function matches(inspection: Inspection, query: string, status: StatusFilter): boolean {
  if (status && inspection.status !== status) return false;
  return `${inspection.projectName} ${placeOf(inspection)}`.toLowerCase().includes(query);
}

/**
 * The summary tiles and the table of records, in the order given (most recently updated first). The table
 * can be searched (by project, area or location), filtered by status and is shown a page at a time; the tiles always count every record.
 */
export function InspectionList({ inspections, loading, onOpen }: InspectionListProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [requestedPage, setRequestedPage] = useState(FIRST_PAGE);

  const query = search.trim().toLowerCase();
  const narrowed = query !== '' || status !== '';
  const matching = narrowed ? inspections.filter((item) => matches(item, query, status)) : inspections;
  const pageCount = Math.max(FIRST_PAGE, Math.ceil(matching.length / PAGE_SIZE));
  // The list can shrink under the user (a reload, a deletion), so the page asked for may no longer exist.
  const page = Math.min(requestedPage, pageCount);
  const shown = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const countText = narrowed
    ? `${matching.length} of ${inspections.length} records`
    : `${inspections.length} records`;

  const countWithStatus = (wanted: Status) => inspections.filter((item) => item.status === wanted).length;

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
            <span className="muted">Evidence register · {loading ? 'Refreshing…' : countText}</span>
          </div>
        </div>
        <div className="list-tools">
          <input
            type="search"
            aria-label="Search inspections"
            placeholder="Search by project or location"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setRequestedPage(FIRST_PAGE);
            }}
          />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setRequestedPage(FIRST_PAGE);
            }}
          >
            <option value="">All</option>
            {STATUSES.map((option) => <option key={option} value={option}>{statusLabel(option)}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Project / location</th><th>Status</th><th>Inspector</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((inspection) => (
                <tr key={inspection.id}>
                  <td>
                    <strong>{inspection.projectName}</strong>
                    <span className="subline">{placeOf(inspection)}</span>
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
        {narrowed && matching.length === 0 && <p className="muted list-empty">{NO_MATCH}</p>}
        <Pager page={page} pageCount={pageCount} onChange={setRequestedPage} />
      </section>
    </>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status ${status.toLowerCase()}`}>{statusLabel(status)}</span>;
}
