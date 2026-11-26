import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import { ApiError } from '../api/api-error';
import { RegisterAdminPage } from '../register/RegisterAdminPage';
import { createFakeApi, PROJECT_ID, SYSTEM_ID, type FakeApi } from './fake-api';

let api: FakeApi;

beforeEach(() => {
  api = createFakeApi();
});

function renderPage() {
  render(<ApiProvider api={api}><RegisterAdminPage /></ApiProvider>);
  return userEvent.setup();
}

/** Renders the page and opens the first project, "HVA Harbour View Apartments". */
async function openHarbourView() {
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ }));
  await screen.findByRole('heading', { name: 'Approved systems for Harbour View Apartments' });
  return user;
}

/** Opens the "New system" dialog and fills in its form. */
async function fillSystemForm(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByRole('button', { name: 'New system' }));
  await user.type(screen.getByLabelText('System code'), code);
  await user.type(screen.getByLabelText('Substrate'), 'Concrete floor');
  await user.type(screen.getByLabelText('Service type'), 'Metal pipe up to 100 mm');
  await user.type(screen.getByLabelText('Fire rating'), '-/120/120');
  await user.type(screen.getByLabelText('Materials'), 'Demo wrap E');
  await user.type(screen.getByLabelText('Installation method'), 'Wrap the pipe twice.');
}

function systemRow(code: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(code) });
}

describe('Register admin page', () => {
  it('AC-4.1 lists every project, and marks the inactive one', async () => {
    const user = renderPage();

    expect(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MKT.*Market Square Offices/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show inactive' }));
    expect(screen.getByRole('button', { name: /OLD.*Old Depot.*Inactive/ })).toBeInTheDocument();
  });

  it('AC-4.1 asks the user to select a project before showing any systems', async () => {
    renderPage();

    expect(await screen.findByText('Select a project to see its approved systems.')).toBeInTheDocument();
    expect(api.register.listSystems).not.toHaveBeenCalled();
  });

  it('AC-4.1 selecting a project shows its systems, active and inactive', async () => {
    await openHarbourView();

    expect(api.register.listSystems).toHaveBeenCalledWith(PROJECT_ID);
    expect(within(systemRow('SYS-01')).getByText('Demo collar A')).toBeInTheDocument();
    expect(within(systemRow('SYS-01')).getByText('-/60/60')).toBeInTheDocument();
    expect(within(systemRow('SYS-02')).getByText('Demo sealant B')).toBeInTheDocument();
    expect(within(systemRow('SYS-03')).getByText('Inactive')).toBeInTheDocument();
  });

  it('AC-4.1 adding a system sends it to the register and shows it in the list', async () => {
    const user = await openHarbourView();

    await fillSystemForm(user, 'SYS-05');
    await user.click(screen.getByRole('button', { name: 'Add system' }));

    expect(api.register.createSystem).toHaveBeenCalledWith(PROJECT_ID, {
      code: 'SYS-05',
      substrate: 'Concrete floor',
      serviceType: 'Metal pipe up to 100 mm',
      fireRating: '-/120/120',
      materials: 'Demo wrap E',
      installationMethod: 'Wrap the pipe twice.'
    });
    expect(within(await screen.findByRole('row', { name: /SYS-05/ })).getByText('Demo wrap E')).toBeInTheDocument();
  });

  it('AC-4.1 after a system is added the form is empty, ready for the next one', async () => {
    const user = await openHarbourView();

    await fillSystemForm(user, 'SYS-05');
    await user.click(screen.getByRole('button', { name: 'Add system' }));
    await screen.findByRole('row', { name: /SYS-05/ });
    await user.click(screen.getByRole('button', { name: 'New system' }));

    expect(screen.getByLabelText('System code')).toHaveValue('');
    expect(screen.getByLabelText('Materials')).toHaveValue('');
  });

  it('AC-4.1 a validation error from the register is shown beside its field and nothing is added', async () => {
    api.register.createSystem.mockRejectedValueOnce(
      new ApiError('Validation failed', 400, { code: 'code must use capital letters, digits and hyphens only' })
    );
    const user = await openHarbourView();

    await fillSystemForm(user, 'sys 05');
    await user.click(screen.getByRole('button', { name: 'Add system' }));

    expect(await screen.findByText('code must use capital letters, digits and hyphens only')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /sys 05/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('System code')).toHaveValue('sys 05');
  });

  it('AC-4.1 a duplicate code is reported with the register\'s message', async () => {
    api.register.createSystem.mockRejectedValueOnce(
      new ApiError('The project already has a system with code SYS-01', 409)
    );
    const user = await openHarbourView();

    await fillSystemForm(user, 'SYS-01');
    await user.click(screen.getByRole('button', { name: 'Add system' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The project already has a system with code SYS-01');
  });

  it('AC-4.1 editing a system loads it into the form and saves the change', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Edit SYS-01' }));
    expect(screen.getByLabelText('System code')).toHaveValue('SYS-01');
    expect(screen.getByLabelText('Materials')).toHaveValue('Demo collar A');
    await user.clear(screen.getByLabelText('Materials'));
    await user.type(screen.getByLabelText('Materials'), 'Demo collar Z');
    await user.click(screen.getByRole('button', { name: 'Save system' }));

    expect(api.register.updateSystem).toHaveBeenCalledWith(
      PROJECT_ID, SYSTEM_ID, expect.objectContaining({ code: 'SYS-01', materials: 'Demo collar Z' })
    );
    expect(await within(systemRow('SYS-01')).findByText('Demo collar Z')).toBeInTheDocument();
    expect(api.register.createSystem).not.toHaveBeenCalled();
  });

  it('AC-4.1 deactivating a system keeps it in the list, marked inactive, and offers to reactivate it', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Deactivate SYS-01' }));

    expect(api.register.updateSystem).toHaveBeenCalledWith(
      PROJECT_ID, SYSTEM_ID, expect.objectContaining({ code: 'SYS-01', active: false })
    );
    expect(await within(systemRow('SYS-01')).findByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate SYS-01' })).toBeInTheDocument();
  });

  it('AC-4.1 reactivating an inactive system sends active true', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Reactivate SYS-03' }));

    expect(api.register.updateSystem).toHaveBeenCalledWith(
      PROJECT_ID, expect.any(String), expect.objectContaining({ code: 'SYS-03', active: true })
    );
    expect(await screen.findByRole('button', { name: 'Deactivate SYS-03' })).toBeInTheDocument();
  });

  it('AC-4.1 adding a project sends it to the register, lists it and opens it', async () => {
    const user = renderPage();
    await screen.findByRole('button', { name: /HVA/ });

    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByLabelText('Project code'), 'NEW');
    await user.type(screen.getByLabelText('Project name'), 'New Tower');
    await user.type(screen.getByLabelText('Address'), '9 Hill Road');
    await user.click(screen.getByRole('button', { name: 'Add project' }));

    expect(api.register.createProject).toHaveBeenCalledWith({ code: 'NEW', name: 'New Tower', address: '9 Hill Road' });
    expect(await screen.findByRole('button', { name: /NEW.*New Tower/ })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Approved systems for New Tower' })).toBeInTheDocument();
  });

  it('AC-4.1 deactivating a project sends active false and marks it inactive', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Deactivate project HVA' }));

    expect(api.register.updateProject).toHaveBeenCalledWith(
      PROJECT_ID, expect.objectContaining({ code: 'HVA', name: 'Harbour View Apartments', active: false })
    );
    expect(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments.*Inactive/ })).toBeInTheDocument();
  });

  it('AC-4.1 when the register cannot be reached, the page says so and offers to try again', async () => {
    api.register.listProjects.mockRejectedValueOnce(
      new ApiError('The server could not be reached. Check your connection and try again.', 0)
    );
    const user = renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not be reached');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ })).toBeInTheDocument();
  });
});
