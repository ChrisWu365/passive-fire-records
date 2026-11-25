import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { ApiError } from '../api/api-error';
import { createFakeApi, signInAs, storedInspection, type FakeApi } from './fake-api';

let api: FakeApi;

beforeEach(() => {
  localStorage.clear();
  api = createFakeApi();
});

function renderApp() {
  render(<App api={api} />);
  return userEvent.setup();
}

describe('App: what each role is offered', () => {
  it('AC-4.2 an admin is offered the register and can open it', async () => {
    signInAs('ADMIN');
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('heading', { name: 'Register' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /HVA.*Harbour View Apartments/ })).toBeInTheDocument();
  });

  it('AC-4.2 an admin can go back from the register to the inspections', async () => {
    signInAs('ADMIN');
    const user = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Register' }));
    await screen.findByRole('heading', { name: 'Register' });

    await user.click(screen.getByRole('button', { name: 'Inspections' }));

    expect(await screen.findByText('Recent inspections')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Register' })).not.toBeInTheDocument();
  });

  it.each(['INSPECTOR', 'VIEWER'] as const)('AC-4.2 a signed-in %s is not offered the register', async (role) => {
    signInAs(role);
    renderApp();

    await screen.findByText('Recent inspections');

    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
    expect(api.register.listProjects).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'INSPECTOR'] as const)('AC-4.2 a signed-in %s can start a new inspection', async (role) => {
    signInAs(role);
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: '+ New inspection' }));

    expect(await screen.findByRole('heading', { name: 'New inspection' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toBeEnabled();
  });

  it('AC-4.2 a viewer cannot start a new inspection, and opens records read-only', async () => {
    api.state.inspections = [storedInspection()];
    signInAs('VIEWER');
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Open' }));

    expect(screen.queryByRole('button', { name: '+ New inspection' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Location')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save inspection' })).not.toBeInTheDocument();
  });
});

describe('App: the inspection list', () => {
  it('AC-4.3 lists each record with its project name, location, status and inspector', async () => {
    api.state.inspections = [storedInspection({ status: 'ACTION_REQUIRED' })];
    signInAs('INSPECTOR');
    renderApp();

    const row = await screen.findByRole('row', { name: /Harbour View Apartments/ });

    expect(screen.getByRole('columnheader', { name: 'Project / location' })).toBeInTheDocument();
    expect(within(row).getByText('Level 4, riser cupboard R4-12')).toBeInTheDocument();
    expect(within(row).getByText('ACTION REQUIRED')).toBeInTheDocument();
    expect(within(row).getByText('Demo INSPECTOR')).toBeInTheDocument();
  });

  it('AC-4.3 a record saved in the form appears in the list', async () => {
    signInAs('INSPECTOR');
    const user = renderApp();
    await user.click(await screen.findByRole('button', { name: '+ New inspection' }));
    await screen.findByRole('option', { name: /Harbour View Apartments/ });
    await user.selectOptions(screen.getByLabelText('Project'), api.state.projects[0].id);
    await screen.findByRole('option', { name: /SYS-01/ });
    await user.selectOptions(screen.getByLabelText('Firestop system'), api.state.systems[0].id);
    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));
    await screen.findByText('Saved');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(within(await screen.findByRole('row', { name: /Harbour View Apartments/ })).getByText('Level 2 riser'))
      .toBeInTheDocument();
  });

  it('AC-4.3 when the list cannot be loaded, the error is shown', async () => {
    api.inspections.list.mockRejectedValueOnce(new ApiError('The server could not be reached.', 0));
    signInAs('INSPECTOR');
    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not be reached.');
  });
});

describe('App: signing in and out', () => {
  it('AC-4.2 signing in as admin through the form opens the workspace with the register offered', async () => {
    const user = renderApp();
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'Admin123!');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.auth.login).toHaveBeenCalledWith('admin@example.com', 'Admin123!');
    expect(await screen.findByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(localStorage.getItem('inspection-token')).toBe('token-for-ADMIN');
  });

  it('AC-4.2 a rejected sign-in shows the server\'s message and stays on the sign-in page', async () => {
    api.auth.login.mockRejectedValueOnce(new ApiError('Invalid email or password', 401));
    const user = renderApp();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('AC-4.2 the sign-in page lists the admin demo account beside the other two', () => {
    renderApp();

    expect(screen.getByText(/admin@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/inspector@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/viewer@example\.com/)).toBeInTheDocument();
  });

  it('AC-4.2 signing out removes the session and returns to the sign-in page', async () => {
    signInAs('ADMIN');
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem('inspection-token')).toBeNull();
    expect(localStorage.getItem('inspection-user')).toBeNull();
  });
});
