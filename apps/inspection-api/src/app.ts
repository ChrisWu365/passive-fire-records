import cors from 'cors';
import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { AiDraftGenerator } from './ai/ai-draft-generator.js';
import { createAuthRoutes } from './http/auth-routes.js';
import { createErrorHandler } from './http/error-handler.js';
import { createInspectionRoutes } from './http/inspection-routes.js';
import { openApiDocument } from './http/openapi.js';
import { InspectionService } from './inspections/inspection-service.js';
import type { InspectionStore } from './inspections/inspection-store.js';
import { SILENT_LOGGER, type Logger } from './logger.js';
import type { RegisterClient } from './register/register-client.js';

export interface AppDependencies {
  store: InspectionStore;
  registerClient: RegisterClient;
  aiDraftGenerator: AiDraftGenerator;
  /** Directory where uploaded photos are written and served from under /uploads. */
  uploadDirectory: string;
  /** Defaults to a logger that discards everything. */
  logger?: Logger;
  /** Origins allowed by CORS. When omitted, any origin is allowed, which suits local development only. */
  webOrigins?: string[];
}

const JSON_BODY_LIMIT = '1mb';

/**
 * Builds the HTTP application from its dependencies. It does not listen on a port, connect to a database,
 * or read the environment; server.ts does that. Tests pass fakes here.
 */
export function createApp(dependencies: AppDependencies): Express {
  const logger = dependencies.logger ?? SILENT_LOGGER;
  const service = new InspectionService(
    dependencies.store,
    dependencies.registerClient,
    dependencies.aiDraftGenerator,
    logger
  );
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: dependencies.webOrigins ?? true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/uploads', express.static(dependencies.uploadDirectory));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api-docs.json', (_request, response) => {
    response.json(openApiDocument);
  });
  app.get('/health', (_request, response) => {
    response.json({ status: 'UP' });
  });

  app.use('/api', createAuthRoutes());
  app.use(
    '/api/inspections',
    createInspectionRoutes({ service, uploadDirectory: dependencies.uploadDirectory, logger })
  );

  app.use(createErrorHandler(logger));
  return app;
}
