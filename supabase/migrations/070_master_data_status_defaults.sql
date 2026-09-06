-- 070: Ensure methodology-independent (global default) issue_status rows exist.
-- Background: 032 made (category, key, methodology) the PK. 017's seed rows
-- (methodology NULL → '' after 032's UPDATE) coexist with the methodology
-- variants; some databases are missing the global default rows, which makes
-- the "no methodology" master-data query return duplicates or nothing.
-- Idempotent: ON CONFLICT (category, key, methodology) DO NOTHING.

INSERT INTO master_data (category, key, value, icon, color, sort_order, methodology) VALUES
    ('issue_status', 'backlog',           'Backlog',           '📥', '#6b7280', 1,  ''),
    ('issue_status', 'todo',              'Todo',              '📌', '#6366f1', 2,  ''),
    ('issue_status', 'in_progress',       'In Progress',       '🔄', '#f59e0b', 3,  ''),
    ('issue_status', 'in_review',         'In Review',         '👁', '#8b5cf6', 4,  ''),
    ('issue_status', 'done',              'Done',              '✅', '#10b981', 5,  ''),
    ('issue_status', 'cancelled',         'Cancelled',         '❌', '#ef4444', 6,  ''),
    ('issue_status', 'product_backlog',   'Product Backlog',   '📦', '#06b6d4', 7,  ''),
    ('issue_status', 'sprint_backlog',    'Sprint Backlog',    '🏃', '#06b6d4', 8,  ''),
    ('issue_status', 'requirements',      'Requirements',      '📝', '#3b82f6', 9,  ''),
    ('issue_status', 'design',            'Design',            '🎨', '#a855f7', 10, ''),
    ('issue_status', 'implementation',    'Implementation',    '💻', '#f59e0b', 11, ''),
    ('issue_status', 'testing',           'Testing',           '🧪', '#8b5cf6', 12, ''),
    ('issue_status', 'deployment',        'Deployment',        '🚀', '#10b981', 13, ''),
    ('issue_status', 'maintenance',       'Maintenance',       '🔧', '#6b7280', 14, '')
ON CONFLICT (category, key, methodology) DO NOTHING;
