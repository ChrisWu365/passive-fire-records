import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api/api-context';
import type { Inspection } from '../api/types';
import { ErrorAlert, messageOf } from '../components/feedback';
import { OfflinePanel } from '../offline/OfflinePanel';
import { OfflineNotice } from '../offline/OfflineNotice';
import { useOffline } from '../offline/offline-context';
import { isNetworkFailure } from '../offline/reachability';
import { useOnline } from '../offline/use-online';
import { InspectionForm } from './InspectionForm';
import { InspectionList } from './InspectionList';

/** What the record dialog is showing: nothing, a new record, or a stored one. */
type OpenRecord = { kind: 'closed' } | { kind: 'new' } | { kind: 'existing'; inspection: Inspection };

const CLOSED: OpenRecord = { kind: 'closed' };
const LIST_NEEDS_CONNECTION = 'You are offline. The inspections list will load when you are back online.';

/** The inspections view: the list, and the record dialog opened from it. */
export function InspectionsPage({ canEdit }: { canEdit: boolean }) {
  const api = useApi();
  const connectivity = useOffline()?.connectivity;
  const online = useOnline();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** True when the list could not load because the device has no connection; not an error to fix. */
  const [waitingForConnection, setWaitingForConnection] = useState(false);
  const [open, setOpen] = useState<OpenRecord>(CLOSED);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setInspections(await api.inspections.list());
      setError('');
      setWaitingForConnection(false);
    } catch (failure) {
      const offline = isNetworkFailure(failure) && connectivity !== undefined && !connectivity.isOnline();
      setWaitingForConnection(offline);
      setError(offline ? '' : messageOf(failure, 'The inspections could not be loaded'));
    } finally {
      setLoading(false);
    }
  }, [api, connectivity]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // When the connection comes back, load what could not be loaded while it was away.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) void refresh();
    wasOnline.current = online;
  }, [online, refresh]);

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
      <OfflinePanel />
      <ErrorAlert message={error} />
      {waitingForConnection && <OfflineNotice message={LIST_NEEDS_CONNECTION} />}
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
