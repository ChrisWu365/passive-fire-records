import type { SqlDatabase, SqlRow, SqlStatement, SqlValue } from '../sql-database';
import type { WorkerMessage, WorkerRequest } from './worker-protocol';

interface Pending {
  resolve: (rows: SqlRow[]) => void;
  reject: (error: Error) => void;
}

/** A WorkerRequest before it is given its id. */
type RequestBody =
  | { kind: 'query'; sql: string; params: SqlValue[] }
  | { kind: 'transaction'; statements: SqlStatement[] };

/**
 * Starts the SQLite worker and resolves with a SqlDatabase that talks to it. Each call to the database
 * becomes one message; the worker answers them in the order they were sent.
 *
 * @throws when this browser cannot open the device database (no private file system, or another tab of
 *         the app already holds the file)
 */
export function openWorkerDatabase(): Promise<SqlDatabase> {
  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let nextId = 1;

  const send = (body: RequestBody): Promise<SqlRow[]> =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...body } satisfies WorkerRequest);
    });

  const database: SqlDatabase = {
    query: (sql, params = []) => send({ kind: 'query', sql, params }),
    transaction: async (statements) => {
      await send({ kind: 'transaction', statements });
    }
  };

  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.kind === 'ready') {
        resolve(database);
      } else if (message.kind === 'failed') {
        worker.terminate();
        reject(new Error(message.reason));
      } else {
        const waiting = pending.get(message.id);
        pending.delete(message.id);
        if (message.kind === 'result') waiting?.resolve(message.rows);
        else waiting?.reject(new Error(message.reason));
      }
    });
    worker.addEventListener('error', (event) => {
      reject(new Error(event.message || 'The device database worker stopped unexpectedly'));
    });
  });
}
