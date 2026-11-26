import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Inspection, Status } from '../api/types';
import { InspectionList } from '../inspections/InspectionList';
import { storedInspection } from './fake-api';

const PAGE_SIZE = 25;

function record(position: number, overrides: Partial<Inspection> = {}): Inspection {
  return storedInspection({
    id: `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    location: `Level ${position} riser`,
    ...overrides
  });
}

/** Five records across two projects and three statuses. */
function mixedRecords(): Inspection[] {
  const inProject = (projectName: string, location: string, status: Status, position: number) =>
    record(position, { projectName, location, status });
  return [
    inProject('Harbour View Apartments', 'Level 4, riser cupboard R4-12', 'DRAFT', 1),
    inProject('Harbour View Apartments', 'Basement car park, grid B2', 'COMPLETED', 2),
    inProject('Market Square Offices', 'Level 1 plant room', 'ACTION_REQUIRED', 3),
    inProject('Market Square Offices', 'Level 2 riser north', 'COMPLETED', 4),
    inProject('Market Square Offices', 'Roof plant deck', 'DRAFT', 5)
  ];
}

function manyRecords(count: number): Inspection[] {
  return Array.from({ length: count }, (_, index) => record(index + 1));
}

function renderList(inspections: Inspection[]) {
  render(<InspectionList inspections={inspections} loading={false} onOpen={vi.fn()} />);
  return userEvent.setup();
}

/** The data rows of the table, without the header row. */
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 0);
}

function tile(label: string): HTMLElement {
  const element = screen.getByText(label).parentElement;
  if (!element) throw new Error(`No tile labelled ${label}`);
  return element;
}

describe('Inspections list: search and filter', () => {
  it('AC-8.6 searching narrows the list by location, in any letter case', async () => {
    const user = renderList(mixedRecords());

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'RISER');

    expect(dataRows()).toHaveLength(2);
    expect(screen.getByRole('row', { name: /riser cupboard R4-12/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Level 2 riser north/ })).toBeInTheDocument();
  });

  it('AC-8.6 searching narrows the list by project name, in any letter case', async () => {
    const user = renderList(mixedRecords());

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'market');

    expect(dataRows()).toHaveLength(3);
    expect(screen.queryByRole('row', { name: /Harbour View Apartments/ })).not.toBeInTheDocument();
  });

  it('AC-8.6 the status filter shows only records with that status', async () => {
    const user = renderList(mixedRecords());

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'COMPLETED');

    expect(dataRows()).toHaveLength(2);
    expect(screen.getByRole('row', { name: /Basement car park/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Level 2 riser north/ })).toBeInTheDocument();
  });

  it('AC-8.6 the search and the status filter apply together', async () => {
    const user = renderList(mixedRecords());

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'market');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'DRAFT');

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByRole('row', { name: /Roof plant deck/ })).toBeInTheDocument();
  });

  it('AC-8.6 a narrowed list says how many of the records are shown', async () => {
    const user = renderList(mixedRecords());

    expect(screen.getByText(/5 records/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'market');

    expect(screen.getByText(/3 of 5 records/)).toBeInTheDocument();
  });

  it('AC-8.6 when no record matches, the list says so', async () => {
    const user = renderList(mixedRecords());

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'zzz');

    expect(screen.getByText('No inspections match.')).toBeInTheDocument();
    expect(screen.getByText(/0 of 5 records/)).toBeInTheDocument();
  });

  it('AC-8.6 the count tiles count every record, whatever the list is narrowed to', async () => {
    const user = renderList(mixedRecords());

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'harbour');

    expect(within(tile('Total inspections')).getByText('5')).toBeInTheDocument();
    expect(within(tile('Action required')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Completed')).getByText('2')).toBeInTheDocument();
  });

  it('AC-8.6 choosing "All" in the status filter removes the filter', async () => {
    const user = renderList(mixedRecords());
    const filter = screen.getByRole('combobox', { name: 'Filter by status' });

    await user.selectOptions(filter, 'COMPLETED');
    await user.selectOptions(filter, '');

    expect(dataRows()).toHaveLength(5);
  });
});

describe('Inspections list: pages', () => {
  it('AC-8.7 a long list shows the first 25 records and the page number', () => {
    renderList(manyRecords(30));

    expect(dataRows()).toHaveLength(PAGE_SIZE);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('AC-8.7 Next shows the rest, and Previous goes back', async () => {
    const user = renderList(manyRecords(30));

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(dataRows()).toHaveLength(5);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Level 26 riser/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(dataRows()).toHaveLength(PAGE_SIZE);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('AC-8.7 the records keep the order they were given in across pages', async () => {
    const user = renderList(manyRecords(30));

    expect(within(dataRows()[0]).getByText('Level 1 riser')).toBeInTheDocument();
    expect(within(dataRows()[24]).getByText('Level 25 riser')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(within(dataRows()[0]).getByText('Level 26 riser')).toBeInTheDocument();
  });

  it('AC-8.7 narrowing the list returns to the first page', async () => {
    const user = renderList([
      ...manyRecords(30),
      ...Array.from({ length: 30 }, (_, index) => record(100 + index, { location: `Roof zone ${index + 1}` }))
    ]);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'roof');

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(within(dataRows()[0]).getByText('Roof zone 1')).toBeInTheDocument();
  });

  it('AC-8.7 a list that fits on one page shows no pager', () => {
    renderList(manyRecords(PAGE_SIZE));

    expect(dataRows()).toHaveLength(PAGE_SIZE);
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument();
  });

  it('AC-8.7 narrowing a long list to one page removes the pager', async () => {
    const user = renderList([...manyRecords(30), record(99, { location: 'Roof plant deck' })]);

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'roof');

    expect(dataRows()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});
