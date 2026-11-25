import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '../../api/types';
import { ErrorAlert, messageOf } from '../../components/feedback';
import { useOnline } from '../use-online';
import { useQueue, type QueueServices } from './queue-context';
import type { QueuedInspection } from './queued-inspection';
import type { SyncStatus } from './sync-engine';

export interface DeviceQueuePanelProps {
  /** The signed-in user; only their records are sent. */
  user: User;
  /** Called when the user chooses to sign in again after the server rejected the sign-in. */
  onSignInAgain: () => void;
  /** Called after a run finishes sending at least one record, so the server list can be reloaded. */
  onSynced: () => void;
  /** Change this value after storing a record on the device, to make the panel list it and try to send it. */
  reloadSignal?: number;
}

const SIGN_IN_AGAIN = 'Your sign-in has expired. Sign in again to send the records on this device.';
const AI_DRAFT_FAILED = 'The AI draft failed. Open the record to try again.';
const CONFIRM_DISCARD = 'Discard this record and its photos? This cannot be undone.';

/**
 * Lists the records held on this device with their sync state, and offers "Sync now", Retry and Discard.
 * It also starts a sync when it appears and whenever the connection returns. Uses useQueue(); renders
 * nothing when there is no device queue or it is empty.
 */
export function DeviceQueuePanel(props: DeviceQueuePanelProps) {
  const queue = useQueue();
  return queue ? <Panel queue={queue} {...props} /> : null;
}

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** What to call the record's state on screen. "Syncing" exists only while the engine is sending it. */
function stateLabel(item: QueuedInspection, status: SyncStatus): string {
  if (item.state === 'SYNCED') return 'Synced';
  if (item.state === 'FAILED') return 'Sync failed';
  return status.syncingClientId === item.clientId ? 'Syncing' : 'Pending sync';
}

function Panel({ queue, user, onSignInAgain, onSynced, reloadSignal }: DeviceQueuePanelProps & { queue: QueueServices }) {
  const { queueStore, syncEngine } = queue;
  const online = useOnline();
  const [items, setItems] = useState<QueuedInspection[]>([]);
  const [status, setStatus] = useState<SyncStatus>(() => syncEngine.status());
  const [confirmingDiscard, setConfirmingDiscard] = useState<string | null>(null);
  const [error, setError] = useState('');
  const userId = user.id;
  // Kept in a ref so that a new callback from the parent does not restart the effects below.
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const reload = useCallback(async () => {
    try {
      setItems(await queueStore.list());
    } catch (failure) {
      setError(messageOf(failure, 'The records on this device could not be read'));
    }
  }, [queueStore]);

  const sync = useCallback(async () => {
    setError('');
    try {
      const result = await syncEngine.run({ id: userId });
      await reload();
      if (result.synced > 0) onSyncedRef.current();
    } catch (failure) {
      setError(messageOf(failure, 'The records on this device could not be sent'));
    }
  }, [syncEngine, userId, reload]);

  // Follow the engine: every step it takes may change what a row shows.
  useEffect(() => syncEngine.subscribe(() => {
    setStatus(syncEngine.status());
    void reload();
  }), [syncEngine, reload]);

  // List what is on the device, and send it if there is a connection: when the panel appears, when the
  // connection returns, and when the page reports a newly stored record.
  useEffect(() => {
    void reload();
    if (online) void sync();
  }, [online, reloadSignal, reload, sync]);

  const retry = async (item: QueuedInspection) => {
    await queueStore.markPending(item.clientId);
    await reload();
    if (online) await sync();
  };

  const discard = async (item: QueuedInspection) => {
    setConfirmingDiscard(null);
    await queueStore.discard(item.clientId);
    await reload();
  };

  const clearSynced = async () => {
    await queueStore.clearSynced();
    await reload();
  };

  /** Runs a button's action, reporting a device-store failure instead of leaving it unhandled. */
  const attempt = (action: () => Promise<void>) => {
    action().catch((failure: unknown) => setError(messageOf(failure, 'The change could not be made on this device')));
  };

  if (items.length === 0) return null;

  const waiting = items.filter((item) => item.state === 'PENDING').length;
  const anySynced = items.some((item) => item.state === 'SYNCED');

  return (
    <section className="panel device-queue" aria-labelledby="device-queue-heading">
      <div className="panel-heading device-queue-heading">
        <div>
          <h3 id="device-queue-heading">On this device</h3>
          {waiting > 0 && <span className="muted">{counted(waiting, 'record')} waiting to sync</span>}
        </div>
        <div className="form-actions">
          {anySynced && (
            <button type="button" className="button ghost" onClick={() => attempt(clearSynced)}>Clear synced</button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!online || status.running}
            onClick={() => void sync()}
          >
            Sync now
          </button>
        </div>
      </div>
      <ErrorAlert message={error} />
      {status.signInRequired && (
        <div className="alert offline" role="status">
          <span>{SIGN_IN_AGAIN}</span>{' '}
          <button type="button" className="button link" onClick={onSignInAgain}>Sign in again</button>
        </div>
      )}
      <ul className="device-queue-list">
        {items.map((item) => {
          const label = stateLabel(item, status);
          const mine = item.createdBy.id === userId;
          return (
            <li key={item.clientId} aria-label={`${item.location}, ${label}`}>
              <div className="device-queue-main">
                <strong>{item.projectName}</strong>
                <span className="subline">{item.location}</span>
              </div>
              <span className={`badge sync-${item.state.toLowerCase()}`}>{label}</span>
              <span className="muted">{counted(item.photoCount, 'photo')}</span>
              {item.state === 'FAILED' && item.lastError && <span className="field-error">{item.lastError}</span>}
              {item.state === 'SYNCED' && item.aiOutcome === 'FAILED' && <span className="muted">{AI_DRAFT_FAILED}</span>}
              {item.state === 'PENDING' && !mine && (
                <span className="muted">Captured by {item.createdBy.name}. It will be sent when they sign in.</span>
              )}
              {item.state !== 'SYNCED' && (
                <span className="device-queue-actions">
                  {item.state === 'FAILED' && mine && (
                    <button
                      type="button"
                      className="button link"
                      aria-label={`Retry ${item.location}`}
                      onClick={() => attempt(() => retry(item))}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="button link"
                    aria-label={`Discard ${item.location}`}
                    onClick={() => setConfirmingDiscard(item.clientId)}
                  >
                    Discard
                  </button>
                </span>
              )}
              {confirmingDiscard === item.clientId && (
                <div className="alert error device-queue-confirm">
                  <span>{CONFIRM_DISCARD}</span>{' '}
                  <button type="button" className="button link" onClick={() => attempt(() => discard(item))}>
                    Yes, discard
                  </button>
                  <button type="button" className="button link" onClick={() => setConfirmingDiscard(null)}>Keep</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
