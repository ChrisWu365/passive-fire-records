import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import { ApiError } from '../api/api-error';
import { RegisterAdminPage } from '../register/RegisterAdminPage';
import { AREA_ID, createFakeApi, INACTIVE_AREA_ID, PROJECT_ID, SECOND_PROJECT_ID, type FakeApi } from './fake-api';

type User = ReturnType<typeof userEvent.setup>;

let api: FakeApi;

beforeEach(() => {
  api = createFakeApi();
});

async function renderPage(): Promise<User> {
  render(<ApiProvider api={api}><RegisterAdminPage /></ApiProvider>);
  await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ });
  return userEvent.setup();
}

/** Renders the page, opens "HVA Harbour View Apartments" and waits for its areas. */
async function openHarbourView(): Promise<User> {
  const user = await renderPage();
  await user.click(screen.getByRole('button', { name: /HVA.*Harbour View Apartments/ }));
  await screen.findByRole('heading', { name: 'Areas of Harbour View Apartments' });
  await within(areaList()).findByText('Level 3');
  return user;
}

function areaList(): HTMLElement {
  return screen.getByRole('list', { name: 'Areas' });
}

function areaItem(name: string): HTMLElement {
  return within(areaList()).getByRole('listitem', { name: new RegExp(name) });
}

function areaNames(): string[] {
  return within(areaList()).getAllByRole('listitem').map((item) => item.getAttribute('aria-label') ?? '');
}

async function openDialog(user: User, button: string, title: string): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: button }));
  return screen.findByRole('dialog', { name: title });
}

describe('Register screen: a project\'s areas', () => {
  it('AC-9.1 no areas are asked for until a project is selected', async () => {
    await renderPage();

    expect(api.register.listAreas).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Areas' })).not.toBeInTheDocument();
  });

  it('AC-9.1 selecting a project lists its areas by name, active and inactive', async () => {
    await openHarbourView();

    expect(api.register.listAreas).toHaveBeenCalledWith(PROJECT_ID);
    expect(areaNames()).toEqual(['Basement car park', 'Level 3', 'Old site office, Inactive']);
    expect(within(areaItem('Old site office')).getByText('Inactive')).toBeInTheDocument();
  });

  it('AC-9.1 a project with no areas says so', async () => {
    api.state.areas = api.state.areas.filter((area) => area.projectId !== PROJECT_ID);
    const user = await renderPage();

    await user.click(screen.getByRole('button', { name: /HVA.*Harbour View Apartments/ }));

    expect(await screen.findByText('This project has no areas yet.')).toBeInTheDocument();
  });

  it('AC-9.1 selecting another project shows that project\'s areas instead', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: /MKT.*Market Square Offices/ }));

    expect(await within(areaList()).findByText('Ground floor')).toBeInTheDocument();
    expect(api.register.listAreas).toHaveBeenLastCalledWith(SECOND_PROJECT_ID);
    expect(within(areaList()).queryByText('Level 3')).not.toBeInTheDocument();
  });

  it('AC-9.1 when the areas cannot be loaded, the page says so', async () => {
    api.register.listAreas.mockRejectedValueOnce(new ApiError('The server could not be reached.', 0));
    const user = await renderPage();

    await user.click(screen.getByRole('button', { name: /HVA.*Harbour View Apartments/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not be reached.');
  });
});

describe('Register screen: adding and changing areas', () => {
  it('AC-9.1 "New area" opens an empty dialog with the focus in the name field', async () => {
    const user = await openHarbourView();

    const dialog = await openDialog(user, 'New area', 'New area');

    expect(within(dialog).getByLabelText('Area name')).toHaveValue('');
    expect(within(dialog).getByLabelText('Area name')).toHaveFocus();
  });

  it('AC-9.1 adding an area sends it to the register, closes the dialog and lists it in name order', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'New area', 'New area');

    await user.type(within(dialog).getByLabelText('Area name'), 'Level 1');
    await user.click(within(dialog).getByRole('button', { name: 'Add area' }));

    expect(await within(areaList()).findByText('Level 1')).toBeInTheDocument();
    expect(api.register.createArea).toHaveBeenCalledWith(PROJECT_ID, { name: 'Level 1' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(areaNames()).toEqual(['Basement car park', 'Level 1', 'Level 3', 'Old site office, Inactive']);
  });

  it('AC-9.1 the name is sent without the spaces typed around it', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'New area', 'New area');

    await user.type(within(dialog).getByLabelText('Area name'), '  Roof plant deck  ');
    await user.click(within(dialog).getByRole('button', { name: 'Add area' }));

    await within(areaList()).findByText('Roof plant deck');
    expect(api.register.createArea).toHaveBeenCalledWith(PROJECT_ID, { name: 'Roof plant deck' });
  });

  it('AC-9.1 a name the project already has is refused: the dialog stays open with the register\'s message', async () => {
    api.register.createArea.mockRejectedValueOnce(new ApiError('The project already has an area named Level 3', 409));
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'New area', 'New area');

    await user.type(within(dialog).getByLabelText('Area name'), 'Level 3');
    await user.click(within(dialog).getByRole('button', { name: 'Add area' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The project already has an area named Level 3');
    expect(within(dialog).getByLabelText('Area name')).toHaveValue('Level 3');
    expect(areaNames()).toHaveLength(3);
  });

  it('AC-9.1 a validation message from the register is shown beside the name field', async () => {
    api.register.createArea.mockRejectedValueOnce(
      new ApiError('Validation failed', 400, { name: 'name must be at most 100 characters' })
    );
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'New area', 'New area');

    await user.type(within(dialog).getByLabelText('Area name'), 'Level 9');
    await user.click(within(dialog).getByRole('button', { name: 'Add area' }));

    expect(await within(dialog).findByText('name must be at most 100 characters')).toBeInTheDocument();
  });

  it('AC-9.1 Cancel and Escape close the area dialog and add nothing', async () => {
    const user = await openHarbourView();

    const first = await openDialog(user, 'New area', 'New area');
    await user.type(within(first).getByLabelText('Area name'), 'Level 1');
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));
    const second = await openDialog(user, 'New area', 'New area');
    expect(within(second).getByLabelText('Area name')).toHaveValue('');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.createArea).not.toHaveBeenCalled();
  });

  it('AC-9.1 renaming an area opens the dialog filled in, saves the new name and keeps the active state', async () => {
    const user = await openHarbourView();
    const dialog = await openDialog(user, 'Rename area Level 3', 'Rename area Level 3');

    expect(within(dialog).getByLabelText('Area name')).toHaveValue('Level 3');
    await user.clear(within(dialog).getByLabelText('Area name'));
    await user.type(within(dialog).getByLabelText('Area name'), 'Level 3 east');
    await user.click(within(dialog).getByRole('button', { name: 'Save area' }));

    expect(await within(areaList()).findByText('Level 3 east')).toBeInTheDocument();
    expect(api.register.updateArea).toHaveBeenCalledWith(PROJECT_ID, AREA_ID, { name: 'Level 3 east', active: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.register.createArea).not.toHaveBeenCalled();
  });

  it('AC-9.1 deactivating an area keeps it listed, marked inactive, and offers to reactivate it', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Deactivate area Level 3' }));

    expect(await within(areaItem('Level 3')).findByText('Inactive')).toBeInTheDocument();
    expect(api.register.updateArea).toHaveBeenCalledWith(PROJECT_ID, AREA_ID, { name: 'Level 3', active: false });
    expect(screen.getByRole('button', { name: 'Reactivate area Level 3' })).toBeInTheDocument();
  });

  it('AC-9.1 reactivating an inactive area sends active true', async () => {
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Reactivate area Old site office' }));

    expect(await screen.findByRole('button', { name: 'Deactivate area Old site office' })).toBeInTheDocument();
    expect(api.register.updateArea).toHaveBeenCalledWith(
      PROJECT_ID, INACTIVE_AREA_ID, { name: 'Old site office', active: true }
    );
  });

  it('AC-9.1 when a change is refused, the page says so and the list is unchanged', async () => {
    api.register.updateArea.mockRejectedValueOnce(new ApiError('Insufficient permissions', 403));
    const user = await openHarbourView();

    await user.click(screen.getByRole('button', { name: 'Deactivate area Level 3' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient permissions');
    expect(screen.getByRole('button', { name: 'Deactivate area Level 3' })).toBeInTheDocument();
  });
});
