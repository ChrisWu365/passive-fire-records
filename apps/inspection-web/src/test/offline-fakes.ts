import { vi, type Mock } from 'vitest';
import type { Area, FirestopSystem, Project } from '../api/types';
import type { Connectivity } from '../offline/connectivity';
import type { OfflineServices } from '../offline/offline-context';
import type { RegisterSnapshot, SnapshotInfo } from '../offline/snapshot';
import type { SnapshotSource } from '../offline/snapshot-download';
import type { SnapshotStore } from '../offline/snapshot-store';

export const DOWNLOADED_PROJECT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
export const DOWNLOADED_SYSTEM_ID = 'aaaaaaaa-0000-4000-8000-000000000101';
export const SECOND_DOWNLOADED_SYSTEM_ID = 'aaaaaaaa-0000-4000-8000-000000000102';
export const SECOND_DOWNLOADED_PROJECT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

export const DOWNLOADED_AREA_ID = 'aaaaaaaa-0000-4000-8000-000000000201';
export const SECOND_DOWNLOADED_AREA_ID = 'aaaaaaaa-0000-4000-8000-000000000202';
export const FIXED_NOW = '2030-06-01T07:15:00.000Z';

/** A register snapshot with two projects: one with two systems and two areas, one with neither. */
export function snapshot(overrides: Partial<RegisterSnapshot> = {}): RegisterSnapshot {
  return {
    generatedAt: '2030-06-01T07:14:58.000Z',
    projects: [
      {
        id: DOWNLOADED_PROJECT_ID,
        code: 'DWN',
        name: 'Downloaded Tower',
        address: '5 Device Lane',
        systems: [
          {
            id: DOWNLOADED_SYSTEM_ID,
            code: 'SYS-11',
            substrate: 'Concrete wall',
            serviceType: 'Cable tray',
            fireRating: '-/90/90',
            materials: 'Demo pillow K',
            installationMethod: 'Pack the tray opening with pillows.'
          },
          {
            id: SECOND_DOWNLOADED_SYSTEM_ID,
            code: 'SYS-12',
            substrate: 'Concrete floor',
            serviceType: 'Copper pipe',
            fireRating: '-/60/60',
            materials: 'Demo sealant L',
            installationMethod: 'Seal around the pipe.'
          }
        ],
        areas: [
          { id: DOWNLOADED_AREA_ID, name: 'Podium level' },
          { id: SECOND_DOWNLOADED_AREA_ID, name: 'Basement plant room' }
        ]
      },
      {
        id: SECOND_DOWNLOADED_PROJECT_ID, code: 'EMP', name: 'Empty Annex', address: null,
        systems: [], areas: []
      }
    ],
    ...overrides
  };
}

/** Test double for the device's local copy: follows the SnapshotStore contract, in memory. */
export class InMemorySnapshotStore implements SnapshotStore {
  private stored: { snapshot: RegisterSnapshot; downloadedAt: string } | null = null;
  /** Set to make the next replace fail, as a full or broken device store would. */
  failNextReplace = false;

  async replace(next: RegisterSnapshot, downloadedAt: string): Promise<void> {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error('The device store refused the write');
    }
    this.stored = { snapshot: structuredClone(next), downloadedAt };
  }

  async info(): Promise<SnapshotInfo | null> {
    if (!this.stored) return null;
    const { snapshot: held, downloadedAt } = this.stored;
    return {
      generatedAt: held.generatedAt,
      downloadedAt,
      projectCount: held.projects.length,
      systemCount: held.projects.reduce((total, project) => total + project.systems.length, 0)
    };
  }

  async listProjects(): Promise<Project[]> {
    return (this.stored?.snapshot.projects ?? [])
      .map(({ systems: _systems, areas: _areas, ...project }) => ({ ...project, active: true }))
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  async listSystems(projectId: string): Promise<FirestopSystem[]> {
    const project = this.stored?.snapshot.projects.find((item) => item.id === projectId);
    return (project?.systems ?? [])
      .map((system) => ({ ...system, projectId, active: true }))
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  async listAreas(projectId: string): Promise<Area[]> {
    const project = this.stored?.snapshot.projects.find((item) => item.id === projectId);
    return (project?.areas ?? [])
      .map((area) => ({ ...area, projectId, active: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

/** Test double for the browser's online/offline state. */
export class FakeConnectivity implements Connectivity {
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(private online = true) {}

  isOnline(): boolean {
    return this.online;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Changes the state and notifies subscribers, as the browser's online/offline events would. */
  set(online: boolean): void {
    this.online = online;
    this.listeners.forEach((listener) => listener(online));
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

export interface FakeOfflineServices extends OfflineServices {
  connectivity: FakeConnectivity;
  snapshotStore: InMemorySnapshotStore;
  snapshotSource: { fetchSnapshot: Mock<SnapshotSource['fetchSnapshot']> };
}

/** Offline services for component tests: online, nothing downloaded, the clock fixed at FIXED_NOW. */
export function createFakeOfflineServices(): FakeOfflineServices {
  return {
    connectivity: new FakeConnectivity(true),
    snapshotStore: new InMemorySnapshotStore(),
    snapshotSource: { fetchSnapshot: vi.fn(async () => snapshot()) },
    now: () => new Date(FIXED_NOW)
  };
}
