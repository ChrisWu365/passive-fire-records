import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../api/api-context';
import type { Inspection } from '../api/types';
import { ErrorAlert, messageOf } from '../components/feedback';
import { InspectionForm } from './InspectionForm';
import { InspectionList } from './InspectionList';

/** What the record dialog is showing: nothing, a new record, or a stored one. */
type OpenRecord = { kind: 'closed' } | { kind: 'new' } | { kind: 'existing'; inspection: Inspection };

const CLOSED: OpenRecord = { kind: 'closed' };

/** The inspections view: the list, and the record dialog opened from it. */
export function InspectionsPage({ canEdit }: { canEdit: boolean }) {
  const api = useApi();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<OpenRecord>(CLOSED);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setInspections(await api.inspections.list());
      setError('');
    } catch (failure) {
      setError(messageOf(failure, 'The inspections could not be loaded'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">COMPLIANCE OPERATIONS</span>
          <h2>Make every inspection traceable.</h2>
          <p>Capture evidence, surface observations and keep a human in the loop.</p>
        </div>
        {canEdit && (
          <button className="button primary" onClick={() => setOpen({ kind: 'new' })}>+ New inspection</button>
        )}
      </section>
      <ErrorAlert message={error} />
      <InspectionList
        inspections={inspections}
        loading={loading}
        onOpen={(inspection) => setOpen({ kind: 'existing', inspection })}
      />
      {open.kind !== 'closed' && (
        <InspectionForm
          initial={open.kind === 'existing' ? open.inspection : null}
          canEdit={canEdit}
          onClose={() => setOpen(CLOSED)}
          onSaved={() => void refresh()}
        />
      )}
    </>
  );
}
