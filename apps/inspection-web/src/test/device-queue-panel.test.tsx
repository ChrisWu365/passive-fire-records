import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineProvider } from '../offline/offline-context';
import { DeviceQueuePanel } from '../offline/queue/DeviceQueuePanel';
import { QueueProvider } from '../offline/queue/queue-context';
import { userWithRole } from './fake-api';
import { createFakeOfflineServices, type FakeOfflineServices } from './offline-fakes';
import {
  createFakeQueueServices,
  draft,
  OTHER_USER,
  photo,
  SIGN_IN_EXPIRED,
  SYSTEM_INACTIVE,
  UNREACHABLE,
  type FakeQueueServices
} from './queue-fakes';

const SIGN_IN_AGAIN_NOTICE = 'Your sign-in has expired. Sign in again to send the records on this device.';

let offline: FakeOfflineServices;
let queue: FakeQueueServices;
let onSignInAgain: Mock<() => void>;
let onSynced: Mock<() => void>;

beforeEach(() => {
  offline = createFakeOfflineServices();
  queue = createFakeQueueServices();
  onSignInAgain = vi.fn();
  onSynced = vi.fn();
});

function renderPanel() {
  const view = render(
    <OfflineProvider services={offline}>
      <QueueProvider services={queue}>
        <DeviceQueuePanel user={userWithRole('INSPECTOR')} onSignInAgain={onSignInAgain} onSynced={onSynced} />
      </QueueProvider>
    </OfflineProvider>
  );
  return { user: userEvent.setup(), container: view.container };
}

function recordRow(location: string): HTMLElement {
  return screen.getByRole('listitem', { name: new RegExp(location) });
}

describe('Device queue panel: what is on the device', () => {
  it('AC-6.1 renders nothing when the device holds no records', async () => {
    const { container } = renderPanel();

    await vi.waitFor(() => expect(queue.server.calls).toEqual([]));
    expect(container).toBeEmptyDOMElement();
  });

  it('AC-6.1 renders nothing when the app runs without a device queue', () => {
    const { container } = render(
      <DeviceQueuePanel user={userWithRole('INSPECTOR')} onSignInAgain={onSignInAgain} onSynced={onSynced} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('AC-6.1 offline, a captured record is listed as "Pending sync" with its project, location and photos', async () => {
    offline.connectivity.set(false);
    await queue.queueStore.add(draft(), [photo('seal.png')]);

    renderPanel();

    expect(await screen.findByRole('heading', { name: 'On this device' })).toBeInTheDocument();
    const row = recordRow('Level 2 riser');
    expect(within(row).getByText('Harbour View Apartments')).toBeInTheDocument();
    expect(within(row).getByText('Pending sync')).toBeInTheDocument();
    expect(within(row).getByText('1 photo')).toBeInTheDocument();
    expect(screen.getByText('1 record waiting to sync')).toBeInTheDocument();
    expect(queue.server.calls).toEqual([]);
  });

  it('AC-6.1 counts every record that is still waiting', async () => {
    offline.connectivity.set(false);
    await queue.queueStore.add(draft({ location: 'First' }), []);
    await queue.queueStore.add(draft({ location: 'Second' }), []);

    renderPanel();

    expect(await screen.findByText('2 records waiting to sync')).toBeInTheDocument();
  });
});

describe('Device queue panel: sending', () => {
  it('AC-6.1 online, the records are sent as soon as the panel appears, with no user action', async () => {
    await queue.queueStore.add(draft(), [photo('seal.png')]);

    renderPanel();

    expect(await within(await screen.findByRole('listitem', { name: /Level 2 riser/ })).findByText('Synced'))
      .toBeInTheDocument();
    expect(queue.server.records).toHaveLength(1);
    expect(queue.server.records[0].photos).toEqual(['/uploads/seal.png']);
    expect(onSynced).toHaveBeenCalled();
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument();
  });

  it('AC-6.1 when the connection returns, the records are sent with no user action', async () => {
    offline.connectivity.set(false);
    await queue.queueStore.add(draft(), [photo('seal.png')]);
    renderPanel();
    await screen.findByText('Pending sync');

    act(() => offline.connectivity.set(true));

    expect(await within(recordRow('Level 2 riser')).findByText('Synced')).toBeInTheDocument();
    expect(queue.server.records).toHaveLength(1);
  });

  it('AC-6.1 a record being sent is shown as "Syncing"', async () => {
    await queue.queueStore.add(draft(), []);
    queue.server.hold();

    renderPanel();

    expect(await screen.findByText('Syncing')).toBeInTheDocument();
    queue.server.release();
    expect(await screen.findByText('Synced')).toBeInTheDocument();
  });

  it('AC-6.2 when the server cannot be reached, the record stays "Pending sync" and "Sync now" tries again', async () => {
    await queue.queueStore.add(draft(), [photo('seal.png')]);
    queue.server.failNext('create', UNREACHABLE);
    const { user } = renderPanel();
    await vi.waitFor(() => expect(queue.server.calls).toHaveLength(1));
    expect(await screen.findByText('Pending sync')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(queue.server.records).toHaveLength(1);
  });

  it('AC-6.1 offline, "Sync now" is disabled', async () => {
    offline.connectivity.set(false);
    await queue.queueStore.add(draft(), []);

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeDisabled();
  });
});

describe('Device queue panel: a record the server refused', () => {
  beforeEach(async () => {
    await queue.queueStore.add(draft(), [photo('seal.png')]);
    queue.server.failNext('create', SYSTEM_INACTIVE);
  });

  it('AC-6.3 is shown as "Sync failed" with the server\'s reason, and stays on the device', async () => {
    renderPanel();

    const row = await screen.findByRole('listitem', { name: /Level 2 riser/ });
    expect(await within(row).findByText('Sync failed')).toBeInTheDocument();
    expect(within(row).getByText('Firestop system is inactive')).toBeInTheDocument();
    expect(await queue.queueStore.list()).toHaveLength(1);
    expect(onSynced).not.toHaveBeenCalled();
  });

  it('AC-6.3 "Retry" sends it again', async () => {
    const { user } = renderPanel();
    await screen.findByText('Sync failed');

    await user.click(screen.getByRole('button', { name: 'Retry Level 2 riser' }));

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(queue.server.records[0].photos).toEqual(['/uploads/seal.png']);
  });

  it('AC-6.3 "Discard" asks first, and "Keep" leaves the record where it is', async () => {
    const { user } = renderPanel();
    await screen.findByText('Sync failed');

    await user.click(screen.getByRole('button', { name: 'Discard Level 2 riser' }));
    expect(screen.getByText('Discard this record and its photos? This cannot be undone.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep' }));

    expect(screen.queryByText('Discard this record and its photos? This cannot be undone.')).not.toBeInTheDocument();
    expect(await queue.queueStore.list()).toHaveLength(1);
  });

  it('AC-6.3 confirming "Discard" removes the record and its photos from the device', async () => {
    const { user, container } = renderPanel();
    await screen.findByText('Sync failed');
    const [queued] = await queue.queueStore.list();

    await user.click(screen.getByRole('button', { name: 'Discard Level 2 riser' }));
    await user.click(screen.getByRole('button', { name: 'Yes, discard' }));

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(await queue.queueStore.list()).toEqual([]);
    expect(await queue.queueStore.photos(queued.clientId)).toEqual([]);
    expect(queue.server.records).toEqual([]);
  });
});

describe('Device queue panel: after sending', () => {
  it('AC-6.4 a record whose AI draft failed is shown as synced, with what to do about the draft', async () => {
    await queue.queueStore.add(draft(), []);
    queue.server.aiProviderDown = true;

    renderPanel();

    const row = await screen.findByRole('listitem', { name: /Level 2 riser/ });
    expect(await within(row).findByText('Synced')).toBeInTheDocument();
    expect(within(row).getByText('The AI draft failed. Open the record to try again.')).toBeInTheDocument();
  });

  it('AC-6.1 "Clear synced" removes the records that are safely on the server', async () => {
    await queue.queueStore.add(draft(), []);
    const { user, container } = renderPanel();
    await screen.findByText('Synced');

    await user.click(screen.getByRole('button', { name: 'Clear synced' }));

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(await queue.queueStore.list()).toEqual([]);
    expect(queue.server.records).toHaveLength(1);
  });
});

describe('Device queue panel: sign-in and other users', () => {
  it('AC-6.5 an expired sign-in shows a prompt to sign in again, and the record stays "Pending sync"', async () => {
    await queue.queueStore.add(draft(), [photo('seal.png')]);
    queue.server.failNext('create', SIGN_IN_EXPIRED);
    const { user } = renderPanel();

    expect(await screen.findByText(SIGN_IN_AGAIN_NOTICE)).toBeInTheDocument();
    expect(screen.getByText('Pending sync')).toBeInTheDocument();
    expect(await queue.queueStore.list()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(onSignInAgain).toHaveBeenCalledTimes(1);
  });

  it('AC-6.5 a record captured by someone else is listed but not sent, and says whose it is', async () => {
    await queue.queueStore.add(draft({ createdBy: { ...OTHER_USER } }), []);

    renderPanel();

    const row = await screen.findByRole('listitem', { name: /Level 2 riser/ });
    expect(within(row).getByText('Captured by Other Installer. It will be sent when they sign in.')).toBeInTheDocument();
    await vi.waitFor(() => expect(queue.syncEngine.status().running).toBe(false));
    expect(queue.server.records).toEqual([]);
  });
});
