import type { Inspection } from '../inspections/inspection.js';

export interface AiDraft {
  summary: string;
  /** 'mock' when no AI provider is configured and the built-in placeholder text was returned. */
  source: 'mock' | 'provider';
}

/**
 * Thrown when the AI provider could not produce a draft.
 */
export class AiProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}

/**
 * Drafts observation text from an inspection's photos and the user's instruction.
 * A draft is a suggestion for a person to review; it never decides compliance or sets a status.
 */
export interface AiDraftGenerator {
  /** @throws AiProviderError when the provider fails */
  generate(inspection: Inspection, instruction: string): Promise<AiDraft>;
}
