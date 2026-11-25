import type { AiDraft, AiDraftGenerator } from '../ai/ai-draft-generator.js';
import { describeError, type Logger } from '../logger.js';
import type { RegisterClient } from '../register/register-client.js';
import { InspectionNotFoundError, REGISTER_REJECTIONS, RegisterRejectionError, ValidationError } from './errors.js';
import type { Inspection, SystemSnapshot } from './inspection.js';
import type { InspectionInput } from './inspection-input.js';
import type { CreateResult, InspectionStore } from './inspection-store.js';

/** The signed-in user a record is created for. */
export interface Actor {
  id: string;
  name: string;
}

export interface AiDraftResult {
  draft: AiDraft;
  inspection: Inspection;
}

export interface PhotoRemoval {
  inspection: Inspection;
  /** Public path of the photo that was taken off the record, so the caller can delete its file. */
  removedPath: string;
}

/** What a record copies from the register when its project or system is set. */
interface RegisterReference {
  projectName: string;
  system: SystemSnapshot;
}

/**
 * The rules for inspection records. It knows nothing about HTTP: callers hand it validated input and it
 * answers with records or throws the domain errors in errors.ts.
 */
export class InspectionService {
  constructor(
    private readonly store: InspectionStore,
    private readonly registerClient: RegisterClient,
    private readonly aiDraftGenerator: AiDraftGenerator,
    private readonly logger: Logger
  ) {}

  list(): Promise<Inspection[]> {
    return this.store.list();
  }

  async get(id: string): Promise<Inspection> {
    const inspection = await this.store.findById(id);
    if (!inspection) throw new InspectionNotFoundError();
    return inspection;
  }

  /**
   * Stores a new record after the register confirms its project and system. A repeat of an upload that
   * was already stored (same clientId) is answered with the stored record, without asking the register,
   * so a device can safely retry after a dropped connection even while the register is down.
   */
  async create(input: InspectionInput, actor: Actor, bearerToken: string): Promise<CreateResult> {
    if (input.clientId !== null) {
      const alreadyStored = await this.store.findByClientId(input.clientId);
      if (alreadyStored) return { inspection: alreadyStored, created: false };
    }
    const reference = await this.resolveReference(input.projectId, input.systemId, bearerToken);
    const result = await this.store.create({
      clientId: input.clientId,
      projectId: input.projectId,
      systemId: input.systemId,
      ...reference,
      location: input.location,
      notes: input.notes,
      status: input.status,
      inspectorId: actor.id,
      inspectorName: actor.name,
      observations: input.observations,
      photos: [],
      aiInstruction: null,
      aiSummary: null,
      aiStatus: 'NONE',
      capturedAt: input.capturedAt ?? new Date().toISOString()
    });
    this.logger.info('Inspection stored', { inspectionId: result.inspection.id, created: result.created });
    return result;
  }

  /**
   * Replaces the editable fields. The register is asked only when the project or system changes; otherwise
   * the record keeps the copy it already has, so it stays editable while the register is down.
   */
  async update(id: string, input: InspectionInput, bearerToken: string): Promise<Inspection> {
    const existing = await this.get(id);
    const sameReference = existing.projectId === input.projectId && existing.systemId === input.systemId;
    const reference: RegisterReference = sameReference
      ? { projectName: existing.projectName, system: existing.system }
      : await this.resolveReference(input.projectId, input.systemId, bearerToken);
    return this.save({
      ...existing,
      projectId: input.projectId,
      systemId: input.systemId,
      ...reference,
      location: input.location,
      notes: input.notes,
      status: input.status,
      observations: input.observations
    });
  }

  async delete(id: string): Promise<void> {
    if (!(await this.store.delete(id))) throw new InspectionNotFoundError();
    this.logger.info('Inspection deleted', { inspectionId: id });
  }

  async addPhotos(id: string, photoPaths: string[]): Promise<Inspection> {
    const existing = await this.get(id);
    return this.save({ ...existing, photos: [...existing.photos, ...photoPaths] });
  }

  async removePhoto(id: string, position: number): Promise<PhotoRemoval> {
    const existing = await this.get(id);
    const removedPath = existing.photos[position];
    if (removedPath === undefined) throw new ValidationError('Photo index out of range');
    const inspection = await this.save({
      ...existing,
      photos: existing.photos.filter((_, index) => index !== position)
    });
    return { inspection, removedPath };
  }

  /**
   * Asks the AI provider for a draft and stores the outcome on the record. The draft is text for a person
   * to review: this method never changes the record's status or any field other than the three AI ones.
   *
   * @throws AiProviderError after recording the failure on the record
   */
  async requestAiDraft(id: string, instruction: string): Promise<AiDraftResult> {
    const existing = await this.get(id);
    let draft: AiDraft;
    try {
      draft = await this.aiDraftGenerator.generate(existing, instruction);
    } catch (error) {
      this.logger.warn('AI draft failed', { inspectionId: id, reason: describeError(error) });
      await this.save({ ...existing, aiInstruction: instruction, aiSummary: null, aiStatus: 'FAILED' });
      throw error;
    }
    const inspection = await this.save({
      ...existing,
      aiInstruction: instruction,
      aiSummary: draft.summary,
      aiStatus: 'DONE'
    });
    return { draft, inspection };
  }

  private async save(inspection: Inspection): Promise<Inspection> {
    const saved = await this.store.update(inspection);
    if (!saved) throw new InspectionNotFoundError();
    return saved;
  }

  /**
   * @throws RegisterRejectionError when the project or system is missing or inactive
   * @throws RegisterUnavailableError when the register cannot answer
   */
  private async resolveReference(projectId: string, systemId: string, bearerToken: string): Promise<RegisterReference> {
    const [project, system] = await Promise.all([
      this.registerClient.findProject(projectId, bearerToken),
      this.registerClient.findSystem(projectId, systemId, bearerToken)
    ]);
    if (!project) throw new RegisterRejectionError(REGISTER_REJECTIONS.PROJECT_NOT_FOUND);
    if (!project.active) throw new RegisterRejectionError(REGISTER_REJECTIONS.PROJECT_INACTIVE);
    if (!system) throw new RegisterRejectionError(REGISTER_REJECTIONS.SYSTEM_NOT_FOUND);
    if (!system.active) throw new RegisterRejectionError(REGISTER_REJECTIONS.SYSTEM_INACTIVE);
    return {
      projectName: project.name,
      system: {
        code: system.code,
        substrate: system.substrate,
        serviceType: system.serviceType,
        fireRating: system.fireRating,
        materials: system.materials,
        installationMethod: system.installationMethod
      }
    };
  }
}
