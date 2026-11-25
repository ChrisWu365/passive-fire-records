import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { SqlRow, SqlStatement, SqlValue } from '../sql-database';
import type { WorkerMessage, WorkerRequest } from './worker-protocol';

/**
 * Runs SQLite off the page's main thread and keeps its file in the origin's private file system, so the
 * data survives reloads and browser restarts. The pooled storage back-end used here needs no special
 * response headers, but it gives the file to one worker at a time.
 */
const STORAGE_POOL_NAME = 'inspection-offline';
const DATABASE_FILE = '/offline.sqlite3';

// A reloading page's old worker can still hold the file for a moment, so opening is retried briefly.
const OPEN_ATTEMPTS = 15;
const OPEN_RETRY_DELAY_MS = 200;
/** The error the browser raises when another worker already has the file open. */
const FILE_HELD_ERROR = 'NoModificationAllowedError';

interface Database {
  exec(options: { sql: string; bind: SqlValue[]; rowMode: 'object'; returnValue: 'resultRows' }): unknown;
}

/** The parts of the worker's global scope this file uses; the app's type settings describe a page, not a worker. */
interface WorkerScope {
  postMessage(message: WorkerMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
}

const scope = self as unknown as WorkerScope;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * True when the file exists but someone else holds it: the previous page's worker during a reload, or
 * another tab. Only that is worth waiting for; a browser without this storage will never succeed.
 */
function fileIsHeldElsewhere(error: unknown): boolean {
  return error instanceof DOMException && error.name === FILE_HELD_ERROR;
}

async function openDatabase(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  let lastError: unknown;
  for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt += 1) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: STORAGE_POOL_NAME });
      return new pool.OpfsSAHPoolDb(DATABASE_FILE) as unknown as Database;
    } catch (error) {
      lastError = error;
      if (!fileIsHeldElsewhere(error)) break;
      await delay(OPEN_RETRY_DELAY_MS);
    }
  }
  throw new Error(`The device's database could not be opened: ${describe(lastError)}`);
}

function run(database: Database, sql: string, params: SqlValue[] = []): SqlRow[] {
  return database.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' }) as SqlRow[];
}

function runTransaction(database: Database, statements: SqlStatement[]): void {
  run(database, 'begin');
  try {
    for (const statement of statements) run(database, statement.sql, statement.params);
    run(database, 'commit');
  } catch (error) {
    run(database, 'rollback');
    throw error;
  }
}

function answer(database: Database, request: WorkerRequest): void {
  try {
    if (request.kind === 'query') {
      scope.postMessage({ kind: 'result', id: request.id, rows: run(database, request.sql, request.params) });
    } else {
      runTransaction(database, request.statements);
      scope.postMessage({ kind: 'result', id: request.id, rows: [] });
    }
  } catch (error) {
    scope.postMessage({ kind: 'error', id: request.id, reason: describe(error) });
  }
}

openDatabase()
  .then((database) => {
    scope.addEventListener('message', (event) => answer(database, event.data));
    scope.postMessage({ kind: 'ready' });
  })
  .catch((error: unknown) => {
    scope.postMessage({ kind: 'failed', reason: describe(error) });
  });
