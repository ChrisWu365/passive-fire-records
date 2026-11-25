import { randomBytes } from 'node:crypto';
import pg from 'pg';

const MISSING_URL =
  'TEST_DATABASE_URL is not set. The database tests need a PostgreSQL they may create and drop schemas in, '
  + 'for example postgresql://postgres:postgres@127.0.0.1:54322/postgres. See .env.example.';

/** Connection string of the PostgreSQL used by the database tests. The tests fail, not skip, without it. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error(MISSING_URL);
  return url;
}

export function newPool(): pg.Pool {
  return new pg.Pool({ connectionString: testDatabaseUrl(), max: 5 });
}

/** A schema name no other test run uses, so the tests never touch real inspection data. */
export function uniqueSchemaName(): string {
  return `inspection_test_${randomBytes(6).toString('hex')}`;
}

export async function dropSchema(pool: pg.Pool, schema: string): Promise<void> {
  await pool.query(`drop schema if exists ${schema} cascade`);
}
