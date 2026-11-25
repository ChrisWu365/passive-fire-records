import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../auth.js';
import { InspectionNotFoundError, ValidationError } from '../inspections/errors.js';
import { isUuid, parseInspectionInput } from '../inspections/inspection-input.js';
import type { Actor, InspectionService } from '../inspections/inspection-service.js';
import { describeError, type Logger } from '../logger.js';

export interface InspectionRoutesOptions {
  service: InspectionService;
  uploadDirectory: string;
  logger: Logger;
}

const CREATED = 201;
const OK = 200;
const NO_CONTENT = 204;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_UPLOAD = 5;
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOADS_PUBLIC_PATH = '/uploads';

const MAX_INSTRUCTION_LENGTH = 2000;
const DEFAULT_AI_INSTRUCTION =
  'Provide a concise, non-definitive passive fire inspection observation draft. Never decide compliance. '
  + 'State that a qualified human must verify the result.';

/** Inspection record endpoints. Mounted under /api/inspections. */
export function createInspectionRoutes(options: InspectionRoutesOptions): Router {
  const { service, uploadDirectory, logger } = options;
  const router = Router();
  const canEdit = requireRole('ADMIN', 'INSPECTOR');
  const upload = multer({
    dest: uploadDirectory,
    limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_UPLOAD },
    // Files of other types are dropped without failing the request, as the web form expects.
    fileFilter: (_request, file, callback) => callback(null, ACCEPTED_PHOTO_TYPES.includes(file.mimetype))
  });

  router.use(requireAuth);

  router.get('/', async (_request, response) => {
    response.json(await service.list());
  });

  router.get('/:id', async (request, response) => {
    response.json(await service.get(inspectionId(request)));
  });

  router.post('/', canEdit, async (request: AuthenticatedRequest, response) => {
    const input = parseInspectionInput(request.body);
    const result = await service.create(input, actor(request), bearerToken(request));
    response.status(result.created ? CREATED : OK).json(result.inspection);
  });

  router.put('/:id', canEdit, async (request: AuthenticatedRequest, response) => {
    const id = inspectionId(request);
    const input = parseInspectionInput(request.body);
    response.json(await service.update(id, input, bearerToken(request)));
  });

  router.delete('/:id', requireRole('ADMIN'), async (request, response) => {
    await service.delete(inspectionId(request));
    response.status(NO_CONTENT).send();
  });

  router.post('/:id/photos', canEdit, upload.array('photos', MAX_PHOTOS_PER_UPLOAD), async (request, response) => {
    const files = Array.isArray(request.files) ? request.files : [];
    const photoPaths = files.map((file) => `${UPLOADS_PUBLIC_PATH}/${file.filename}`);
    try {
      response.json(await service.addPhotos(inspectionId(request), photoPaths));
    } catch (error) {
      // The record did not take the photos, so their files must not be left behind.
      await Promise.all(photoPaths.map((photoPath) => removeFile(uploadDirectory, photoPath, logger)));
      throw error;
    }
  });

  router.delete('/:id/photos/:photoIndex', canEdit, async (request, response) => {
    const removal = await service.removePhoto(inspectionId(request), photoIndex(request));
    await removeFile(uploadDirectory, removal.removedPath, logger);
    response.json(removal.inspection);
  });

  router.post('/:id/ai-summary', canEdit, async (request, response) => {
    const result = await service.requestAiDraft(inspectionId(request), aiInstruction(request.body));
    response.json({
      summary: result.draft.summary,
      source: result.draft.source,
      requiresReview: true,
      inspection: result.inspection
    });
  });

  return router;
}

/** A value that is not a UUID cannot name a record, so it is "not found", never a database error. */
function inspectionId(request: Request): string {
  const id = request.params.id;
  if (!isUuid(id)) throw new InspectionNotFoundError();
  return id.toLowerCase();
}

function photoIndex(request: Request): number {
  const raw = String(request.params.photoIndex);
  if (!/^\d+$/.test(raw)) throw new ValidationError('Invalid photo index');
  return Number(raw);
}

function aiInstruction(body: unknown): string {
  const value = (body as { instruction?: unknown } | undefined)?.instruction;
  if (value === undefined || value === null || value === '') return DEFAULT_AI_INSTRUCTION;
  if (typeof value !== 'string') throw new ValidationError('instruction must be text');
  if (value.length > MAX_INSTRUCTION_LENGTH) {
    throw new ValidationError(`instruction must be at most ${MAX_INSTRUCTION_LENGTH} characters`);
  }
  return value;
}

function actor(request: AuthenticatedRequest): Actor {
  if (!request.user) throw new Error('requireAuth must run before this handler');
  return { id: request.user.id, name: request.user.name };
}

function bearerToken(request: AuthenticatedRequest): string {
  if (!request.bearerToken) throw new Error('requireAuth must run before this handler');
  return request.bearerToken;
}

async function removeFile(uploadDirectory: string, photoPath: string, logger: Logger): Promise<void> {
  // Only the file name is used, so a stored path can never reach outside the upload directory.
  const fileName = path.basename(photoPath);
  try {
    await unlink(path.join(uploadDirectory, fileName));
  } catch (error) {
    logger.warn('Photo file could not be removed', { fileName, reason: describeError(error) });
  }
}
