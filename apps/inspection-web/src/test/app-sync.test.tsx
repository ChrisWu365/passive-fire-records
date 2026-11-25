import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { createFakeApi, signInAs, type FakeApi } from './fake-api';
import {
  createFakeOfflineServices,
  DOWNLOADED_PROJECT_ID,
  DOWNLOADED_SYSTEM_ID,
  FIXED_NOW,
  snapshot,
  type FakeOfflineServices
} from './offline-fakes';
import {
  createFakeQueueServices,
  draft,
  photo,
  SIGN_IN_EXPIRED,
  UNREACHABLE,
  type FakeQueueServices
} from './queue-fakes';

const SAVED_ON_DEVICE = 'Saved on this device. It will be sent when you are back online.';
const SIGN_IN_AGAIN_NOTICE = 'Your sign-in has expired. Sign in again to send the records on this device.';

let api: FakeApi;
let offline: FakeOfflineServices;
let queue: FakeQueueServices;

beforeEach(() => {
  localStorage.clear();
  api = createFakeApi();
  offline = createFakeOfflineServices();
  queue = createFakeQueueServices();
});

function renderApp() {
  render(<App api={api} offline={offline} queue={queue} />);
  return userEvent.setup();
}

async function goOffline() {
  offline.connectivity.set(false);
  api.inspections.list.mockRejectedValue(UNREACHABLE);
  api.inspections.create.mockRejectedValue(UNREACHABLE);
  api.register.listProjects.mockRejectedValue(UNREACHABLE);
  api.register.listSystems.mockRejectedValue(UNREACHABLE);
  await offline.snapshotStore.replace(snapshot(), FIXED_NOW);
}

function comeBackOnline() {
  api.inspections.list.mockReset();
  api.inspections.list.mockImplementation(async () => queue.server.list());
  act(() => offline.connectivity.set(true));
}

describe('App: capturing offline and sending later', () => {
  it('AC-6.1 a record captured offline is listed on the device, and sent by itself when the connection returns', async () => {
    await goOffline();
    signInAs('INSPECTOR');
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: '+ New inspection' }));
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });
    await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);
    await screen.findByRole('option', { name: /SYS-11/ });
    await user.selectOptions(screen.getByLabelText('Firestop system'), DOWNLOADED_SYSTEM_ID);
    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
    await user.upload(screen.getByLabelText('Site photos'), new File(['x'], 'seal.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    // Saved on the device: the dialog closes, and the record is listed as waiting.
    expect(await screen.findByText(SAVED_ON_DEVICE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const row = await screen.findByRole('listitem', { name: /Level 2 riser/ });
    expect(within(row).getByText('Pending sync')).toBeInTheDocument();
    expect(within(row).getByText('Downloaded Tower')).toBeInTheDocument();
    expect(queue.server.records).toEqual([]);

    comeBackOnline();

    expect(await within(row).findByText('Synced')).toBeInTheDocument();
    expect(queue.server.records).toHaveLength(1);
    expect(queue.server.records[0]).toMatchObject({
      location: 'Level 2 riser', photos: ['/uploads/seal.png'], aiStatus: 'DONE', capturedAt: FIXED_NOW
    });
  });

  it('AC-6.1 once sent, the record shows up in the server list without a reload', async () => {
    await goOffline();
    await queue.queueStore.add(draft({ location: 'Captured earlier' }), [photo('seal.png')]);
    signInAs('INSPECTOR');
    renderApp();
    await screen.findByText('Pending sync');

    comeBackOnline();

    expect(await screen.findByRole('row', { name: /Captured earlier/ })).toBeInTheDocument();
  });

  it('AC-6.1 records left on the device are sent when the app is opened online', async () => {
    await queue.queueStore.add(draft({ location: 'From the last visit' }), [photo('seal.png')]);
    signInAs('INSPECTOR');

    renderApp();

    expect(await within(await screen.findByRole('listitem', { name: /From the last visit/ })).findByText('Synced'))
      .toBeInTheDocument();
    expect(queue.server.records).toHaveLength(1);
  });

  it('AC-6.1 the sign-in page does not show the device\'s records', async () => {
    await queue.queueStore.add(draft(), []);

    renderApp();

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'On this device' })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(queue.server.calls).toEqual([]));
  });
});

describe('App: the sign-in expired while offline', () => {
  it('AC-6.5 prompts to sign in again, keeps the record, and sends it after the new sign-in', async () => {
    await queue.queueStore.add(draft(), [photo('seal.png')]);
    queue.server.failNext('create', SIGN_IN_EXPIRED);
    signInAs('INSPECTOR');
    const user = renderApp();

    expect(await screen.findByText(SIGN_IN_AGAIN_NOTICE)).toBeInTheDocument();
    expect(await queue.queueStore.list()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(await queue.queueStore.list()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await within(await screen.findByRole('listitem', { name: /Level 2 riser/ })).findByText('Synced'))
      .toBeInTheDocument();
    expect(queue.server.records).toHaveLength(1);
    expect(screen.queryByText(SIGN_IN_AGAIN_NOTICE)).not.toBeInTheDocument();
  });
});
