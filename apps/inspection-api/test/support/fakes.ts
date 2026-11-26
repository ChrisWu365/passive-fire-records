import type { AiDraft, AiDraftGenerator } from '../../src/ai/ai-draft-generator.js';
import { AiProviderError } from '../../src/ai/ai-draft-generator.js';
import type { Inspection } from '../../src/inspections/inspection.js';
import type {
  RegisterArea,
  RegisterClient,
  RegisterProject,
  RegisterSystem
} from '../../src/register/register-client.js';
import { RegisterUnavailableError } from '../../src/register/register-client.js';

export const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
export const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
export const SECOND_SYSTEM_ID = '44444444-4444-4444-8444-444444444444';
export const OTHER_PROJECT_SYSTEM_ID = '55555555-5555-4555-8555-555555555555';
export const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';
export const AREA_ID = '66666666-6666-4666-8666-666666666666';
export const SECOND_AREA_ID = '77777777-7777-4777-8777-777777777777';
export const OTHER_PROJECT_AREA_ID = '88888888-8888-4888-8888-888888888888';

export interface RegisterCall {
  method: 'findProject' | 'findSystem' | 'findArea';
  projectId: string;
  systemId?: string;
  areaId?: string;
  bearerToken: string;
}

/**
 * Test double for the register service. It starts with one active project holding two active systems,
 * and a second project holding one system. The first project has two active areas and the second has one.
 * Tests change that data, or set `unavailable`, to cover each answer.
 */
export class FakeRegisterClient implements RegisterClient {
  readonly projects = new Map<string, RegisterProject>();
  readonly systems = new Map<string, RegisterSystem>();
  readonly areas = new Map<string, RegisterArea>();
  readonly calls: RegisterCall[] = [];
  unavailable = false;

  constructor() {
    this.projects.set(PROJECT_ID, { id: PROJECT_ID, code: 'HVA', name: 'Harbour View Apartments', active: true });
    this.projects.set(OTHER_PROJECT_ID, { id: OTHER_PROJECT_ID, code: 'OTH', name: 'Other Project', active: true });
    this.systems.set(SYSTEM_ID, system(SYSTEM_ID, PROJECT_ID, 'SYS-01', 'Demo collar A'));
    this.systems.set(SECOND_SYSTEM_ID, system(SECOND_SYSTEM_ID, PROJECT_ID, 'SYS-02', 'Demo sealant B'));
    this.systems.set(
      OTHER_PROJECT_SYSTEM_ID,
      system(OTHER_PROJECT_SYSTEM_ID, OTHER_PROJECT_ID, 'SYS-01', 'Demo putty C')
    );
    this.areas.set(AREA_ID, { id: AREA_ID, projectId: PROJECT_ID, name: 'Level 4', active: true });
    this.areas.set(
      SECOND_AREA_ID,
      { id: SECOND_AREA_ID, projectId: PROJECT_ID, name: 'Basement car park', active: true }
    );
    this.areas.set(
      OTHER_PROJECT_AREA_ID,
      { id: OTHER_PROJECT_AREA_ID, projectId: OTHER_PROJECT_ID, name: 'Level 1', active: true }
    );
  }

  async findProject(projectId: string, bearerToken: string): Promise<RegisterProject | undefined> {
    this.calls.push({ method: 'findProject', projectId, bearerToken });
    this.failIfUnavailable();
    return this.projects.get(projectId);
  }

  async findSystem(projectId: string, systemId: string, bearerToken: string): Promise<RegisterSystem | undefined> {
    this.calls.push({ method: 'findSystem', projectId, systemId, bearerToken });
    this.failIfUnavailable();
    const found = this.systems.get(systemId);
    return found && found.projectId === projectId ? found : undefined;
  }

  async findArea(projectId: string, areaId: string, bearerToken: string): Promise<RegisterArea | undefined> {
    this.calls.push({ method: 'findArea', projectId, areaId, bearerToken });
    this.failIfUnavailable();
    const found = this.areas.get(areaId);
    return found && found.projectId === projectId ? found : undefined;
  }

  private failIfUnavailable(): void {
    if (this.unavailable) throw new RegisterUnavailableError('The fake register is switched off');
  }
}

function system(id: string, projectId: string, code: string, materials: string): RegisterSystem {
  return {
    id,
    projectId,
    code,
    substrate: 'Plasterboard wall',
    serviceType: 'Plastic pipe up to 50 mm',
    fireRating: '-/60/60',
    materials,
    installationMethod: 'Fit one collar on each side of the wall.',
    active: true
  };
}

export interface AiCall {
  inspectionId: string;
  instruction: string;
}

/** Test double for the AI provider: returns a fixed draft, or fails when `failing` is set. */
export class FakeAiDraftGenerator implements AiDraftGenerator {
  readonly calls: AiCall[] = [];
  failing = false;

  async generate(inspection: Inspection, instruction: string): Promise<AiDraft> {
    this.calls.push({ inspectionId: inspection.id, instruction });
    if (this.failing) throw new AiProviderError('The fake AI provider is switched off');
    return { summary: `Draft for ${inspection.location}`, source: 'provider' };
  }
}
