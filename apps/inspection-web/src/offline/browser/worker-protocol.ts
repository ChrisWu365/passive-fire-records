import type { SqlRow, SqlStatement, SqlValue } from '../sql-database';

/** What the page asks the database worker to do. Every request carries an id that its answer repeats. */
export type WorkerRequest =
  | { id: number; kind: 'query'; sql: string; params: SqlValue[] }
  | { id: number; kind: 'transaction'; statements: SqlStatement[] };

/** What the database worker tells the page. */
export type WorkerMessage =
  /** Sent once, when the database is open and requests can be answered. */
  | { kind: 'ready' }
  /** Sent once, in place of 'ready', when the database could not be opened. */
  | { kind: 'failed'; reason: string }
  | { kind: 'result'; id: number; rows: SqlRow[] }
  | { kind: 'error'; id: number; reason: string };
