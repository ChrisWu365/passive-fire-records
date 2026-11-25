import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { issueToken } from '../../src/auth.js';
import type { Role } from '../../src/auth.js';
import { FakeAiDraftGenerator, FakeRegisterClient, PROJECT_ID, SYSTEM_ID } from './fakes.js';
import { InMemoryInspectionStore } from './in-memory-inspection-store.js';

export interface TestApp {
  app: Express;
  store: InMemoryInspectionStore;
  register: FakeRegisterClient;
  ai: FakeAiDraftGenerator;
  uploadDirectory: string;
  /** Removes the temporary upload directory. */
  cleanUp(): Promise<void>;
}

/** Builds the real HTTP application around in-memory fakes, with its own empty upload directory. */
export async function buildTestApp(): Promise<TestApp> {
  const store = new InMemoryInspectionStore();
  const register = new FakeRegisterClient();
  const ai = new FakeAiDraftGenerator();
  const uploadDirectory = await mkdtemp(path.join(tmpdir(), 'inspection-api-test-'));
  const app = createApp({ store, registerClient: register, aiDraftGenerator: ai, uploadDirectory });
  return {
    app,
    store,
    register,
    ai,
    uploadDirectory,
    cleanUp: () => rm(uploadDirectory, { recursive: true, force: true })
  };
}

export const INSPECTOR = { id: 'user-inspector', name: 'Demo Inspector' } as const;

/** A token exactly as the login endpoint issues it, for a user with the given role. */
export function tokenFor(role: Role): string {
  const user = role === 'INSPECTOR'
    ? { id: INSPECTOR.id, name: INSPECTOR.name }
    : { id: `user-${role.toLowerCase()}`, name: `Demo ${role}` };
  return issueToken({ ...user, email: `${role.toLowerCase()}@example.com`, role, passwordHash: 'not-used' });
}

export function bearer(role: Role): string {
  return `Bearer ${tokenFor(role)}`;
}

/** A valid create/update body that a test can spread and override. */
export function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: PROJECT_ID,
    systemId: SYSTEM_ID,
    location: 'Level 4, riser cupboard R4-12',
    notes: 'Pipe sealed after installation.',
    ...overrides
  };
}
