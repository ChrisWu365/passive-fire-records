import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { AiProviderError } from '../ai/ai-draft-generator.js';
import { InspectionNotFoundError, RegisterRejectionError, ValidationError } from '../inspections/errors.js';
import { describeError, type Logger } from '../logger.js';
import { RegisterUnavailableError } from '../register/register-client.js';

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const INTERNAL_ERROR = 500;
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;

const REGISTER_UNAVAILABLE = 'The register service is unavailable. Try again later.';
const AI_FAILED = 'The AI provider failed. The record was kept; try again later.';
const UNREADABLE_BODY = 'The request body is not valid JSON';
const INTERNAL = 'Internal server error';

interface HttpError {
  status: number;
  message: string;
}

/** Errors raised by Express's own body parser carry a type and a status. */
interface BodyParserError {
  type?: string;
  status?: number;
}

/**
 * Turns every error into the API's single shape, { "error": "..." }. Domain errors carry messages written
 * for the client. Anything unexpected is logged and answered with a fixed message, so internal details
 * such as SQL or stack traces never reach a response.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const known = toHttpError(error);
    if (known) {
      if (error instanceof RegisterUnavailableError) {
        logger.warn('Register service unavailable', { path: request.path, reason: describeError(error) });
      }
      response.status(known.status).json({ error: known.message });
      return;
    }
    logger.error('Unhandled error', { method: request.method, path: request.path, reason: describeError(error) });
    response.status(INTERNAL_ERROR).json({ error: INTERNAL });
  };
}

function toHttpError(error: unknown): HttpError | undefined {
  if (error instanceof ValidationError) return { status: BAD_REQUEST, message: error.message };
  if (error instanceof InspectionNotFoundError) return { status: NOT_FOUND, message: error.message };
  if (error instanceof RegisterRejectionError) return { status: UNPROCESSABLE, message: error.reason };
  if (error instanceof RegisterUnavailableError) return { status: SERVICE_UNAVAILABLE, message: REGISTER_UNAVAILABLE };
  if (error instanceof AiProviderError) return { status: BAD_GATEWAY, message: AI_FAILED };
  if (error instanceof multer.MulterError) return { status: BAD_REQUEST, message: `Upload rejected: ${error.message}` };
  const parserError = error as BodyParserError | null;
  if (parserError?.type === 'entity.parse.failed') return { status: BAD_REQUEST, message: UNREADABLE_BODY };
  if (parserError?.type === 'entity.too.large') return { status: BAD_REQUEST, message: 'The request body is too large' };
  return undefined;
}
