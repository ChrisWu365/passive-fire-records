import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Inspection } from '../api/types';
import { InspectionList } from '../inspections/InspectionList';
import { OfflineProvider } from '../offline/offline-context';
import { DeviceQueuePanel } from '../offline/queue/DeviceQueuePanel';
import { QueueProvider } from '../offline/queue/queue-context';
import { AREA_ID, SECOND_AREA_ID, storedInspection, userWithRole } from './fake-api';
import { createFakeOfflineServices, type FakeOfflineServices } from './offline-fakes';
import { createFakeQueueServices, draft, type FakeQueueServices } from './queue-fakes';

function record(position: number, overrides: Partial<Inspection>): Inspection {
  return storedInspection({ id: `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`, ...overrides });
}

function renderList(inspections: Inspection[]) {
  render(<InspectionList inspections={inspections} loading={false} onOpen={vi.fn()} />);
  return userEvent.setup();
}

/** The data rows of the table, without the header row. */
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 0);
}

describe('Inspections list: areas', () => {
  const records = [
    record(1, { areaId: AREA_ID, areaName: 'Level 3', location: 'Riser cupboard R4-12' }),
    record(2, { areaId: SECOND_AREA_ID, areaName: 'Basement car park', location: 'Grid B2' }),
    record(3, { location: 'Level 2 riser north' })
  ];

  it('AC-9.9 a record with an area shows the area before the detail', () => {
    renderList(records);

    expect(within(dataRows()[0]).getByText('Level 3 · Riser cupboard R4-12')).toBeInTheDocument();
    expect(within(dataRows()[1]).getByText('Basement car park · Grid B2')).toBeInTheDocument();
  });

  it('AC-9.9 a record with no area shows its location alone', () => {
    renderList(records);

    expect(within(dataRows()[2]).getByText('Level 2 riser north')).toBeInTheDocument();
  });

  it('AC-9.9 the search matches the area\'s name, in any letter case', async () => {
    const user = renderList(records);

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'BASEMENT');

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByRole('row', { name: /Grid B2/ })).toBeInTheDocument();
  });

  it('AC-9.9 the search still matches the detail of a record that has an area', async () => {
    const user = renderList(records);

    await user.type(screen.getByRole('searchbox', { name: 'Search inspections' }), 'r4-12');

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByRole('row', { name: /Level 3/ })).toBeInTheDocument();
  });
});

describe('Device queue panel: areas', () => {
  let offline: FakeOfflineServices;
  let queue: FakeQueueServices;

  beforeEach(() => {
    offline = createFakeOfflineServices();
    offline.connectivity.set(false);
    queue = createFakeQueueServices();
  });

  function renderPanel() {
    render(
      <OfflineProvider services={offline}>
        <QueueProvider services={queue}>
          <DeviceQueuePanel user={userWithRole('INSPECTOR')} onSignInAgain={vi.fn()} onSynced={vi.fn()} />
        </QueueProvider>
      </OfflineProvider>
    );
  }

  it('AC-9.9 a record waiting on the device shows its area before the detail', async () => {
    await queue.queueStore.add(draft({ areaId: AREA_ID, areaName: 'Level 3', location: 'Riser 2' }), []);

    renderPanel();

    expect(await screen.findByText('Level 3 · Riser 2')).toBeInTheDocument();
  });

  it('AC-9.9 a record waiting on the device with no area shows its location alone', async () => {
    await queue.queueStore.add(draft({ location: 'Level 2 riser' }), []);

    renderPanel();

    const row = await screen.findByRole('listitem', { name: /Level 2 riser/ });
    expect(within(row).getByText('Level 2 riser')).toBeInTheDocument();
  });
});
