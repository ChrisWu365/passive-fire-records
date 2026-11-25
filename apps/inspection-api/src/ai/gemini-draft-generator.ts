import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Inspection } from '../inspections/inspection.js';
import { AiProviderError, type AiDraft, type AiDraftGenerator } from './ai-draft-generator.js';
import { detectImageMimeType } from './image-type.js';

export interface GeminiDraftGeneratorOptions {
  providerUrl: string;
  apiKey: string;
  model: string | undefined;
  /** Directory the uploaded photos are stored in. */
  uploadDirectory: string;
  /** How long to wait for the provider before giving up. */
  timeoutMs: number;
}

interface ImagePart {
  type: 'image';
  data: string;
  mime_type: string;
}

interface ProviderResponse {
  steps?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
}

const MODEL_OUTPUT_STEP = 'model_output';
const EMPTY_DRAFT = 'The AI provider returned no summary. A qualified inspector must review the evidence.';

/**
 * Drafts observation text with the Google Gemini API from the record's photos and the user's instruction.
 * The API key is sent only to the configured provider URL and is never logged or returned.
 */
export class GeminiDraftGenerator implements AiDraftGenerator {
  constructor(private readonly options: GeminiDraftGeneratorOptions) {}

  async generate(inspection: Inspection, instruction: string): Promise<AiDraft> {
    const images = await Promise.all(inspection.photos.map((photo) => this.readImage(photo)));
    const response = await this.callProvider(instruction, images);
    const text = (response.steps ?? [])
      .find((step) => step.type === MODEL_OUTPUT_STEP)
      ?.content?.map((item) => item.text ?? '')
      .join(' ')
      .trim();
    return { summary: text || EMPTY_DRAFT, source: 'provider' };
  }

  private async readImage(photoPath: string): Promise<ImagePart> {
    // Only the file name is used, so a stored path can never point outside the upload directory.
    const fileName = path.basename(photoPath);
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(this.options.uploadDirectory, fileName));
    } catch (error) {
      throw new AiProviderError(`Photo ${fileName} could not be read for the AI draft`, { cause: error });
    }
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) throw new AiProviderError(`Photo ${fileName} is not a JPEG, PNG or WebP image`);
    return { type: 'image', data: bytes.toString('base64'), mime_type: mimeType };
  }

  private async callProvider(instruction: string, images: ImagePart[]): Promise<ProviderResponse> {
    let response: Response;
    try {
      response = await fetch(this.options.providerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify({ model: this.options.model, input: [{ type: 'text', text: instruction }, ...images] }),
        signal: AbortSignal.timeout(this.options.timeoutMs)
      });
    } catch (error) {
      throw new AiProviderError('The AI provider could not be reached', { cause: error });
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AiProviderError(`AI provider request failed with status ${response.status}`);
    }
    try {
      return (await response.json()) as ProviderResponse;
    } catch (error) {
      throw new AiProviderError('The AI provider sent an unreadable answer', { cause: error });
    }
  }
}
