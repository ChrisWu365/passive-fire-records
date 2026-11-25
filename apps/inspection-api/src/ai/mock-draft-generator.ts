import type { Inspection } from '../inspections/inspection.js';
import type { AiDraft, AiDraftGenerator } from './ai-draft-generator.js';

/**
 * Used when no AI provider is configured. It returns fixed, clearly labelled text, so the rest of the
 * workflow can be exercised without a provider key. It reads no photos and calls nothing.
 */
export class MockDraftGenerator implements AiDraftGenerator {
  async generate(inspection: Inspection, _instruction: string): Promise<AiDraft> {
    const evidence = inspection.photos.length > 0 ? 'uploaded site photo and ' : '';
    return {
      summary:
        `Demo suggestion: review the ${evidence}notes for ${inspection.location}. Confirm the tested system, `
        + 'installation condition, penetration details, and required remedial action before issuing a report.',
      source: 'mock'
    };
  }
}
