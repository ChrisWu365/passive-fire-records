import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api/api-error';
import { OfflinePanel } from '../offline/OfflinePanel';
import { OfflineProvider } from '../offline/offline-context';
import { createFakeOfflineServices, FIXED_NOW, snapshot, type FakeOfflineServices } from './offline-fakes';

let services: FakeOfflineServices;

beforeEach(() => {
  services = createFakeOfflineServices();
});

function renderPanel() {
  const view = render(<OfflineProvider services={services}><OfflinePanel /></OfflineProvider>);
  return { user: userEvent.setup(), container: view.container };
}

describe('Offline panel: what the device holds', () => {
  it('AC-5.1 says so when nothing has been downloaded yet', async () => {
    renderPanel();

    expect(await screen.findByText('The register has not been downloaded to this device yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download for offline' })).toBeEnabled();
  });

  it('AC-5.1 shows when the last download happened and how much it holds', async () => {
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);

    const { container } = renderPanel();

    expect(await screen.findByText(/2 projects, 2 systems/)).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', FIXED_NOW);
  });

  it('AC-5.1 renders nothing at all when the app runs without offline services', () => {
    const { container } = render(<OfflinePanel />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('Offline panel: downloading', () => {
  it('AC-5.1 "Download for offline" fetches the register, stores it and shows the result', async () => {
    const { user, container } = renderPanel();
    await screen.findByText('The register has not been downloaded to this device yet.');

    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByText('The register is saved on this device.')).toBeInTheDocument();
    expect(services.snapshotSource.fetchSnapshot).toHaveBeenCalledTimes(1);
    expect((await services.snapshotStore.info())?.downloadedAt).toBe(FIXED_NOW);
    expect(screen.getByText(/2 projects, 2 systems/)).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', FIXED_NOW);
    expect(screen.queryByText('The register has not been downloaded to this device yet.')).not.toBeInTheDocument();
  });

  it('AC-5.3 downloading again shows the new contents', async () => {
    const { user } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Download for offline' }));
    await screen.findByText(/2 projects, 2 systems/);
    const smaller = snapshot();
    smaller.projects = [{ ...smaller.projects[0], systems: [smaller.projects[0].systems[0]] }];
    services.snapshotSource.fetchSnapshot.mockResolvedValueOnce(smaller);

    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByText(/1 project, 1 system\b/)).toBeInTheDocument();
    expect(screen.queryByText(/2 projects, 2 systems/)).not.toBeInTheDocument();
  });

  it('AC-5.4 when the download cannot reach the register, it says so and keeps the earlier copy', async () => {
    await services.snapshotStore.replace(snapshot(), FIXED_NOW);
    services.snapshotSource.fetchSnapshot.mockRejectedValueOnce(
      new ApiError('The server could not be reached. Check your connection and try again.', 0)
    );
    const { user } = renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The register could not be downloaded because the server could not be reached. The copy on this device is unchanged.'
    );
    expect(screen.getByText(/2 projects, 2 systems/)).toBeInTheDocument();
  });

  it('AC-5.4 any other download failure is shown with the server\'s message', async () => {
    services.snapshotSource.fetchSnapshot.mockRejectedValueOnce(new ApiError('Invalid or expired token', 401));
    const { user } = renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired token');
  });

  it('AC-5.4 when the device cannot store the download, it says so', async () => {
    services.snapshotStore.failNextReplace = true;
    const { user } = renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The device store refused the write');
    expect(await services.snapshotStore.info()).toBeNull();
  });
});

describe('Offline panel: the connection indicator', () => {
  it('AC-5.4 shows "Online" while the device has a connection', async () => {
    renderPanel();

    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('AC-5.4 switches to "Offline" when the connection drops, and back when it returns', async () => {
    renderPanel();
    await screen.findByText('Online');

    act(() => services.connectivity.set(false));
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();

    act(() => services.connectivity.set(true));
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('AC-5.4 while offline, the download button is disabled and says why', async () => {
    services.connectivity.set(false);

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Download for offline' })).toBeDisabled();
    expect(screen.getByText('Connect to a network to download the register.')).toBeInTheDocument();
  });

  it('AC-5.4 stops listening for connection changes when it is removed from the page', async () => {
    const view = render(<OfflineProvider services={services}><OfflinePanel /></OfflineProvider>);
    await screen.findByText('Online');

    view.unmount();

    expect(services.connectivity.subscriberCount).toBe(0);
  });
});
