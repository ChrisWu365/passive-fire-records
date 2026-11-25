import { useEffect, useState } from 'react';
import { ErrorAlert, messageOf, StatusMessage } from '../components/feedback';
import { useOffline, type OfflineServices } from './offline-context';
import { isNetworkFailure } from './reachability';
import type { SnapshotInfo } from './snapshot';
import { downloadSnapshot } from './snapshot-download';
import { useOnline } from './use-online';

const NOT_DOWNLOADED = 'The register has not been downloaded to this device yet.';
const SAVED = 'The register is saved on this device.';
const CONNECT_FIRST = 'Connect to a network to download the register.';
const UNREACHABLE =
  'The register could not be downloaded because the server could not be reached. '
  + 'The copy on this device is unchanged.';

/**
 * Shows whether the device is online, what it has downloaded and when, and the "Download for offline"
 * button. It uses the offline services from useOffline() and renders nothing when there are none.
 */
export function OfflinePanel() {
  const services = useOffline();
  return services ? <Panel services={services} /> : null;
}

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function Panel({ services }: { services: OfflineServices }) {
  const online = useOnline();
  const [info, setInfo] = useState<SnapshotInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    services.snapshotStore.info()
      .then((stored) => { if (!cancelled) setInfo(stored); })
      .catch((failure: unknown) => {
        if (!cancelled) setError(messageOf(failure, 'The copy on this device could not be read'));
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [services]);

  const download = async () => {
    setDownloading(true);
    setMessage('');
    setError('');
    try {
      setInfo(await downloadSnapshot(services.snapshotSource, services.snapshotStore, services.now));
      setMessage(SAVED);
    } catch (failure) {
      setError(isNetworkFailure(failure) ? UNREACHABLE : messageOf(failure, 'The register could not be downloaded'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="offline-panel" aria-label="Offline use">
      <div className="offline-summary">
        <span className={`connectivity ${online ? 'online' : 'offline'}`}>{online ? 'Online' : 'Offline'}</span>
        {loaded && (info ? <DownloadedInfo info={info} /> : <span className="muted">{NOT_DOWNLOADED}</span>)}
      </div>
      <div className="offline-actions">
        {!online && <span className="muted">{CONNECT_FIRST}</span>}
        <button
          type="button"
          className="button secondary"
          disabled={!online || downloading}
          onClick={() => void download()}
        >
          Download for offline
        </button>
      </div>
      <ErrorAlert message={error} />
      <StatusMessage message={message} />
    </section>
  );
}

function DownloadedInfo({ info }: { info: SnapshotInfo }) {
  return (
    <span className="muted">
      Register downloaded{' '}
      <time dateTime={info.downloadedAt}>{new Date(info.downloadedAt).toLocaleString()}</time>
      {' · '}
      <span>{counted(info.projectCount, 'project')}, {counted(info.systemCount, 'system')}</span>
    </span>
  );
}
