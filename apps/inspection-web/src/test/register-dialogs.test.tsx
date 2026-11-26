import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import { ApiError } from '../api/api-error';
import { RegisterAdminPage } from '../register/RegisterAdminPage';
import { createFakeApi, PROJECT_ID, SYSTEM_ID, type FakeApi } from './fake-api';

type User = ReturnType<typeof userEvent.setup>;

let api: FakeApi;

beforeEach(() => {
  api = createFakeApi();
});

/** Renders the page and waits for the project list. */
async function renderPage(): Promise<User> {
  render(<ApiProvider api={api}><RegisterAdminPage /></ApiProvider>);
  await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ });
  return userEvent.setup();
}

/** Renders the page and opens the first project, "HVA Harbour View Apartments". */
async function openHarbourView(): Promise<User> {
  const user = await renderPage();
  await user.click(screen.getByRole('button', { name: /HVA.*Harbour View Apartments/ }));
  await screen.findByRole('heading', { name: 'Approved systems for Harbour View Apartments' });
  return user;
}

async function openDialog(user: User, button: string, title: string): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: button }));
  return screen.findByRole('dialog', { name: title });
}

async function fillProject(user: User, dialog: HTMLElement, code: string, name: string): Promise<void> {
  await user.type(within(dialog).getByLabelText('Project code'), code);
  await user.type(within(dialog).getByLabelText('Project name'), name);
}

async function fillSystem(user: User, dialog: HTMLElement, code: string): Promise<void> {
  await user.type(within(dialog).getByLabelText('System code'), code);
  await user.type(within(dialog).getByLabelText('Substrate'), 'Concrete floor');
  await user.type(within(dialog).getByLabelText('Service type'), 'Metal pipe up to 100 mm');
  await user.type(within(dialog).getByLabelText('Fire rating'), '-/120/120');
  await user.type(within(dialog).getByLabelText('Materials'), 'Demo wrap E');
  await user.type(within(dialog).getByLabelText('Installation method'), 'Wrap the pipe twice.');
}

function projectButtons(): string[] {
  return within(screen.getByRole('list', { name: 'Projects' }))
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

describe('Register screen: project dialog', () => {
  it('AC-8.1 the project form is not on the page until "New project" is pressed', async () => {
    const user = await renderPage();

    expect(screen.queryByLabelText('Project code')).not.toBeInTheDocument();
    const dialog = await openDialog(user, 'New project', 'New project');

    expect(within(dialog).getByLabelText('Project code')).toHaveValue('');
    expect(within(dialog).getByLabelText('Project name')).toHaveValue('');
    expect(within(dialog).getByLabelText('Address')).toHaveValue('');
  });

  it('AC-8.1 adding a project closes the dialog and opens the new project', async () => {
    const user = await renderPage();
    const dialog = await openDialog(user, 'New project', 'New project');

    await fillProject(user, dialog, 'NEW', 'New Tower');
    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));

    expect(await screen.findByRole('heading', { name: 'Approved systems for New Tower' })).toBeInTheDocument();
    expect(api.register.createProject).toHaveBeenCalledWith({ code: 'NEW', name: 'New Tower' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NEW.*New Tower/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('AC-8.1 Cancel closes the project dialog and adds nothing', async () => {
    const user = await renderPage();
    const dialog = await openDialog(user, 'New project', 'New project');

    await fillProject(user, dialog, 'NEW', 'New Tower');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.createProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /NEW.*New Tower/ })).not.toBeInTheDocument();
  });

  it('AC-8.1 a cancelled project dialog opens empty the next time', async () => {
    const user = await renderPage();
    const first = await openDialog(user, 'New project', 'New project');
    await fillProject(user, first, 'NEW', 'New Tower');
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));

    const second = await openDialog(user, 'New project', 'New project');

    expect(within(second).getByLabelText('Project code')).toHaveValue('');
    expect(within(second).getByLabelText('Project name')).toHaveValue('');
  });

  it('AC-8.1 a refused project keeps the dialog open with the message and what was typed', async () => {
    api.register.createProject.mockRejectedValueOnce(
      new ApiError('Validation failed', 400, { code: 'code must use capital letters, digits and hyphens only' })
    );
    const user = await renderPage();
    const dialog = await openDialog(user, 'New project', 'New project');

    await fillProject(user, dialog, 'new 1', 'New Tower');
    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));

    expect(await within(dialog).findByText('code must use capital letters, digits and hyphens only')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Validation failed');
    expect(within(dialog).getByLabelText('Project code')).toHaveValue('new 1');
    expect(within(dialog).getByLabelText('Project name')).toHaveValue('New Tower');
  });
});

describe('Register screen: system dialog', () => {
  it('AC-8.2 the system form is not on the page until "New system" is pressed', async () => {
    const user = await openHarbourView();

    expect(screen.queryByLabelText('System code')).not.toBeInTheDocument();
    const dialog = await openDialog(user, 'New system', 'New system');

    expect(within(dialog).getByLabelText('System code')).toHaveValue('');
    expect(within(dialog).getByLabelText('Installation method')).toHaveValue('');
  });

  it('AC-8.2 adding a system closes the dialog and lists the system', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'New system', 'New system');

    await fillSystem(user, dialog, 'SYS-05');
    await user.click(within(dialog).getByRole('button', { name: 'Add system' }));

    expect(await screen.findByRole('row', { name: /SYS-05/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.createSystem).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ code: 'SYS-05' }));
  });

  it('AC-8.2 Edit opens the dialog filled in, and saving closes it and shows the change', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'Edit SYS-01', 'Edit SYS-01');

    expect(within(dialog).getByLabelText('System code')).toHaveValue('SYS-01');
    expect(within(dialog).getByLabelText('Materials')).toHaveValue('Demo collar A');
    await user.clear(within(dialog).getByLabelText('Materials'));
    await user.type(within(dialog).getByLabelText('Materials'), 'Demo collar Z');
    await user.click(within(dialog).getByRole('button', { name: 'Save system' }));

    expect(await within(screen.getByRole('row', { name: /SYS-01/ })).findByText('Demo collar Z')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.updateSystem).toHaveBeenCalledWith(
      PROJECT_ID, SYSTEM_ID, expect.objectContaining({ materials: 'Demo collar Z' })
    );
  });

  it('AC-8.2 Cancel closes the system dialog and changes nothing', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'Edit SYS-01', 'Edit SYS-01');

    await user.clear(within(dialog).getByLabelText('Materials'));
    await user.type(within(dialog).getByLabelText('Materials'), 'Something else');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.updateSystem).not.toHaveBeenCalled();
    expect(within(screen.getByRole('row', { name: /SYS-01/ })).getByText('Demo collar A')).toBeInTheDocument();
  });

  it('AC-8.2 "New system" opens empty after a system was being edited', async () => {
    const user = await openHarbourView();
    const editing = await openDialog(user, 'Edit SYS-01', 'Edit SYS-01');
    await user.click(within(editing).getByRole('button', { name: 'Cancel' }));

    const adding = await openDialog(user, 'New system', 'New system');

    expect(within(adding).getByLabelText('System code')).toHaveValue('');
    expect(within(adding).getByLabelText('Materials')).toHaveValue('');
  });

  it('AC-8.2 a refused system keeps the dialog open with the message and what was typed', async () => {
    api.register.createSystem.mockRejectedValueOnce(
      new ApiError('The project already has a system with code SYS-01', 409)
    );
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'New system', 'New system');

    await fillSystem(user, dialog, 'SYS-01');
    await user.click(within(dialog).getByRole('button', { name: 'Add system' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The project already has a system with code SYS-01');
    expect(within(dialog).getByLabelText('System code')).toHaveValue('SYS-01');
    expect(within(dialog).getByLabelText('Materials')).toHaveValue('Demo wrap E');
  });
});

describe('Register screen: project list', () => {
  it('AC-8.3 inactive projects are listed only while "Show inactive" is ticked', async () => {
    const user = await renderPage();

    expect(screen.queryByRole('button', { name: /OLD.*Old Depot/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show inactive' }));
    expect(screen.getByRole('button', { name: /OLD.*Old Depot.*Inactive/ })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Show inactive' }));
    expect(screen.queryByRole('button', { name: /OLD.*Old Depot/ })).not.toBeInTheDocument();
  });

  it('AC-8.3 searching narrows the list by project name, in any letter case', async () => {
    const user = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'market');

    expect(projectButtons()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /MKT.*Market Square Offices/ })).toBeInTheDocument();
  });

  it('AC-8.3 searching narrows the list by project code, in any letter case', async () => {
    const user = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'hv');

    expect(projectButtons()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /HVA.*Harbour View Apartments/ })).toBeInTheDocument();
  });

  it('AC-8.3 clearing the search lists the projects again', async () => {
    const user = await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search projects' });

    await user.type(search, 'market');
    await user.clear(search);

    expect(projectButtons()).toHaveLength(2);
  });

  it('AC-8.3 when no project matches, the list says so', async () => {
    const user = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'zzz');

    expect(screen.getByText('No projects match.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /HVA/ })).not.toBeInTheDocument();
  });

  it('AC-8.3 the search does not find an inactive project until "Show inactive" is ticked', async () => {
    const user = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'depot');
    expect(screen.getByText('No projects match.')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Show inactive' }));
    expect(screen.getByRole('button', { name: /OLD.*Old Depot.*Inactive/ })).toBeInTheDocument();
  });

  it('AC-8.3 the open project stays listed when it is deactivated', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Deactivate project HVA' }));

    expect(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments.*Inactive/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show inactive' })).not.toBeChecked();
  });
});

describe('Register screen: editing a project', () => {
  it('AC-8.4 "Edit project" opens the dialog filled in with the project', async () => {
    const user = await openHarbourView();

    const dialog = await openDialog(user, 'Edit project HVA', 'Edit project HVA');

    expect(within(dialog).getByLabelText('Project code')).toHaveValue('HVA');
    expect(within(dialog).getByLabelText('Project name')).toHaveValue('Harbour View Apartments');
    expect(within(dialog).getByLabelText('Address')).toHaveValue('1 Quay Street');
  });

  it('AC-8.4 saving sends the change, keeps the active state, and shows the new name', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'Edit project HVA', 'Edit project HVA');

    await user.clear(within(dialog).getByLabelText('Project name'));
    await user.type(within(dialog).getByLabelText('Project name'), 'Harbour View Towers');
    await user.click(within(dialog).getByRole('button', { name: 'Save project' }));

    expect(await screen.findByRole('heading', { name: 'Approved systems for Harbour View Towers' })).toBeInTheDocument();
    expect(api.register.updateProject).toHaveBeenCalledWith(
      PROJECT_ID, { code: 'HVA', name: 'Harbour View Towers', address: '1 Quay Street', active: true }
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HVA.*Harbour View Towers/ })).toBeInTheDocument();
  });

  it('AC-8.4 a refused change keeps the dialog open with the register\'s message', async () => {
    api.register.updateProject.mockRejectedValueOnce(new ApiError('A project with code MKT already exists', 409));
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'Edit project HVA', 'Edit project HVA');

    await user.clear(within(dialog).getByLabelText('Project code'));
    await user.type(within(dialog).getByLabelText('Project code'), 'MKT');
    await user.click(within(dialog).getByRole('button', { name: 'Save project' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A project with code MKT already exists');
    expect(within(dialog).getByLabelText('Project code')).toHaveValue('MKT');
    expect(screen.getByRole('heading', { name: 'Approved systems for Harbour View Apartments' })).toBeInTheDocument();
  });
});

describe('Register screen: dialog keyboard behaviour', () => {
  it('AC-8.5 opening the project dialog moves the focus to its first field', async () => {
    const user = await renderPage();

    const dialog = await openDialog(user, 'New project', 'New project');

    expect(within(dialog).getByLabelText('Project code')).toHaveFocus();
  });

  it('AC-8.5 opening the system dialog moves the focus to its first field', async () => {
    const user = await openHarbourView();

    const dialog = await openDialog(user, 'New system', 'New system');

    expect(within(dialog).getByLabelText('System code')).toHaveFocus();
  });

  it('AC-8.5 Escape closes the project dialog without saving', async () => {
    const user = await renderPage();
    const dialog = await openDialog(user, 'New project', 'New project');
    await fillProject(user, dialog, 'NEW', 'New Tower');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.createProject).not.toHaveBeenCalled();
  });

  it('AC-8.5 Escape closes the system dialog without saving', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'Edit SYS-01', 'Edit SYS-01');
    await user.type(within(dialog).getByLabelText('Materials'), ' changed');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.updateSystem).not.toHaveBeenCalled();
  });
});
