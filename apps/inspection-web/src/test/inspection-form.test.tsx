import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../api/api-context';
import { ApiError } from '../api/api-error';
import type { Inspection } from '../api/types';
import { InspectionForm } from '../inspections/InspectionForm';
import {
  createFakeApi,
  INSPECTION_ID,
  PROJECT_ID,
  SECOND_PROJECT_ID,
  SECOND_SYSTEM_ID,
  storedInspection,
  SYSTEM_ID,
  type FakeApi
} from './fake-api';

let api: FakeApi;
let onSaved: Mock<(inspection: Inspection) => void>;
let onClose: Mock<() => void>;

beforeEach(() => {
  api = createFakeApi();
  onSaved = vi.fn();
  onClose = vi.fn();
});

function renderForm(initial: Inspection | null, canEdit = true) {
  if (initial) api.state.inspections = [initial];
  render(
    <ApiProvider api={api}>
      <InspectionForm initial={initial} canEdit={canEdit} onClose={onClose} onSaved={onSaved} />
    </ApiProvider>
  );
  return userEvent.setup();
}

function optionNames(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((option) => option.textContent ?? '');
}

/** Waits for the register's projects to arrive, then picks Harbour View and the given system. */
async function chooseHarbourViewSystem(user: ReturnType<typeof userEvent.setup>, systemCode = 'SYS-01') {
  await screen.findByRole('option', { name: /Harbour View Apartments/ });
  await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);
  await screen.findByRole('option', { name: new RegExp(systemCode) });
  await user.selectOptions(screen.getByLabelText('Firestop system'), systemCode === 'SYS-01' ? SYSTEM_ID : SECOND_SYSTEM_ID);
}

describe('Inspection form: choosing a project and a system', () => {
  it('AC-4.1 the project picker offers the active projects only', async () => {
    renderForm(null);

    await screen.findByRole('option', { name: /Harbour View Apartments/ });
    const names = optionNames(screen.getByLabelText('Project'));

    expect(names.some((name) => name.includes('Market Square Offices'))).toBe(true);
    expect(names.some((name) => name.includes('Old Depot'))).toBe(false);
  });

  it('AC-4.1 the system picker is disabled until a project is chosen', async () => {
    renderForm(null);
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    expect(screen.getByLabelText('Firestop system')).toBeDisabled();
    expect(api.register.listSystems).not.toHaveBeenCalled();
  });

  it('AC-4.1 choosing a project loads its active systems into the system picker', async () => {
    const user = renderForm(null);
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);
    await screen.findByRole('option', { name: /SYS-01/ });
    const names = optionNames(screen.getByLabelText('Firestop system'));

    expect(api.register.listSystems).toHaveBeenCalledWith(PROJECT_ID);
    expect(screen.getByLabelText('Firestop system')).toBeEnabled();
    expect(names.some((name) => name.includes('SYS-02'))).toBe(true);
    expect(names.some((name) => name.includes('SYS-03'))).toBe(false);
  });

  it('AC-4.1 a system added to the register is offered the next time the form is opened', async () => {
    api.state.systems = [
      ...api.state.systems,
      { ...api.state.systems[0], id: '88888888-8888-4888-8888-888888888888', code: 'SYS-05', materials: 'Demo wrap E' }
    ];
    const user = renderForm(null);
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    await user.selectOptions(screen.getByLabelText('Project'), PROJECT_ID);

    expect(await screen.findByRole('option', { name: /SYS-05/ })).toBeInTheDocument();
  });

  it('AC-4.1 choosing a system shows its details, read-only', async () => {
    const user = renderForm(null);

    await chooseHarbourViewSystem(user);
    const details = screen.getByRole('group', { name: 'System details' });

    expect(within(details).getByText('Plasterboard wall')).toBeInTheDocument();
    expect(within(details).getByText('Plastic pipe up to 50 mm')).toBeInTheDocument();
    expect(within(details).getByText('-/60/60')).toBeInTheDocument();
    expect(within(details).getByText('Demo collar A')).toBeInTheDocument();
    expect(within(details).getByText('Fit one collar on each side of the wall.')).toBeInTheDocument();
    expect(within(details).queryAllByRole('textbox')).toHaveLength(0);
  });

  it('AC-4.1 changing the project clears the chosen system', async () => {
    const user = renderForm(null);
    await chooseHarbourViewSystem(user);

    await user.selectOptions(screen.getByLabelText('Project'), SECOND_PROJECT_ID);

    expect(screen.getByLabelText('Firestop system')).toHaveValue('');
    expect(screen.queryByRole('group', { name: 'System details' })).not.toBeInTheDocument();
  });

  it('AC-4.1 when the register cannot be reached, the form says the projects could not be loaded', async () => {
    api.register.listProjects.mockRejectedValueOnce(new ApiError('The server could not be reached.', 0));

    renderForm(null);

    expect(await screen.findByRole('alert')).toHaveTextContent('The projects could not be loaded');
  });
});

describe('Inspection form: saving', () => {
  it('AC-4.3 saving a new record sends the project, the system and the fields, and no building', async () => {
    const user = renderForm(null);
    await chooseHarbourViewSystem(user);
    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
    await user.type(screen.getByLabelText('Inspection notes'), 'Sealed today.');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(api.inspections.create).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      systemId: SYSTEM_ID,
      location: 'Level 2 riser',
      notes: 'Sealed today.',
      status: 'DRAFT',
      observations: []
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ location: 'Level 2 riser', projectId: PROJECT_ID }));
  });

  it('AC-4.3 an observation added in the form is sent with the record', async () => {
    const user = renderForm(null);
    await chooseHarbourViewSystem(user);
    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');
    await user.click(screen.getByRole('button', { name: '+ Add observation' }));
    await user.type(screen.getByPlaceholderText('Observation'), 'Label missing');
    await user.type(screen.getByPlaceholderText('Recommended remedial action'), 'Fit a label');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(api.inspections.create).toHaveBeenCalledWith(expect.objectContaining({
      observations: [{ description: 'Label missing', severity: 'MEDIUM', remedialAction: 'Fit a label' }]
    }));
  });

  it('AC-4.3 without a project, a system and a location, nothing is sent and the form says what is missing', async () => {
    const user = renderForm(null);
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(api.inspections.create).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a project, a firestop system and enter a location');
  });

  it('AC-4.3 a rejection from the server is shown with its reason and the form keeps what was typed', async () => {
    api.inspections.create.mockRejectedValueOnce(new ApiError('Firestop system is inactive', 422));
    const user = renderForm(null);
    await chooseHarbourViewSystem(user);
    await user.type(screen.getByLabelText('Location'), 'Level 2 riser');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestop system is inactive');
    expect(screen.getByLabelText('Location')).toHaveValue('Level 2 riser');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('AC-4.3 saving an existing record updates it under its id', async () => {
    const user = renderForm(storedInspection());
    await screen.findByRole('option', { name: /SYS-01/ });
    await user.clear(screen.getByLabelText('Inspection notes'));
    await user.type(screen.getByLabelText('Inspection notes'), 'Checked again.');
    await user.selectOptions(screen.getByLabelText('Status'), 'COMPLETED');

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(api.inspections.update).toHaveBeenCalledWith(INSPECTION_ID, expect.objectContaining({
      projectId: PROJECT_ID, systemId: SYSTEM_ID, notes: 'Checked again.', status: 'COMPLETED'
    }));
    expect(api.inspections.create).not.toHaveBeenCalled();
  });
});

describe('Inspection form: an existing record', () => {
  it('AC-4.3 shows the project, the system and the details stored on the record', async () => {
    renderForm(storedInspection());

    expect(await screen.findByRole('heading', { name: 'Harbour View Apartments' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toHaveValue(PROJECT_ID);
    expect(screen.getByLabelText('Firestop system')).toHaveValue(SYSTEM_ID);
    expect(within(screen.getByRole('group', { name: 'System details' })).getByText('Demo collar A')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toHaveValue('Level 4, riser cupboard R4-12');
  });

  it('AC-4.3 shows the record\'s own copy of the system even after the register changed it', async () => {
    api.state.systems = api.state.systems.map((item) =>
      item.id === SYSTEM_ID ? { ...item, materials: 'Changed in the register' } : item);

    renderForm(storedInspection());
    await screen.findByRole('option', { name: /SYS-01/ });

    const details = screen.getByRole('group', { name: 'System details' });
    expect(within(details).getByText('Demo collar A')).toBeInTheDocument();
    expect(within(details).queryByText('Changed in the register')).not.toBeInTheDocument();
  });

  it('AC-4.3 a record whose system was deactivated keeps it selected and can still be saved', async () => {
    api.state.systems = api.state.systems.map((item) => (item.id === SYSTEM_ID ? { ...item, active: false } : item));
    const user = renderForm(storedInspection());
    await screen.findByRole('option', { name: /SYS-02/ });

    expect(screen.getByLabelText('Firestop system')).toHaveValue(SYSTEM_ID);
    expect(screen.getByRole('option', { name: /SYS-01.*inactive/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(api.inspections.update).toHaveBeenCalledWith(INSPECTION_ID, expect.objectContaining({ systemId: SYSTEM_ID }));
  });

  it('AC-4.3 a record whose project was deactivated keeps it selected', async () => {
    api.state.projects = api.state.projects.map((item) => (item.id === PROJECT_ID ? { ...item, active: false } : item));

    renderForm(storedInspection());
    await screen.findByRole('option', { name: /Market Square Offices/ });

    expect(screen.getByLabelText('Project')).toHaveValue(PROJECT_ID);
    expect(screen.getByRole('option', { name: /Harbour View Apartments.*inactive/i })).toBeInTheDocument();
  });

  it('AC-4.3 when the register cannot be reached, the stored details are still shown', async () => {
    api.register.listProjects.mockRejectedValueOnce(new ApiError('The server could not be reached.', 0));

    renderForm(storedInspection());

    expect(await screen.findByRole('alert')).toHaveTextContent('The projects could not be loaded');
    expect(screen.getByRole('heading', { name: 'Harbour View Apartments' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'System details' })).getByText('Demo collar A')).toBeInTheDocument();
  });
});

describe('Inspection form: AI draft and photos', () => {
  it('AC-4.3 the AI instruction the user typed is sent, and the draft is shown as unverified', async () => {
    const user = renderForm(storedInspection());
    await user.clear(screen.getByLabelText('AI instruction'));
    await user.type(screen.getByLabelText('AI instruction'), 'Describe the seal.');

    await user.click(screen.getByRole('button', { name: /Generate AI draft/ }));

    expect(api.inspections.requestAiDraft).toHaveBeenCalledWith(INSPECTION_ID, 'Describe the seal.');
    expect(await screen.findByText('Draft for Level 4, riser cupboard R4-12')).toBeInTheDocument();
    expect(screen.getByText(/AI-assisted draft.*unverified/)).toBeInTheDocument();
    expect(screen.getByText(/not a compliance decision/)).toBeInTheDocument();
  });

  it('AC-4.3 the AI instruction field starts with a default that forbids a compliance decision', async () => {
    renderForm(storedInspection());

    expect((screen.getByLabelText('AI instruction') as HTMLTextAreaElement).value).toMatch(/Never decide compliance/);
  });

  it('AC-4.3 an AI draft cannot be requested before the record is saved', async () => {
    const user = renderForm(null);
    await screen.findByRole('option', { name: /Harbour View Apartments/ });

    await user.click(screen.getByRole('button', { name: /Generate AI draft/ }));

    expect(api.inspections.requestAiDraft).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Save the inspection before requesting an AI draft');
  });

  it('AC-4.3 a failed AI request is reported and the record stays open', async () => {
    api.inspections.requestAiDraft.mockRejectedValueOnce(
      new ApiError('The AI provider failed. The record was kept; try again later.', 502)
    );
    const user = renderForm(storedInspection());

    await user.click(screen.getByRole('button', { name: /Generate AI draft/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI provider failed');
    expect(screen.getByLabelText('Location')).toHaveValue('Level 4, riser cupboard R4-12');
  });

  it('AC-4.3 a record whose last AI request failed says so', async () => {
    renderForm(storedInspection({ aiStatus: 'FAILED', aiInstruction: 'Describe the seal.' }));

    expect(await screen.findByText('The last AI draft request failed. You can try again.')).toBeInTheDocument();
  });

  it('AC-4.3 uploading a photo sends the file and shows it', async () => {
    const user = renderForm(storedInspection());
    const file = new File(['image-bytes'], 'seal.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Site photos'), file);

    expect(api.inspections.uploadPhotos).toHaveBeenCalledWith(INSPECTION_ID, [file]);
    expect(await screen.findByAltText('Inspection evidence')).toHaveAttribute('src', '/uploads/seal.png');
  });

  it('AC-4.3 removing a photo asks the server by position and takes it off the form', async () => {
    const user = renderForm(storedInspection({ photos: ['/uploads/first.png', '/uploads/second.png'] }));

    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));

    expect(api.inspections.deletePhoto).toHaveBeenCalledWith(INSPECTION_ID, 1);
    expect(await screen.findAllByAltText('Inspection evidence')).toHaveLength(1);
  });
});

describe('Inspection form: a viewer', () => {
  it('AC-4.2 every field is read-only and nothing that changes the record is offered', async () => {
    renderForm(storedInspection({ photos: ['/uploads/first.png'] }), false);
    await screen.findByRole('heading', { name: 'Harbour View Apartments' });

    expect(screen.getByLabelText('Project')).toBeDisabled();
    expect(screen.getByLabelText('Firestop system')).toBeDisabled();
    expect(screen.getByLabelText('Location')).toBeDisabled();
    expect(screen.getByLabelText('Inspection notes')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save inspection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate AI draft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add observation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo 1' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Site photos')).not.toBeInTheDocument();
  });

  it('AC-4.2 a viewer can still close the record', async () => {
    const user = renderForm(storedInspection(), false);
    await screen.findByRole('heading', { name: 'Harbour View Apartments' });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});
