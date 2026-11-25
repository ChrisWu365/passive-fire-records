import type { FirestopSystem, Project } from '../api/types';
import type { RegisterSnapshot, SnapshotInfo } from './snapshot';
import type { SnapshotStore } from './snapshot-store';
import type { SqlDatabase, SqlStatement } from './sql-database';

/** The single row of snapshot_meta always has this id, so there can never be two. */
const META_ROW_ID = 1;

const SCHEMA: readonly string[] = [
  `create table if not exists snapshot_project (
     id text primary key,
     code text not null,
     name text not null,
     address text
   )`,
  `create table if not exists snapshot_system (
     id text primary key,
     project_id text not null,
     code text not null,
     substrate text not null,
     service_type text not null,
     fire_rating text not null,
     materials text not null,
     installation_method text not null
   )`,
  'create index if not exists ix_snapshot_system_project on snapshot_system (project_id)',
  `create table if not exists snapshot_meta (
     id integer primary key check (id = ${META_ROW_ID}),
     generated_at text not null,
     downloaded_at text not null
   )`
];

/**
 * Keeps the register snapshot in SQLite tables. The tables are created on first use, so the same code
 * serves a fresh device and one that already holds a download.
 */
export class SqliteSnapshotStore implements SnapshotStore {
  private schemaReady: Promise<void> | undefined;

  constructor(private readonly database: SqlDatabase) {}

  async replace(snapshot: RegisterSnapshot, downloadedAt: string): Promise<void> {
    await this.ready();
    const statements: SqlStatement[] = [
      { sql: 'delete from snapshot_system' },
      { sql: 'delete from snapshot_project' },
      { sql: 'delete from snapshot_meta' }
    ];
    for (const project of snapshot.projects) {
      statements.push({
        sql: 'insert into snapshot_project (id, code, name, address) values (?, ?, ?, ?)',
        params: [project.id, project.code, project.name, project.address]
      });
      for (const system of project.systems) {
        statements.push({
          sql: `insert into snapshot_system
                  (id, project_id, code, substrate, service_type, fire_rating, materials, installation_method)
                values (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            system.id, project.id, system.code, system.substrate, system.serviceType, system.fireRating,
            system.materials, system.installationMethod
          ]
        });
      }
    }
    statements.push({
      sql: 'insert into snapshot_meta (id, generated_at, downloaded_at) values (?, ?, ?)',
      params: [META_ROW_ID, snapshot.generatedAt, downloadedAt]
    });
    await this.database.transaction(statements);
  }

  async info(): Promise<SnapshotInfo | null> {
    await this.ready();
    const rows = await this.database.query(
      `select generated_at, downloaded_at,
              (select count(*) from snapshot_project) as project_count,
              (select count(*) from snapshot_system) as system_count
       from snapshot_meta where id = ?`,
      [META_ROW_ID]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      generatedAt: String(row.generated_at),
      downloadedAt: String(row.downloaded_at),
      projectCount: Number(row.project_count),
      systemCount: Number(row.system_count)
    };
  }

  async listProjects(): Promise<Project[]> {
    await this.ready();
    const rows = await this.database.query('select id, code, name, address from snapshot_project order by code');
    return rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      address: row.address === null ? null : String(row.address),
      // A snapshot holds active projects only.
      active: true
    }));
  }

  async listSystems(projectId: string): Promise<FirestopSystem[]> {
    await this.ready();
    const rows = await this.database.query(
      `select id, project_id, code, substrate, service_type, fire_rating, materials, installation_method
       from snapshot_system where project_id = ? order by code`,
      [projectId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      code: String(row.code),
      substrate: String(row.substrate),
      serviceType: String(row.service_type),
      fireRating: String(row.fire_rating),
      materials: String(row.materials),
      installationMethod: String(row.installation_method),
      // A snapshot holds active systems only.
      active: true
    }));
  }

  /** Creates the tables once per store. A failed attempt is forgotten, so the next call tries again. */
  private ready(): Promise<void> {
    this.schemaReady ??= this.database
      .transaction(SCHEMA.map((sql) => ({ sql })))
      .catch((error: unknown) => {
        this.schemaReady = undefined;
        throw error;
      });
    return this.schemaReady;
  }
}
