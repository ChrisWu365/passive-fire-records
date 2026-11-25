import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import { ApiError } from '../api/api-error';
import type { Inspection } from '../api/types';
import { InspectionForm } from '../inspections/InspectionForm';
import { OfflineProvider } from '../offline/offline-context';
import { QueueProvider } from '../offline/queue/queue-context';
import type { QueuedInspection } from '../offline/queue/queued-inspection';
import { createFakeApi, PROJECT_ID, storedInspection, SYSTEM_ID, type FakeApi } from './fake-api';
import {
  createFakeOfflineServices,
  DOWNLOADED_PROJECT_ID,
  DOWNLOADED_SYSTEM_ID,
  FIXED_NOW,
  snapshot,
  type FakeOfflineServices
} from './offline-fakes';
import { CAPTURED_AT, createFakeQueueServices, INSPECTOR, UNREACHABLE, type FakeQueueServices } from './queue-fakes';

const EXISTING_NEEDS_CONNECTION =
  'You are offline. A record that is already on the server can be changed only while online.';

let api: FakeApi;
let offline: FakeOfflineServices;
let queue: FakeQueueServices;
let onSaved: Mock<(inspection: Inspection) => void>;
let onQueued: Mock<(queued: QueuedInspection) => void>;

beforeEach(() => {
  api = createFakeApi();
  offline = createFakeOfflineServices();
  queue = createFakeQueueServices();
  onSaved = vi.fn();
  onQueued = vi.fn();
});

function renderForm(initial: Inspection | null = null, withQueue = true) {
  if (initial) api.state.inspections = [initial];
  const form = (
    <InspectionForm
      initial={initial}
      canEdit
      onClose={vi.fn()}
      onSaved={onSaved}
      capturedBy={{ ...INSPECTOR }}
      onQueued={onQueued}
    />
  );
  render(
    <ApiProvider api={api}>
      <OfflineProvider services={offline}>
        {withQueue ? <QueueProvider services={queue}>{form}</QueueProvider> : form}
      </OfflineProvider>
    </ApiProvider>
  );
  return userEvent.setup();
}

/** No connection: the browser says offline, every request fails, and the register was downloaded earlier. */
async function goOffline() {
  offline.connectivity.set(false);
  api.register.listProjects.mockRejectedValue(UNREACHABLE);
  api.register.listSystems.mockRejectedValue(UNREACHABLE);
  api.inspections.create.mockRejectedValue(UNREACHABLE);
  api.inspections.update.mockRejectedValue(UNREACHABLE);
  await offline.snapshotStore.replace(snapshot(), FIXED_NOW);
}

async function fillFromDevice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });
  await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);
  await screen.findByRole('option', { name: /SYS-11/ });
  await user.selectOptions(screen.getByLabelText('Firestop system'), DOWNLOADED_SYSTEM_ID);
  await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
  await user.type(screen.getByLabelText('Inspection notes'), 'Sealed on site.');
}

async function fillFromLiveRegister(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /Harbour View Apartments/ });
  await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);
  await screen.findByRole('option', { name: /SYS-01/ });
  await user.selectOptions(screen.getByLabelText('Firestop system'), SYSTEM_ID);
  await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
}

describe('Inspection form: capturing a record with no connection', () => {
  it('AC-6.1 saving offline stores the record on the device, PENDING, and sends nothing', async () => {
    await goOffline();
    const user = renderForm();
    await fillFromDevice(user);
    await user.clear(screen.getByLabelText('AI instruction'));
    await user.type(screen.getByLabelText('AI instruction'), 'Describe the seal.');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalledTimes(1));
    const stored = await queue.queueStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      projectId: DOWNLOADED_PROJECT_ID,
      projectName: 'Downloaded Tower',
      systemId: DOWNLOADED_SYSTEM_ID,
      system: {
        code: 'SYS-11',
        substrate: 'Concrete wall',
        serviceType: 'Cable tray',
        fireRating: '-/90/90',
        materials: 'Demo pillow K',
        installationMethod: 'Pack the tray opening with pillows.'
      },
      location: 'Level 2 riser',
      notes: 'Sealed on site.',
      status: 'DRAFT',
      observations: [],
      aiInstruction: 'Describe the seal.',
      createdBy: { ...INSPECTOR },
      state: 'PENDING',
      photoCount: 0
    });
    expect(onQueued).toHaveBeenCalledWith(stored[0]);
    expect(api.inspections.create).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('AC-6.6 the capture time is the moment the record was saved on the device', async () => {
    await goOffline();
    const user = renderForm();
    await fillFromDevice(user);

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalled());
    expect((await queue.queueStore.list())[0].capturedAt).toBe(CAPTURED_AT);
  });

  it('AC-6.1 offline, photos can be attached before the record is saved, and are stored with it', async () => {
    await goOffline();
    const user = renderForm();
    await fillFromDevice(user);
    const file = new File([new Uint8Array([7, 8, 9])], 'seal.png', { type: 'image/png' });

    expect(screen.getByLabelText('Site photos')).toBeEnabled();
    await user.upload(screen.getByLabelText('Site photos'), file);
    expect(await screen.findByText('seal.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalled());
    const [stored] = await queue.queueStore.list();
    const photos = await queue.queueStore.photos(stored.clientId);
    expect(stored.photoCount).toBe(1);
    expect(photos.map((item) => [item.fileName, item.mimeType, Array.from(item.bytes)])).toEqual([
      ['seal.png', 'image/png', [7, 8, 9]]
    ]);
    expect(api.inspections.uploadPhotos).not.toHaveBeenCalled();
  });

  it('AC-6.1 offline, a photo chosen by mistake can be removed before saving', async () => {
    await goOffline();
    const user = renderForm();
    await fillFromDevice(user);
    await user.upload(screen.getByLabelText('Site photos'), [
      new File(['a'], 'first.png', { type: 'image/png' }),
      new File(['b'], 'second.png', { type: 'image/png' })
    ]);

    await user.click(await screen.findByRole('button', { name: 'Remove photo 1' }));
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalled());
    const [stored] = await queue.queueStore.list();
    expect((await queue.queueStore.photos(stored.clientId)).map((item) => item.fileName)).toEqual(['second.png']);
  });

  it('AC-6.1 offline, more than five photos are refused before anything is stored', async () => {
    await goOffline();
    const user = renderForm();
    await fillFromDevice(user);
    const six = Array.from({ length: 6 }, (_, index) => new File(['x'], `p${index}.png`, { type: 'image/png' }));

    await user.upload(screen.getByLabelText('Site photos'), six);

    expect(await screen.findByRole('alert')).toHaveTextContent('at most 5 photos');
    expect(screen.queryByText('p0.png')).not.toBeInTheDocument();
  });

  it('AC-6.1 offline, the AI draft cannot be requested yet, and the form says when it will be', async () => {
    await goOffline();
    renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });

    expect(screen.getByRole('button', { name: /Generate AI draft/ })).toBeDisabled();
    expect(screen.getByText('The AI draft will be requested when this record syncs.')).toBeInTheDocument();
    expect(screen.getByLabelText('AI instruction')).toBeEnabled();
  });

  it('AC-6.1 offline, an incomplete record is not stored: the form says what is missing', async () => {
    await goOffline();
    const user = renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a project, a firestop system and enter a location');
    expect(await queue.queueStore.list()).toEqual([]);
    expect(onQueued).not.toHaveBeenCalled();
  });
});

describe('Inspection form: the connection drops as the record is saved', () => {
  it('AC-6.1 online, when the save cannot reach the server, the record is stored on the device instead', async () => {
    api.inspections.create.mockRejectedValue(UNREACHABLE);
    const user = renderForm();
    await fillFromLiveRegister(user);

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalledTimes(1));
    expect(api.inspections.create).toHaveBeenCalledTimes(1);
    expect((await queue.queueStore.list())[0]).toMatchObject({
      projectId: PROJECT_ID, projectName: 'Harbour View Apartments', systemId: SYSTEM_ID,
      system: { code: 'SYS-01', materials: 'Demo collar A' }, location: 'Level 2 riser', state: 'PENDING'
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-6.3 online, a record the server refuses is not stored on the device: the refusal is shown', async () => {
    api.inspections.create.mockRejectedValue(new ApiError('Firestop system is inactive', 422));
    const user = renderForm();
    await fillFromLiveRegister(user);

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestop system is inactive');
    expect(await queue.queueStore.list()).toEqual([]);
    expect(onQueued).not.toHaveBeenCalled();
  });

  it('AC-6.1 online, a normal save goes to the server and nothing is stored on the device', async () => {
    const user = renderForm();
    await fillFromLiveRegister(user);

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(api.inspections.create).toHaveBeenCalledTimes(1);
    expect(await queue.queueStore.list()).toEqual([]);
    expect(onQueued).not.toHaveBeenCalled();
  });

  it('AC-6.1 online, photos are still attached after the first save, as before', async () => {
    renderForm();
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    expect(screen.getByLabelText('Site photos')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Generate AI draft/ })).toBeEnabled();
  });
});

describe('Inspection form: what offline capture does not cover', () => {
  it('AC-6.1 offline, a record already on the server cannot be changed, and the form says why', async () => {
    await goOffline();
    const user = renderForm(storedInspection());
    await screen.findByRole('heading', { name: 'Harbour View Apartments' });
    await user.type(screen.getByLabelText('Inspection notes'), ' More.');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(EXISTING_NEEDS_CONNECTION);
    expect(api.inspections.update).not.toHaveBeenCalled();
    expect(await queue.queueStore.list()).toEqual([]);
  });

  it('AC-6.1 without a device queue, an offline save fails with the plain connection message', async () => {
    await goOffline();
    const user = renderForm(null, false);
    await fillFromDevice(user);

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not be reached');
    expect(onQueued).not.toHaveBeenCalled();
  });
});
