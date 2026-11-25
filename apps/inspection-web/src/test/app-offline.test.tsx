import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { ApiError } from '../api/api-error';
import { createFakeApi, signInAs, storedInspection, type FakeApi } from './fake-api';
import { createFakeOfflineServices, FIXED_NOW, snapshot, type FakeOfflineServices } from './offline-fakes';

const UNREACHABLE = new ApiError('The server could not be reached. Check your connection and try again.', 0);
const LIST_NEEDS_CONNECTION = 'You are offline. The inspections list will load when you are back online.';
const REGISTER_NEEDS_CONNECTION = 'You are offline. The register can be viewed and changed only while online.';

let api: FakeApi;
let services: FakeOfflineServices;

beforeEach(() => {
  localStorage.clear();
  api = createFakeApi();
  services = createFakeOfflineServices();
});

function renderApp() {
  render(<App api={api} offline={services} />);
  return userEvent.setup();
}

function everythingIsUnreachable() {
  services.connectivity.set(false);
  api.inspections.list.mockRejectedValue(UNREACHABLE);
  api.register.listProjects.mockRejectedValue(UNREACHABLE);
  api.register.listSystems.mockRejectedValue(UNREACHABLE);
}

describe('App with offline services', () => {
  it('AC-5.1 shows the offline panel, with the download button, on the inspections page', async () => {
    signInAs('INSPECTOR');
    renderApp();

    expect(await screen.findByRole('button', { name: 'Download for offline' })).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('AC-5.1 a viewer is offered the download too, since viewers may read the register', async () => {
    signInAs('VIEWER');
    renderApp();

    expect(await screen.findByRole('button', { name: 'Download for offline' })).toBeInTheDocument();
  });

  it('AC-5.1 the sign-in page shows no offline panel', () => {
    renderApp();

    expect(screen.queryByRole('button', { name: 'Download for offline' })).not.toBeInTheDocument();
  });

  it('AC-5.1 someone already signed in opens the workspace with no connection at all', async () => {
    everythingIsUnreachable();
    signInAs('INSPECTOR');

    renderApp();

    expect(await screen.findByText('Recent inspections')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(api.auth.login).not.toHaveBeenCalled();
  });

  it('AC-5.1 offline, a new record can be started and its pickers are filled from the device', async () => {
    everythingIsUnreachable();
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);
    signInAs('INSPECTOR');
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: '+ New inspection' }));

    expect(await screen.findByRole('option', { name: 'DWN — Downloaded Tower' })).toBeInTheDocument();
  });
});

describe('App: pages that need the network say so', () => {
  it('AC-5.4 offline, the list says it needs a connection and shows no generic error', async () => {
    everythingIsUnreachable();
    signInAs('INSPECTOR');

    renderApp();

    expect(await screen.findByText(LIST_NEEDS_CONNECTION)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be reached/)).not.toBeInTheDocument();
  });

  it('AC-5.4 when the connection returns, the list loads by itself and the notice goes away', async () => {
    everythingIsUnreachable();
    signInAs('INSPECTOR');
    renderApp();
    await screen.findByText(LIST_NEEDS_CONNECTION);
    api.state.inspections = [storedInspection()];
    api.inspections.list.mockReset();
    api.inspections.list.mockImplementation(async () => api.state.inspections);

    act(() => services.connectivity.set(true));

    expect(await screen.findByRole('row', { name: /Harbour View Apartments/ })).toBeInTheDocument();
    expect(screen.queryByText(LIST_NEEDS_CONNECTION)).not.toBeInTheDocument();
  });

  it('AC-5.4 online, a failed list load is still reported as an error, not as being offline', async () => {
    api.inspections.list.mockRejectedValue(new ApiError('Internal server error', 500));
    signInAs('INSPECTOR');

    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    expect(screen.queryByText(LIST_NEEDS_CONNECTION)).not.toBeInTheDocument();
  });

  it('AC-5.4 offline, the register page says it needs a connection and shows no generic error', async () => {
    everythingIsUnreachable();
    signInAs('ADMIN');
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Register' }));

    expect(await screen.findByText(REGISTER_NEEDS_CONNECTION)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-5.4 when the connection returns, the register page loads by itself', async () => {
    everythingIsUnreachable();
    signInAs('ADMIN');
    const user = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Register' }));
    await screen.findByText(REGISTER_NEEDS_CONNECTION);
    api.register.listProjects.mockReset();
    api.register.listProjects.mockImplementation(async () => api.state.projects);

    act(() => services.connectivity.set(true));

    expect(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ })).toBeInTheDocument();
    expect(screen.queryByText(REGISTER_NEEDS_CONNECTION)).not.toBeInTheDocument();
  });
});
