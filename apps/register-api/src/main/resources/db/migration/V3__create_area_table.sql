-- A project's levels and areas. An installer picks one for a record instead of typing it each time.
create table area (
    id uuid primary key,
    project_id uuid not null,
    name varchar(100) not null,
    active boolean not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint fk_area_project foreign key (project_id) references project (id),
    constraint uq_area_project_name unique (project_id, name)
);
