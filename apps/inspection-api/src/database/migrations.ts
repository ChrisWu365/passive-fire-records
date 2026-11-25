export interface Migration {
  /** Unique, sortable name. Migrations are applied in the order they appear in MIGRATIONS. */
  name: string;
  /** SQL to run. Every {{schema}} token is replaced with the validated target schema name. */
  sql: string;
}

/**
 * The inspection schema's history. Append new entries; never edit or reorder ones that have shipped.
 * The SQL lives in code, not in .sql files, so that it is compiled into the build output with everything else.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    name: '001_create_inspection_tables',
    sql: `
      create table {{schema}}.inspection (
        id uuid primary key,
        client_id uuid,
        project_id uuid not null,
        project_name text not null,
        system_id uuid not null,
        system_code text not null,
        system_substrate text not null,
        system_service_type text not null,
        system_fire_rating text not null,
        system_materials text not null,
        system_method text not null,
        location text not null,
        notes text not null,
        status text not null,
        inspector_id text not null,
        inspector_name text not null,
        ai_instruction text,
        ai_summary text,
        ai_status text not null,
        captured_at timestamptz not null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        constraint uq_inspection_client_id unique (client_id),
        constraint ck_inspection_status
          check (status in ('DRAFT', 'IN_PROGRESS', 'ACTION_REQUIRED', 'COMPLETED')),
        constraint ck_inspection_ai_status check (ai_status in ('NONE', 'DONE', 'FAILED'))
      );

      create index ix_inspection_updated_at on {{schema}}.inspection (updated_at desc);

      create table {{schema}}.observation (
        inspection_id uuid not null,
        id text not null,
        position integer not null,
        description text not null,
        severity text not null,
        remedial_action text not null,
        constraint pk_observation primary key (inspection_id, id),
        constraint fk_observation_inspection
          foreign key (inspection_id) references {{schema}}.inspection (id) on delete cascade,
        constraint ck_observation_severity check (severity in ('LOW', 'MEDIUM', 'HIGH'))
      );

      create table {{schema}}.photo (
        inspection_id uuid not null,
        position integer not null,
        file_path text not null,
        constraint pk_photo primary key (inspection_id, position),
        constraint fk_photo_inspection
          foreign key (inspection_id) references {{schema}}.inspection (id) on delete cascade
      );
    `
  }
];
