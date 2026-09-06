-- Seed workspace_role master data (used by Members page invite role dropdown)
INSERT INTO master_data (category, key, value, color, sort_order, methodology) VALUES
('workspace_role', 'owner',  'Workspace Owner',  '', 1, ''),
('workspace_role', 'admin',  'Workspace Admin',  '', 2, ''),
('workspace_role', 'member', 'Workspace Member', '', 3, ''),
('workspace_role', 'viewer', 'Workspace Viewer', '', 4, '')
ON CONFLICT DO NOTHING;
