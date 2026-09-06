INSERT INTO workflows (tenant_id, name, description, states, transitions, is_default, methodology_id) VALUES
    ('c15e64ae525d9ea778d13053e3ba23d0', 'Kanban Default', 'Kanban flow',
     '["Backlog","Todo","In Progress","In Review","Done","Cancelled"]'::jsonb,
     '[{"from":"Backlog","to":"Todo"},{"from":"Todo","to":"In Progress"},{"from":"In Progress","to":"In Review"},{"from":"In Review","to":"Done"}]'::jsonb,
     TRUE, (SELECT id FROM project_methodologies WHERE name='Kanban' LIMIT 1))
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO workflows (tenant_id, name, description, states, transitions, is_default, methodology_id) VALUES
    ('c15e64ae525d9ea778d13053e3ba23d0', 'Scrum Default', 'Scrum flow',
     '["Product Backlog","Sprint Backlog","In Progress","In Review","Done","Cancelled"]'::jsonb,
     '[{"from":"Product Backlog","to":"Sprint Backlog"},{"from":"Sprint Backlog","to":"In Progress"},{"from":"In Progress","to":"In Review"},{"from":"In Review","to":"Done"}]'::jsonb,
     TRUE, (SELECT id FROM project_methodologies WHERE name='Scrum' LIMIT 1))
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO workflows (tenant_id, name, description, states, transitions, is_default, methodology_id) VALUES
    ('c15e64ae525d9ea778d13053e3ba23d0', 'Waterfall Default', 'Waterfall flow',
     '["Requirements","Design","Implementation","Testing","Deployment","Maintenance","Cancelled"]'::jsonb,
     '[{"from":"Requirements","to":"Design"},{"from":"Design","to":"Implementation"},{"from":"Implementation","to":"Testing"},{"from":"Testing","to":"Deployment"},{"from":"Deployment","to":"Maintenance"}]'::jsonb,
     TRUE, (SELECT id FROM project_methodologies WHERE name='Waterfall' LIMIT 1))
ON CONFLICT (tenant_id, name) DO NOTHING;
