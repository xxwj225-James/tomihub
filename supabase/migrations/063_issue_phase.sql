-- Issue phase — powers the Board "By Phase" view.
-- Issues gain a free-form lifecycle phase (Discovery → Design → Implementation
-- → Testing → Release); editable in the issue edit panel.

ALTER TABLE issues ADD COLUMN IF NOT EXISTS phase VARCHAR(64);

-- Phase master data (project-level, methodology-independent)
INSERT INTO master_data (category, key, value, icon, color, sort_order, methodology) VALUES
    ('issue_phase', 'discovery',      'Discovery',      '🔍', '#8b5cf6', 1, ''),
    ('issue_phase', 'design',         'Design',         '🎨', '#3b82f6', 2, ''),
    ('issue_phase', 'implementation', 'Implementation', '🛠️', '#f59e0b', 3, ''),
    ('issue_phase', 'testing',        'Testing',        '🧪', '#10b981', 4, ''),
    ('issue_phase', 'release',        'Release',        '🚀', '#ef4444', 5, '')
ON CONFLICT DO NOTHING;
