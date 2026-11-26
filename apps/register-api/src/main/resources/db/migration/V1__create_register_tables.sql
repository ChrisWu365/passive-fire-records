create table project (
    id uuid primary key,
    code varchar(20) not null,
    name varchar(100) not null,
    address varchar(200),
    active boolean not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint uq_project_code unique (code)
);

create table firestop_system (
    id uuid primary key,
    project_id uuid not null,
    code varchar(20) not null,
    substrate varchar(100) not null,
    service_type varchar(100) not null,
    fire_rating varchar(20) not null,
    materials varchar(500) not null,
    installation_method varchar(1000) not null,
    active boolean not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint fk_firestop_system_project foreign key (project_id) references project (id),
    constraint uq_firestop_system_project_code unique (project_id, code)
);
