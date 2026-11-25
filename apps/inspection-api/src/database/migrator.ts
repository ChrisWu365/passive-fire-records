import type { Pool, PoolClient } from 'pg';
import { MIGRATIONS, type Migration } from './migrations.js';
import { assertValidSchemaName } from './schema-name.js';

export interface MigrationResult {
  /** Names of the migrations applied by this run, in order. Empty when the schema was already current. */
  applied: string[];
}

const SCHEMA_TOKEN = /\{\{schema\}\}/g;

/**
 * Creates the schema when it is missing and applies, in order, every migration that has not been applied
 * to it yet. Safe to run on every start and from several instances at once: a database advisory lock
 * makes concurrent runs take turns, and each migration commits together with the record that it ran.
 *
 * @param pool   connection pool for the target database
 * @param schema schema that holds the inspection tables; lower-case letters, digits and underscores only
 * @throws InvalidSchemaNameError when the schema name is not a plain identifier
 */
export async function migrate(pool: Pool, schema: string): Promise<MigrationResult> {
  assertValidSchemaName(schema);
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [lockName(schema)]);
    try {
      return await applyPending(client, schema);
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [lockName(schema)]);
    }
  } finally {
    client.release();
  }
}

function lockName(schema: string): string {
  return `inspection-api-migrations:${schema}`;
}

async function applyPending(client: PoolClient, schema: string): Promise<MigrationResult> {
  await client.query(`create schema if not exists ${schema}`);
  await client.query(
    `create table if not exists ${schema}.schema_migration (
       name text primary key,
       applied_at timestamptz not null default now()
     )`
  );
  const alreadyApplied = await appliedNames(client, schema);
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (alreadyApplied.has(migration.name)) continue;
    await applyOne(client, schema, migration);
    applied.push(migration.name);
  }
  return { applied };
}

async function appliedNames(client: PoolClient, schema: string): Promise<Set<string>> {
  const result = await client.query<{ name: string }>(`select name from ${schema}.schema_migration`);
  return new Set(result.rows.map((row) => row.name));
}

async function applyOne(client: PoolClient, schema: string, migration: Migration): Promise<void> {
  await client.query('begin');
  try {
    await client.query(migration.sql.replace(SCHEMA_TOKEN, schema));
    await client.query(`insert into ${schema}.schema_migration (name) values ($1)`, [migration.name]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw new Error(`Database migration ${migration.name} failed`, { cause: error });
  }
}
