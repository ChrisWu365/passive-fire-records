import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { SqlDatabase, SqlRow, SqlStatement, SqlValue } from '../offline/sql-database';

/**
 * A real SQLite database, in memory, behind the app's SqlDatabase interface. It is the same SQLite build
 * the browser runs, so the store's SQL is exercised for real in unit tests; only the storage differs.
 */
export async function openMemoryDatabase(): Promise<SqlDatabase> {
  const sqlite3 = await sqlite3InitModule();
  const database = new sqlite3.oo1.DB(':memory:');

  const run = (sql: string, params: SqlValue[] = []): SqlRow[] =>
    database.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' }) as SqlRow[];

  return {
    async query(sql: string, params?: SqlValue[]): Promise<SqlRow[]> {
      return run(sql, params);
    },
    async transaction(statements: SqlStatement[]): Promise<void> {
      run('begin');
      try {
        for (const statement of statements) run(statement.sql, statement.params);
        run('commit');
      } catch (error) {
        run('rollback');
        throw error;
      }
    }
  };
}
