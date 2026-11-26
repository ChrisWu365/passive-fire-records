import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertValidSchemaName } from '../database/schema-name.js';
import type { AiStatus, Inspection, InspectionStatus, NewInspection, Observation } from './inspection.js';
import type { CreateResult, InspectionStore } from './inspection-store.js';

/** One row of the read query: the inspection columns plus its child rows aggregated as JSON. */
interface InspectionRow {
  id: string;
  client_id: string | null;
  project_id: string;
  project_name: string;
  system_id: string;
  system_code: string;
  system_substrate: string;
  system_service_type: string;
  system_fire_rating: string;
  system_materials: string;
  system_method: string;
  area_id: string | null;
  area_name: string | null;
  location: string;
  notes: string;
  status: InspectionStatus;
  inspector_id: string;
  inspector_name: string;
  ai_instruction: string | null;
  ai_summary: string | null;
  ai_status: AiStatus;
  captured_at: Date;
  created_at: Date;
  updated_at: Date;
  observations: Observation[];
  photos: string[];
}

type Queryable = Pick<Pool | PoolClient, 'query'>;

/**
 * Stores inspection records in PostgreSQL, in the given schema. The schema must already have been
 * migrated; see database/migrator.ts. A record and its observations and photos are always written
 * in one transaction.
 */
export class PostgresInspectionStore implements InspectionStore {
  private readonly schema: string;
  private readonly selectSql: string;

  constructor(
    private readonly pool: Pool,
    schema: string
  ) {
    this.schema = assertValidSchemaName(schema);
    this.selectSql = `
      select i.*,
        coalesce((
          select json_agg(json_build_object(
              'id', o.id, 'description', o.description,
              'severity', o.severity, 'remedialAction', o.remedial_action
            ) order by o.position)
          from ${this.schema}.observation o where o.inspection_id = i.id
        ), '[]'::json) as observations,
        coalesce((
          select json_agg(p.file_path order by p.position)
          from ${this.schema}.photo p where p.inspection_id = i.id
        ), '[]'::json) as photos
      from ${this.schema}.inspection i`;
  }

  async list(): Promise<Inspection[]> {
    const result = await this.pool.query<InspectionRow>(`${this.selectSql} order by i.updated_at desc, i.id`);
    return result.rows.map(toInspection);
  }

  async findById(id: string): Promise<Inspection | undefined> {
    return this.selectOne(this.pool, 'i.id = $1', id);
  }

  async findByClientId(clientId: string): Promise<Inspection | undefined> {
    return this.selectOne(this.pool, 'i.client_id = $1', clientId);
  }

  async create(input: NewInspection): Promise<CreateResult> {
    return this.inTransaction(async (client) => {
      const id = randomUUID();
      const inserted = await client.query(
        `insert into ${this.schema}.inspection
           (id, client_id, project_id, project_name, system_id, system_code, system_substrate,
            system_service_type, system_fire_rating, system_materials, system_method, location, notes,
            status, inspector_id, inspector_name, ai_instruction, ai_summary, ai_status, captured_at,
            area_id, area_name, created_at, updated_at)
         select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, stamp.now, stamp.now
         from (select clock_timestamp() as now) stamp
         on conflict (client_id) do nothing`,
        [id, input.clientId, ...recordValues(input), input.capturedAt, input.areaId, input.areaName]
      );
      if (inserted.rowCount === 0) {
        return { inspection: await this.requireByClientId(client, input.clientId), created: false };
      }
      await this.insertChildren(client, id, input.observations, input.photos);
      return { inspection: await this.requireById(client, id), created: true };
    });
  }

  async update(inspection: Inspection): Promise<Inspection | undefined> {
    return this.inTransaction(async (client) => {
      const updated = await client.query(
        `update ${this.schema}.inspection set
           project_id = $2, project_name = $3, system_id = $4, system_code = $5, system_substrate = $6,
           system_service_type = $7, system_fire_rating = $8, system_materials = $9, system_method = $10,
           location = $11, notes = $12, status = $13, inspector_id = $14, inspector_name = $15,
           ai_instruction = $16, ai_summary = $17, ai_status = $18, area_id = $19, area_name = $20,
           updated_at = clock_timestamp()
         where id = $1`,
        [inspection.id, ...recordValues(inspection), inspection.areaId, inspection.areaName]
      );
      if (updated.rowCount === 0) return undefined;
      await client.query(`delete from ${this.schema}.observation where inspection_id = $1`, [inspection.id]);
      await client.query(`delete from ${this.schema}.photo where inspection_id = $1`, [inspection.id]);
      await this.insertChildren(client, inspection.id, inspection.observations, inspection.photos);
      return this.requireById(client, inspection.id);
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`delete from ${this.schema}.inspection where id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private async insertChildren(
    client: PoolClient,
    inspectionId: string,
    observations: Observation[],
    photos: string[]
  ): Promise<void> {
    for (const [position, observation] of observations.entries()) {
      await client.query(
        `insert into ${this.schema}.observation
           (inspection_id, id, position, description, severity, remedial_action)
         values ($1, $2, $3, $4, $5, $6)`,
        [inspectionId, observation.id, position, observation.description, observation.severity,
          observation.remedialAction]
      );
    }
    for (const [position, filePath] of photos.entries()) {
      await client.query(
        `insert into ${this.schema}.photo (inspection_id, position, file_path) values ($1, $2, $3)`,
        [inspectionId, position, filePath]
      );
    }
  }

  private async selectOne(queryable: Queryable, condition: string, value: string): Promise<Inspection | undefined> {
    const result = await queryable.query<InspectionRow>(`${this.selectSql} where ${condition}`, [value]);
    return result.rows[0] ? toInspection(result.rows[0]) : undefined;
  }

  private async requireById(client: PoolClient, id: string): Promise<Inspection> {
    const found = await this.selectOne(client, 'i.id = $1', id);
    if (!found) throw new Error(`Inspection ${id} disappeared inside its own transaction`);
    return found;
  }

  /** After "on conflict do nothing" skipped the insert, the record holding that clientId is committed. */
  private async requireByClientId(client: PoolClient, clientId: string | null): Promise<Inspection> {
    const found = clientId === null ? undefined : await this.selectOne(client, 'i.client_id = $1', clientId);
    if (!found) throw new Error('An insert was skipped although no record holds its clientId');
    return found;
  }

  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Values of the columns that both insert and update write, in column order after the id (and clientId). */
function recordValues(record: NewInspection): Array<string | null> {
  return [
    record.projectId, record.projectName, record.systemId, record.system.code, record.system.substrate,
    record.system.serviceType, record.system.fireRating, record.system.materials,
    record.system.installationMethod, record.location, record.notes, record.status, record.inspectorId,
    record.inspectorName, record.aiInstruction, record.aiSummary, record.aiStatus
  ];
}

function toInspection(row: InspectionRow): Inspection {
  return {
    id: row.id,
    clientId: row.client_id,
    projectId: row.project_id,
    projectName: row.project_name,
    systemId: row.system_id,
    system: {
      code: row.system_code,
      substrate: row.system_substrate,
      serviceType: row.system_service_type,
      fireRating: row.system_fire_rating,
      materials: row.system_materials,
      installationMethod: row.system_method
    },
    areaId: row.area_id,
    areaName: row.area_name,
    location: row.location,
    notes: row.notes,
    status: row.status,
    inspectorId: row.inspector_id,
    inspectorName: row.inspector_name,
    observations: row.observations,
    photos: row.photos,
    aiInstruction: row.ai_instruction,
    aiSummary: row.ai_summary,
    aiStatus: row.ai_status,
    capturedAt: row.captured_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
