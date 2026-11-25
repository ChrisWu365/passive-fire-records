-- Fictional sample data. The materials, ratings and methods below are invented for demonstration
-- and do not describe any real tested firestop system.
insert into project (id, code, name, address, active, created_at, updated_at)
values ('0a000000-0000-4000-8000-000000000001', 'DEMO', 'Demo Apartments (fictional)',
        '1 Example Street, Sampleton', true, current_timestamp, current_timestamp);

insert into firestop_system (id, project_id, code, substrate, service_type, fire_rating, materials,
                             installation_method, active, created_at, updated_at)
values ('0a000000-0000-4000-8000-000000000101', '0a000000-0000-4000-8000-000000000001', 'SYS-01',
        'Plasterboard wall', 'Plastic pipe up to 50 mm', '-/60/60', 'Demo collar A',
        'Fit one collar on each side of the wall.', true, current_timestamp, current_timestamp),
       ('0a000000-0000-4000-8000-000000000102', '0a000000-0000-4000-8000-000000000001', 'SYS-02',
        'Concrete floor', 'Metal pipe up to 100 mm', '-/60/60', 'Demo mineral fibre B and demo sealant C',
        'Pack the gap with mineral fibre, then seal the surface.', true, current_timestamp, current_timestamp),
       ('0a000000-0000-4000-8000-000000000103', '0a000000-0000-4000-8000-000000000001', 'SYS-03',
        'Plasterboard wall', 'Cable bundle up to 50 mm', '-/60/60', 'Demo putty D',
        'Fill the opening with putty and finish flush with the wall.', true, current_timestamp, current_timestamp),
       ('0a000000-0000-4000-8000-000000000104', '0a000000-0000-4000-8000-000000000001', 'SYS-04',
        'Concrete wall', 'Insulated pipe pair', '-/60/60', 'Demo wrap E and demo sealant C',
        'Wrap the pipes twice, then seal the surface.', true, current_timestamp, current_timestamp);
