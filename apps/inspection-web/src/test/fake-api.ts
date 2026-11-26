import { vi, type Mock } from 'vitest';
import type { Api, AuthApi, InspectionApi, RegisterApi } from '../api/api';
import type {
  Area,
  AreaInput,
  FirestopSystem,
  FirestopSystemInput,
  Inspection,
  InspectionInput,
  Project,
  ProjectInput,
  Role,
  Session,
  User
} from '../api/types';

export const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
export const INACTIVE_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
export const SECOND_PROJECT_ID = '66666666-6666-4666-8666-666666666666';
export const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
export const SECOND_SYSTEM_ID = '44444444-4444-4444-8444-444444444444';
export const INACTIVE_SYSTEM_ID = '55555555-5555-4555-8555-555555555555';
export const INSPECTION_ID = '77777777-7777-4777-8777-777777777777';
export const AREA_ID = '88888888-8888-4888-8888-888888888801';
export const SECOND_AREA_ID = '88888888-8888-4888-8888-888888888802';
export const INACTIVE_AREA_ID = '88888888-8888-4888-8888-888888888803';
export const SECOND_PROJECT_AREA_ID = '88888888-8888-4888-8888-888888888804';

export function userWithRole(role: Role): User {
  return { id: `user-${role.toLowerCase()}`, email: `${role.toLowerCase()}@example.com`, name: `Demo ${role}`, role };
}

/** Stores a session the way the app does, so a test can start already signed in. */
export function signInAs(role: Role): void {
  localStorage.setItem('inspection-token', `token-for-${role}`);
  localStorage.setItem('inspection-user', JSON.stringify(userWithRole(role)));
}

function system(id: string, projectId: string, code: string, materials: string, active = true): FirestopSystem {
  return {
    id,
    projectId,
    code,
    substrate: 'Plasterboard wall',
    serviceType: 'Plastic pipe up to 50 mm',
    fireRating: '-/60/60',
    materials,
    installationMethod: 'Fit one collar on each side of the wall.',
    active
  };
}

export function storedInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: INSPECTION_ID,
    clientId: null,
    projectId: PROJECT_ID,
    projectName: 'Harbour View Apartments',
    systemId: SYSTEM_ID,
    system: {
      code: 'SYS-01',
      substrate: 'Plasterboard wall',
      serviceType: 'Plastic pipe up to 50 mm',
      fireRating: '-/60/60',
      materials: 'Demo collar A',
      installationMethod: 'Fit one collar on each side of the wall.'
    },
    areaId: null,
    areaName: null,
    location: 'Level 4, riser cupboard R4-12',
    notes: 'Pipe sealed after installation.',
    status: 'IN_PROGRESS',
    inspectorId: 'user-inspector',
    inspectorName: 'Demo INSPECTOR',
    observations: [],
    photos: [],
    aiInstruction: null,
    aiSummary: null,
    aiStatus: 'NONE',
    capturedAt: '2030-05-01T08:10:00.000Z',
    createdAt: '2030-05-01T08:10:00.000Z',
    updatedAt: '2030-05-01T08:10:00.000Z',
    ...overrides
  };
}

export interface FakeApi extends Api {
  auth: { [K in keyof AuthApi]: Mock<AuthApi[K]> };
  register: { [K in keyof RegisterApi]: Mock<RegisterApi[K]> };
  inspections: { [K in keyof InspectionApi]: Mock<InspectionApi[K]> };
  /** The fake's data, for assertions and for arranging a scenario before rendering. */
  state: {
    projects: Project[];
    systems: FirestopSystem[];
    areas: Area[];
    inspections: Inspection[];
  };
}

/**
 * An in-memory Api that behaves like the two services for the happy path. It starts with two active
 * projects and one inactive one; the first project has two active systems and one inactive system,
 * and two active areas and one inactive area; the second project has one area.
 * Every method is a vi.fn, so a test can check the calls or make one call fail.
 */
export function createFakeApi(): FakeApi {
  let nextId = 1;
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  const state: FakeApi['state'] = {
    projects: [
      { id: PROJECT_ID, code: 'HVA', name: 'Harbour View Apartments', address: '1 Quay Street', active: true },
      { id: SECOND_PROJECT_ID, code: 'MKT', name: 'Market Square Offices', address: null, active: true },
      { id: INACTIVE_PROJECT_ID, code: 'OLD', name: 'Old Depot', address: null, active: false }
    ],
    systems: [
      system(SYSTEM_ID, PROJECT_ID, 'SYS-01', 'Demo collar A'),
      system(SECOND_SYSTEM_ID, PROJECT_ID, 'SYS-02', 'Demo sealant B'),
      system(INACTIVE_SYSTEM_ID, PROJECT_ID, 'SYS-03', 'Demo putty C', false)
    ],
    areas: [
      { id: AREA_ID, projectId: PROJECT_ID, name: 'Level 3', active: true },
      { id: SECOND_AREA_ID, projectId: PROJECT_ID, name: 'Basement car park', active: true },
      { id: INACTIVE_AREA_ID, projectId: PROJECT_ID, name: 'Old site office', active: false },
      { id: SECOND_PROJECT_AREA_ID, projectId: SECOND_PROJECT_ID, name: 'Ground floor', active: true }
    ],
    inspections: []
  };

  const findSystem = (projectId: string, systemId: string): FirestopSystem => {
    const found = state.systems.find((item) => item.id === systemId && item.projectId === projectId);
    if (!found) throw new Error(`The fake register has no system ${systemId} in project ${projectId}`);
    return found;
  };
  const findInspection = (id: string): Inspection => {
    const found = state.inspections.find((item) => item.id === id);
    if (!found) throw new Error(`The fake has no inspection ${id}`);
    return found;
  };
  /** The area fields a record gets from its input: the id and the register's current name, or none. */
  const areaFor = (input: InspectionInput) => {
    const area = state.areas.find((item) => item.id === input.areaId && item.projectId === input.projectId);
    return { areaId: area?.id ?? null, areaName: area?.name ?? null };
  };
  const byName = (left: Area, right: Area) => left.name.localeCompare(right.name);
  const replaceInspection = (next: Inspection): Inspection => {
    state.inspections = state.inspections.map((item) => (item.id === next.id ? next : item));
    return next;
  };
  const referenceFor = (input: InspectionInput) => {
    const project = state.projects.find((item) => item.id === input.projectId);
    const { id: _id, projectId: _projectId, active: _active, ...snapshot } = findSystem(input.projectId, input.systemId);
    return { projectName: project?.name ?? '', system: snapshot };
  };

  return {
    state,
    auth: {
      login: vi.fn(async (email: string): Promise<Session> => {
        const role = email.split('@')[0].toUpperCase() as Role;
        return { token: `token-for-${role}`, user: userWithRole(role) };
      })
    },
    register: {
      listProjects: vi.fn(async () => state.projects.map((item) => ({ ...item }))),
      createProject: vi.fn(async (input: ProjectInput) => {
        const created: Project = {
          id: newId(), code: input.code, name: input.name, address: input.address ?? null, active: input.active ?? true
        };
        state.projects = [...state.projects, created];
        return { ...created };
      }),
      updateProject: vi.fn(async (projectId: string, input: ProjectInput) => {
        const existing = state.projects.find((item) => item.id === projectId);
        if (!existing) throw new Error(`The fake register has no project ${projectId}`);
        const updated: Project = {
          ...existing, code: input.code, name: input.name, address: input.address ?? null,
          active: input.active ?? existing.active
        };
        state.projects = state.projects.map((item) => (item.id === projectId ? updated : item));
        return { ...updated };
      }),
      listSystems: vi.fn(async (projectId: string) =>
        state.systems.filter((item) => item.projectId === projectId).map((item) => ({ ...item }))),
      createSystem: vi.fn(async (projectId: string, input: FirestopSystemInput) => {
        const created: FirestopSystem = { ...input, id: newId(), projectId, active: input.active ?? true };
        state.systems = [...state.systems, created];
        return { ...created };
      }),
      updateSystem: vi.fn(async (projectId: string, systemId: string, input: FirestopSystemInput) => {
        const existing = findSystem(projectId, systemId);
        const updated: FirestopSystem = { ...existing, ...input, active: input.active ?? existing.active };
        state.systems = state.systems.map((item) => (item.id === systemId ? updated : item));
        return { ...updated };
      }),
      listAreas: vi.fn(async (projectId: string) =>
        state.areas.filter((item) => item.projectId === projectId).sort(byName).map((item) => ({ ...item }))),
      createArea: vi.fn(async (projectId: string, input: AreaInput) => {
        const created: Area = { id: newId(), projectId, name: input.name, active: input.active ?? true };
        state.areas = [...state.areas, created];
        return { ...created };
      }),
      updateArea: vi.fn(async (projectId: string, areaId: string, input: AreaInput) => {
        const existing = state.areas.find((item) => item.id === areaId && item.projectId === projectId);
        if (!existing) throw new Error(`The fake register has no area ${areaId} in project ${projectId}`);
        const updated: Area = { ...existing, name: input.name, active: input.active ?? existing.active };
        state.areas = state.areas.map((item) => (item.id === areaId ? updated : item));
        return { ...updated };
      })
    },
    inspections: {
      list: vi.fn(async () => state.inspections.map((item) => ({ ...item }))),
      create: vi.fn(async (input: InspectionInput) => {
        const created = storedInspection({
          ...input, ...referenceFor(input), ...areaFor(input), id: newId(), status: input.status
        });
        state.inspections = [created, ...state.inspections];
        return { ...created };
      }),
      update: vi.fn(async (id: string, input: InspectionInput) => {
        const existing = findInspection(id);
        const sameReference = existing.projectId === input.projectId && existing.systemId === input.systemId;
        const reference = sameReference
          ? { projectName: existing.projectName, system: existing.system }
          : referenceFor(input);
        // A record keeps its own copy of the area's name while it still refers to the same area.
        const area = sameReference && existing.areaId === (input.areaId ?? null)
          ? { areaId: existing.areaId, areaName: existing.areaName }
          : areaFor(input);
        return { ...replaceInspection({ ...existing, ...input, ...reference, ...area }) };
      }),
      uploadPhotos: vi.fn(async (id: string, files: File[]) => {
        const existing = findInspection(id);
        const added = files.map((file) => `/uploads/${file.name}`);
        return { ...replaceInspection({ ...existing, photos: [...existing.photos, ...added] }) };
      }),
      deletePhoto: vi.fn(async (id: string, position: number) => {
        const existing = findInspection(id);
        return { ...replaceInspection({ ...existing, photos: existing.photos.filter((_, index) => index !== position) }) };
      }),
      requestAiDraft: vi.fn(async (id: string, instruction: string) => {
        const existing = findInspection(id);
        const summary = `Draft for ${existing.location}`;
        const inspection = replaceInspection({
          ...existing, aiInstruction: instruction, aiSummary: summary, aiStatus: 'DONE'
        });
        return { summary, source: 'mock' as const, requiresReview: true as const, inspection: { ...inspection } };
      })
    }
  };
}
