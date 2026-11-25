import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import { ApiError } from '../api/api-error';
import type { Inspection } from '../api/types';
import { InspectionForm } from '../inspections/InspectionForm';
import { OfflineProvider } from '../offline/offline-context';
import { createFakeApi, PROJECT_ID, storedInspection, type FakeApi } from './fake-api';
import {
  createFakeOfflineServices,
  DOWNLOADED_PROJECT_ID,
  DOWNLOADED_SYSTEM_ID,
  FIXED_NOW,
  snapshot,
  type FakeOfflineServices
} from './offline-fakes';

const UNREACHABLE = new ApiError('The server could not be reached. Check your connection and try again.', 0);

let api: FakeApi;
let services: FakeOfflineServices;

beforeEach(() => {
  api = createFakeApi();
  services = createFakeOfflineServices();
});

function renderForm(initial: Inspection | null = null) {
  render(
    <ApiProvider api={api}>
      <OfflineProvider services={services}>
        <InspectionForm initial={initial} canEdit onClose={vi.fn()} onSaved={vi.fn()} />
      </OfflineProvider>
    </ApiProvider>
  );
  return userEvent.setup();
}

function registerIsUnreachable() {
  api.register.listProjects.mockRejectedValue(UNREACHABLE);
  api.register.listSystems.mockRejectedValue(UNREACHABLE);
}

function optionNames(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('Inspection form with a downloaded register', () => {
  it('AC-5.1 with no connection, the project picker is filled from the device', async () => {
    registerIsUnreachable();
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);

    renderForm();

    expect(await screen.findByRole('option', { name: 'DWN — Downloaded Tower' })).toBeInTheDocument();
    expect(optionNames(screen.getByLabelText('Project'))).toContain('EMP — Empty Annex');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-5.1 with no connection, choosing a project fills the system picker from the device', async () => {
    registerIsUnreachable();
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);
    const user = renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });

    await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);

    expect(await screen.findByRole('option', { name: 'SYS-11 — Concrete wall, Cable tray' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SYS-12 — Concrete floor, Copper pipe' })).toBeInTheDocument();
  });

  it('AC-5.1 with no connection, the chosen system\'s details come from the device', async () => {
    registerIsUnreachable();
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);
    const user = renderForm();
    await screen.findByRole('option', { name: 'DWN — Downloaded Tower' });
    await user.selectOptions(screen.getByLabelText('Project'), DOWNLOADED_PROJECT_ID);
    await screen.findByRole('option', { name: /SYS-11/ });

    await user.selectOptions(screen.getByLabelText('Firestop system'), DOWNLOADED_SYSTEM_ID);

    const details = screen.getByRole('group', { name: 'System details' });
    expect(within(details).getByText('Demo pillow K')).toBeInTheDocument();
    expect(within(details).getByText('-/90/90')).toBeInTheDocument();
    expect(within(details).getByText('Pack the tray opening with pillows.')).toBeInTheDocument();
  });

  it('AC-5.1 says that the list is the downloaded copy, and when it was downloaded', async () => {
    registerIsUnreachable();
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);

    renderForm();

    const note = await screen.findByText(/showing the register as downloaded to this device/);
    expect(note.querySelector('time')).toHaveAttribute('datetime', FIXED_NOW);
  });

  it('AC-5.1 with a connection, the pickers use the live register and no downloaded-copy note is shown', async () => {
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);

    renderForm();

    expect(await screen.findByRole('option', { name: /Harbour View Apartments/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'DWN — Downloaded Tower' })).not.toBeInTheDocument();
    expect(screen.queryByText(/showing the register as downloaded to this device/)).not.toBeInTheDocument();
  });

  it('AC-5.4 with no connection and nothing downloaded, the form says exactly that', async () => {
    registerIsUnreachable();

    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are offline and the register has not been downloaded to this device yet.'
    );
  });

  it('AC-5.1 with no connection, a stored record still shows its own project and system', async () => {
    registerIsUnreachable();
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);

    renderForm(storedInspection());

    expect(await screen.findByRole('heading', { name: 'Harbour View Apartments' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toHaveValue(PROJECT_ID);
    expect(within(screen.getByRole('group', { name: 'System details' })).getByText('Demo collar A')).toBeInTheDocument();
  });
});
