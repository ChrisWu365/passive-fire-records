import { mkdir } from 'node:fs/promises';
import type { Server } from 'node:http';
import pg from 'pg';
import type { AiDraftGenerator } from './ai/ai-draft-generator.js';
import { GeminiDraftGenerator } from './ai/gemini-draft-generator.js';
import { MockDraftGenerator } from './ai/mock-draft-generator.js';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config.js';
import { migrate } from './database/migrator.js';
import { PostgresInspectionStore } from './inspections/postgres-inspection-store.js';
import { describeError, JsonLogger, type Logger } from './logger.js';
import { HttpRegisterClient } from './register/http-register-client.js';

const DATABASE_POOL_SIZE = 5;
const AI_TIMEOUT_MS = 60_000;
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const FAILURE_EXIT_CODE = 1;

/**
 * Composition root: reads the configuration, connects the real dependencies, and starts listening.
 * Everything testable lives behind createApp; this file only wires and starts.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = new JsonLogger(config.logLevel);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: DATABASE_POOL_SIZE });
  pool.on('error', (error) => logger.error('Idle database connection failed', { reason: describeError(error) }));

  const migration = await migrate(pool, config.databaseSchema);
  logger.info('Database schema is current', { schema: config.databaseSchema, applied: migration.applied.length });
  await mkdir(config.uploadDirectory, { recursive: true });

  const app = createApp({
    store: new PostgresInspectionStore(pool, config.databaseSchema),
    registerClient: new HttpRegisterClient({
      baseUrl: config.registerServiceUrl,
      timeoutMs: config.registerTimeoutMs
    }),
    aiDraftGenerator: aiDraftGenerator(config, logger),
    uploadDirectory: config.uploadDirectory,
    webOrigins: config.webOrigins,
    logger
  });
  const server = app.listen(config.port, () => {
    logger.info('Inspection API listening', { port: config.port, register: config.registerServiceUrl });
  });
  shutDownOnSignal(server, pool, logger);
}

function aiDraftGenerator(config: AppConfig, logger: Logger): AiDraftGenerator {
  if (!config.ai) {
    logger.info('No AI provider configured; AI drafts will be labelled mock text');
    return new MockDraftGenerator();
  }
  return new GeminiDraftGenerator({
    ...config.ai,
    uploadDirectory: config.uploadDirectory,
    timeoutMs: AI_TIMEOUT_MS
  });
}

/** Stops accepting requests, lets in-flight ones finish, then closes the database pool. */
function shutDownOnSignal(server: Server, pool: pg.Pool, logger: Logger): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      logger.info('Shutting down', { signal });
      server.close(() => {
        pool.end()
          .catch((error: unknown) => logger.error('Closing the database pool failed', { reason: describeError(error) }))
          .finally(() => process.exit(0));
      });
    });
  }
}

main().catch((error: unknown) => {
  // The logger may not exist yet, so a startup failure is written directly, as one JSON line.
  const kind = error instanceof ConfigError ? 'Invalid configuration' : 'Startup failed';
  process.stderr.write(`${JSON.stringify({ level: 'error', message: kind, reason: describeError(error) })}\n`);
  process.exit(FAILURE_EXIT_CODE);
});
