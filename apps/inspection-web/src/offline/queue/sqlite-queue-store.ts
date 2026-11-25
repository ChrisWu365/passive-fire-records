import type { Observation, Status, SystemSnapshot } from '../../api/types';
import type { SqlDatabase, SqlRow, SqlStatement } from '../sql-database';
import type { QueueStore } from './queue-store';
import type {
  AiOutcome,
  NewQueuedPhoto,
  QueuedInspection,
  QueuedInspectionDraft,
  QueuedPhoto,
  QueueState
} from './queued-inspection';

const SCHEMA: readonly string[] = [
  `create table if not exists queued_inspection (
     client_id text primary key,
     project_id text not null,
     project_name text not null,
     system_id text not null,
     system_json text not null,
     location text not null,
     notes text not null,
     status text not null,
     observations_json text not null,
     ai_instruction text not null,
     captured_at text not null,
     created_by_id text not null,
     created_by_name text not null,
     state text not null check (state in ('PENDING', 'FAILED', 'SYNCED')),
     server_id text,
     photo_count integer not null,
     ai_outcome text not null check (ai_outcome in ('NONE', 'DONE', 'FAILED')),
     last_error text
   )`,
  `create table if not exists queued_photo (
     client_id text not null,
     position integer not null,
     file_name text not null,
     mime_type text not null,
     bytes blob not null,
     primary key (client_id, position)
   )`
];

const RECORD_COLUMNS =
  'client_id, project_id, project_name, system_id, system_json, location, notes, status, observations_json, '
  + 'ai_instruction, captured_at, created_by_id, created_by_name, state, server_id, photo_count, ai_outcome, '
  + 'last_error';

/**
 * Keeps the device's records and their photos in SQLite. The tables are created on first use.
 * Photos are stored as bytes in the database, beside the record they belong to.
 */
export class SqliteQueueStore implements QueueStore {
  private schemaReady: Promise<void> | undefined;

  constructor(private readonly database: SqlDatabase) {}

  async add(draft: QueuedInspectionDraft, photos: NewQueuedPhoto[]): Promise<QueuedInspection> {
    await this.ready();
    const queued: QueuedInspection = {
      ...draft,
      clientId: crypto.randomUUID(),
      state: 'PENDING',
      serverId: null,
      photoCount: photos.length,
      aiOutcome: 'NONE',
      lastError: null
    };
    const statements: SqlStatement[] = [{
      sql: `insert into queued_inspection (${RECORD_COLUMNS})
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        queued.clientId, queued.projectId, queued.projectName, queued.systemId, JSON.stringify(queued.system),
        queued.location, queued.notes, queued.status, JSON.stringify(queued.observations), queued.aiInstruction,
        queued.capturedAt, queued.createdBy.id, queued.createdBy.name, queued.state, queued.serverId,
        queued.photoCount, queued.aiOutcome, queued.lastError
      ]
    }];
    photos.forEach((photo, position) => {
      statements.push({
        sql: 'insert into queued_photo (client_id, position, file_name, mime_type, bytes) values (?, ?, ?, ?, ?)',
        params: [queued.clientId, position, photo.fileName, photo.mimeType, photo.bytes]
      });
    });
    await this.database.transaction(statements);
    return queued;
  }

  async list(): Promise<QueuedInspection[]> {
    await this.ready();
    const rows = await this.database.query(
      `select ${RECORD_COLUMNS} from queued_inspection order by captured_at, client_id`
    );
    return rows.map(toQueuedInspection);
  }

  async find(clientId: string): Promise<QueuedInspection | undefined> {
    await this.ready();
    const rows = await this.database.query(
      `select ${RECORD_COLUMNS} from queued_inspection where client_id = ?`, [clientId]
    );
    return rows[0] ? toQueuedInspection(rows[0]) : undefined;
  }

  async photos(clientId: string): Promise<QueuedPhoto[]> {
    await this.ready();
    const rows = await this.database.query(
      'select position, file_name, mime_type, bytes from queued_photo where client_id = ? order by position',
      [clientId]
    );
    return rows.map((row) => ({
      position: Number(row.position),
      fileName: String(row.file_name),
      mimeType: String(row.mime_type),
      bytes: toBytes(row.bytes)
    }));
  }

  async recordServerId(clientId: string, serverId: string): Promise<void> {
    await this.change(clientId, [{
      sql: 'update queued_inspection set server_id = ? where client_id = ?', params: [serverId, clientId]
    }]);
  }

  async markSynced(clientId: string, aiOutcome: AiOutcome): Promise<void> {
    await this.change(clientId, [
      {
        sql: `update queued_inspection set state = 'SYNCED', ai_outcome = ?, last_error = null where client_id = ?`,
        params: [aiOutcome, clientId]
      },
      // The server holds the photos now; keeping them here too would only use up the device's storage.
      { sql: 'delete from queued_photo where client_id = ?', params: [clientId] }
    ]);
  }

  async markFailed(clientId: string, reason: string): Promise<void> {
    await this.change(clientId, [{
      sql: `update queued_inspection set state = 'FAILED', last_error = ? where client_id = ?`,
      params: [reason, clientId]
    }]);
  }

  async markPending(clientId: string): Promise<void> {
    await this.change(clientId, [{
      sql: `update queued_inspection set state = 'PENDING', last_error = null where client_id = ?`,
      params: [clientId]
    }]);
  }

  async discard(clientId: string): Promise<void> {
    await this.ready();
    await this.database.transaction([
      { sql: 'delete from queued_photo where client_id = ?', params: [clientId] },
      { sql: 'delete from queued_inspection where client_id = ?', params: [clientId] }
    ]);
  }

  async clearSynced(): Promise<number> {
    await this.ready();
    const synced = await this.database.query(`select client_id from queued_inspection where state = 'SYNCED'`);
    if (synced.length === 0) return 0;
    await this.database.transaction([
      {
        sql: `delete from queued_photo
              where client_id in (select client_id from queued_inspection where state = 'SYNCED')`
      },
      { sql: `delete from queued_inspection where state = 'SYNCED'` }
    ]);
    return synced.length;
  }

  /** Applies a change to one record, failing loudly when the device does not hold that record. */
  private async change(clientId: string, statements: SqlStatement[]): Promise<void> {
    await this.ready();
    const found = await this.database.query('select 1 as found from queued_inspection where client_id = ?', [clientId]);
    if (found.length === 0) throw new Error(`The device holds no record ${clientId}`);
    await this.database.transaction(statements);
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

function toQueuedInspection(row: SqlRow): QueuedInspection {
  return {
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    systemId: String(row.system_id),
    system: JSON.parse(String(row.system_json)) as SystemSnapshot,
    location: String(row.location),
    notes: String(row.notes),
    status: String(row.status) as Status,
    observations: JSON.parse(String(row.observations_json)) as Observation[],
    aiInstruction: String(row.ai_instruction),
    capturedAt: String(row.captured_at),
    createdBy: { id: String(row.created_by_id), name: String(row.created_by_name) },
    clientId: String(row.client_id),
    state: String(row.state) as QueueState,
    serverId: row.server_id === null ? null : String(row.server_id),
    photoCount: Number(row.photo_count),
    aiOutcome: String(row.ai_outcome) as AiOutcome,
    lastError: row.last_error === null ? null : String(row.last_error)
  };
}

function toBytes(value: SqlRow[string]): Uint8Array {
  if (value instanceof Uint8Array) return value;
  throw new Error('A stored photo is not binary data');
}
