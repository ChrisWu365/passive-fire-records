import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import type { Inspection } from '../api/types';
import { InspectionForm } from '../inspections/InspectionForm';
import { OfflineProvider } from '../offline/offline-context';
import { QueueProvider } from '../offline/queue/queue-context';
import type { QueuedInspection } from '../offline/queue/queued-inspection';
import {
  AREA_ID,
  createFakeApi,
  INACTIVE_AREA_ID,
  PROJECT_ID,
  SECOND_AREA_ID,
  SECOND_PROJECT_ID,
  storedInspection,
  SYSTEM_ID,
  type FakeApi
} from './fake-api';
import {
  createFakeOfflineServices,
  DOWNLOADED_AREA_ID,
  DOWNLOADED_PROJECT_ID,
  DOWNLOADED_SYSTEM_ID,
  FIXED_NOW,
  snapshot,
  type FakeOfflineServices
} from './offline-fakes';
import { createFakeQueueServices, INSPECTOR, UNREACHABLE, type FakeQueueServices } from './queue-fakes';

type User = ReturnType<typeof userEvent.setup>;

const AREA_PICKER = 'Level / area';
const NO_AREA = 'No area';

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

function renderForm(initial: Inspection | null = null, canEdit = true) {
  if (initial) api.state.inspections = [initial];
  render(
    <ApiProvider api={api}>
      <OfflineProvider services={offline}>
        <QueueProvider services={queue}>
          <InspectionForm
            initial={initial}
            canEdit={canEdit}
            onClose={vi.fn()}
            onSaved={onSaved}
            capturedBy={{ ...INSPECTOR }}
            onQueued={onQueued}
          />
        </QueueProvider>
      </OfflineProvider>
    </ApiProvider>
  );
  return userEvent.setup();
}

function areaPicker(): HTMLElement {
  return screen.getByLabelText(AREA_PICKER);
}

function optionNames(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((option) => option.textContent ?? '');
}

/** Picks Harbour View and SYS-01 from the live register, and waits for the project's areas. */
async function chooseHarbourView(user: User) {
  await screen.findByRole('option', { name: /Harbour View Apartments/ });
  await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);
  await screen.findByRole('option', { name: /SYS-01/ });
  await user.selectOptions(screen.getByLabelText('Firestop system'), SYSTEM_ID);
  await within(areaPicker()).findByRole('option', { name: 'Level 3' });
}

/** No connection: the browser says offline, every request fails, and the register was downloaded earlier. */
async function goOffline() {
  offline.connectivity.set(false);
  api.register.listProjects.mockRejectedValue(UNREACHABLE);
  api.register.listSystems.mockRejectedValue(UNREACHABLE);
  api.register.listAreas.mockRejectedValue(UNREACHABLE);
  api.inspections.create.mockRejectedValue(UNREACHABLE);
  await offline.snapshotStore.replace(snapshot(), FIXED_NOW);
}

describe('Inspection form: choosing a level or area', () => {
  it('AC-9.6 the area picker is disabled, and no areas are asked for, until a project is chosen', async () => {
    renderForm();
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    expect(areaPicker()).toBeDisabled();
    expect(api.register.listAreas).not.toHaveBeenCalled();
  });

  it('AC-9.6 choosing a project fills the picker with that project\'s active areas, after "No area"', async () => {
    const user = renderForm();

    await chooseHarbourView(user);

    expect(api.register.listAreas).toHaveBeenCalledWith(PROJECT_ID);
    expect(optionNames(areaPicker())).toEqual([NO_AREA, 'Basement car park', 'Level 3']);
    expect(areaPicker()).toBeEnabled();
    expect(areaPicker()).toHaveValue('');
  });

  it('AC-9.6 changing the project clears the chosen area and offers the new project\'s areas', async () => {
    const user = renderForm();
    await chooseHarbourView(user);
    await user.selectOptions(areaPicker(), AREA_ID);

    await user.selectOptions(screen.getByLabelText('Project'), SECOND_PROJECT_ID);

    expect(await within(areaPicker()).findByRole('option', { name: 'Ground floor' })).toBeInTheDocument();
    expect(areaPicker()).toHaveValue('');
    expect(optionNames(areaPicker())).toEqual([NO_AREA, 'Ground floor']);
  });

  it('AC-9.6 the area field comes before the location field, which is kept for the detail', async () => {
    const user = renderForm();
    await chooseHarbourView(user);

    const position = areaPicker().compareDocumentPosition(screen.getByLabelText('Location'));

    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-9.3 saving a new record with an area sends the area id and shows the stored area', async () => {
    const user = renderForm();
    await chooseHarbourView(user);

    await user.selectOptions(areaPicker(), AREA_ID);
    await user.type(screen.getByLabelText('Location'), 'Riser cupboard R4-12');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(api.inspections.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, areaId: AREA_ID, location: 'Riser cupboard R4-12' })
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ areaId: AREA_ID, areaName: 'Level 3' }));
    expect(areaPicker()).toHaveValue(AREA_ID);
  });

  it('AC-9.5 saving a new record with "No area" sends no area at all', async () => {
    const user = renderForm();
    await chooseHarbourView(user);

    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await screen.findByText('Saved');
    expect(api.inspections.create.mock.calls[0][0]).not.toHaveProperty('areaId');
  });

  it('AC-9.5 choosing an area does not replace the location: a record still needs one', async () => {
    const user = renderForm();
    await chooseHarbourView(user);

    await user.selectOptions(areaPicker(), AREA_ID);
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a project, a firestop system and enter a location.');
    expect(api.inspections.create).not.toHaveBeenCalled();
  });
});

describe('Inspection form: a stored record\'s area', () => {
  it('AC-9.6 opening a record shows its area selected', async () => {
    renderForm(storedInspection({ areaId: AREA_ID, areaName: 'Level 3' }));

    await within(areaPicker()).findByRole('option', { name: 'Basement car park' });

    expect(areaPicker()).toHaveValue(AREA_ID);
  });

  it('AC-9.5 opening a record with no area shows "No area" selected', async () => {
    renderForm(storedInspection());

    await within(areaPicker()).findByRole('option', { name: 'Level 3' });

    expect(areaPicker()).toHaveValue('');
  });

  it('AC-9.6 a record whose area was deactivated since still shows its own area, marked inactive', async () => {
    renderForm(storedInspection({ areaId: INACTIVE_AREA_ID, areaName: 'Old site office' }));

    await within(areaPicker()).findByRole('option', { name: 'Level 3' });

    expect(areaPicker()).toHaveValue(INACTIVE_AREA_ID);
    expect(optionNames(areaPicker())).toEqual([NO_AREA, 'Old site office (inactive)', 'Basement car park', 'Level 3']);
  });

  it('AC-9.6 a record whose area the register no longer lists shows the name the record kept', async () => {
    api.state.areas = api.state.areas.filter((area) => area.id !== AREA_ID);
    renderForm(storedInspection({ areaId: AREA_ID, areaName: 'Level 3' }));

    await within(areaPicker()).findByRole('option', { name: 'Basement car park' });

    expect(areaPicker()).toHaveValue(AREA_ID);
    expect(optionNames(areaPicker())).toEqual([NO_AREA, 'Level 3', 'Basement car park']);
  });

  it('AC-9.3 saving an edit that keeps the area sends the same area id', async () => {
    const user = renderForm(storedInspection({ areaId: AREA_ID, areaName: 'Level 3' }));
    await within(areaPicker()).findByRole('option', { name: 'Basement car park' });

    await user.type(screen.getByLabelText('Inspection notes'), ' Checked again.');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await screen.findByText('Saved');
    expect(api.inspections.update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ areaId: AREA_ID }));
  });

  it('AC-9.3 changing the area of a stored record sends the new area id', async () => {
    const user = renderForm(storedInspection({ areaId: AREA_ID, areaName: 'Level 3' }));
    await within(areaPicker()).findByRole('option', { name: 'Basement car park' });

    await user.selectOptions(areaPicker(), SECOND_AREA_ID);
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await screen.findByText('Saved');
    expect(api.inspections.update).toHaveBeenCalledWith(
      expect.any(String), expect.objectContaining({ areaId: SECOND_AREA_ID })
    );
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ areaName: 'Basement car park' }));
  });

  it('AC-9.5 choosing "No area" on a stored record sends no area', async () => {
    const user = renderForm(storedInspection({ areaId: AREA_ID, areaName: 'Level 3' }));
    await within(areaPicker()).findByRole('option', { name: 'Basement car park' });

    await user.selectOptions(areaPicker(), '');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await screen.findByText('Saved');
    expect(api.inspections.update.mock.calls[0][1]).not.toHaveProperty('areaId');
  });

  it('AC-9.6 a viewer sees the record\'s area but cannot change it', async () => {
    renderForm(storedInspection({ areaId: AREA_ID, areaName: 'Level 3' }), false);

    await within(areaPicker()).findByRole('option', { name: 'Level 3' });

    expect(areaPicker()).toBeDisabled();
    expect(areaPicker()).toHaveValue(AREA_ID);
  });
});

describe('Inspection form: areas with no connection', () => {
  it('AC-9.7 with no connection, choosing a project fills the area picker from the device', async () => {
    await goOffline();
    const user = renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });

    await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);

    expect(await within(areaPicker()).findByRole('option', { name: 'Podium level' })).toBeInTheDocument();
    expect(optionNames(areaPicker())).toEqual([NO_AREA, 'Basement plant room', 'Podium level']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-9.7 a record captured offline with an area is stored on the device with the area id and name', async () => {
    await goOffline();
    const user = renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });
    await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);
    await screen.findByRole('option', { name: /SYS-11/ });
    await user.selectOptions(screen.getByLabelText('Firestop system'), DOWNLOADED_SYSTEM_ID);
    await within(areaPicker()).findByRole('option', { name: 'Podium level' });

    await user.selectOptions(areaPicker(), DOWNLOADED_AREA_ID);
    await user.type(screen.getByLabelText('Location'), 'Riser 2, north wall');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalledTimes(1));
    expect(await queue.queueStore.list()).toEqual([
      expect.objectContaining({
        areaId: DOWNLOADED_AREA_ID, areaName: 'Podium level', location: 'Riser 2, north wall', state: 'PENDING'
      })
    ]);
    expect(api.inspections.create).not.toHaveBeenCalled();
  });

  it('AC-9.7 a record captured offline with "No area" is stored on the device without one', async () => {
    await goOffline();
    const user = renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });
    await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);
    await screen.findByRole('option', { name: /SYS-11/ });
    await user.selectOptions(screen.getByLabelText('Firestop system'), DOWNLOADED_SYSTEM_ID);

    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    await vi.waitFor(() => expect(onQueued).toHaveBeenCalledTimes(1));
    expect((await queue.queueStore.list())[0]).toMatchObject({ areaId: null, areaName: null });
  });
});
