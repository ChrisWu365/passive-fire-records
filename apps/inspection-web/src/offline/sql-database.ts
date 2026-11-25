/** Uint8Array is stored as a BLOB; it is how photo files are kept on the device. */
export type SqlValue = string | number | null | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface SqlStatement {
  sql: string;
  /** Values for the statement's ? placeholders, in order. */
  params?: SqlValue[];
}

/**
 * The few things the app needs from a SQL database. Behind it is SQLite: in the browser, running in a
 * worker with its file in the origin's private file system; in unit tests, an in-memory database.
 */
export interface SqlDatabase {
  /** Runs one statement and returns its result rows (empty for statements that return none). */
  query(sql: string, params?: SqlValue[]): Promise<SqlRow[]>;

  /**
   * Runs the statements in order inside one transaction. If any of them fails, none of them takes
   * effect and the returned promise rejects.
   */
  transaction(statements: SqlStatement[]): Promise<void>;
}
