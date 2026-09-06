-- Migration: 032_methodology_statuses
-- Description: Add methodology-specific issue statuses in master_data
-- ROLLBACK: ALTER TABLE master_data DROP COLUMN IF EXISTS methodology CASCADE;

-- Add methodology column to master_data
ALTER TABLE master_data ADD COLUMN IF NOT EXISTS methodology VARCHAR(20);
UPDATE master_data SET methodology = '' WHERE methodology IS NULL;

-- Update PK to include methodology
ALTER TABLE master_data DROP CONSTRAINT IF EXISTS master_data_pkey CASCADE;
ALTER TABLE master_data ADD PRIMARY KEY (category, key, methodology);

-- Kanban statuses
INSERT INTO master_data (category, key, value, color, sort_order, methodology) VALUES
    ('issue_status', 'backlog', 'Backlog', '#6b7280', 1, 'kanban'),
    ('issue_status', 'todo', 'Todo', '#6366f1', 2, 'kanban'),
    ('issue_status', 'in_progress', 'In Progress', '#f59e0b', 3, 'kanban'),
    ('issue_status', 'in_review', 'In Review', '#8b5cf6', 4, 'kanban'),
    ('issue_status', 'done', 'Done', '#10b981', 5, 'kanban'),
    ('issue_status', 'cancelled', 'Cancelled', '#ef4444', 6, 'kanban')
ON CONFLICT (category, key, methodology) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- Scrum statuses
INSERT INTO master_data (category, key, value, color, sort_order, methodology) VALUES
    ('issue_status', 'product_backlog', 'Product Backlog', '#06b6d4', 1, 'scrum'),
    ('issue_status', 'sprint_backlog', 'Sprint Backlog', '#06b6d4', 2, 'scrum'),
    ('issue_status', 'in_progress', 'In Progress', '#f59e0b', 3, 'scrum'),
    ('issue_status', 'in_review', 'In Review', '#8b5cf6', 4, 'scrum'),
    ('issue_status', 'done', 'Done', '#10b981', 5, 'scrum'),
    ('issue_status', 'cancelled', 'Cancelled', '#ef4444', 6, 'scrum')
ON CONFLICT (category, key, methodology) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- Waterfall statuses (generic completion states — workflow phase is separate)
INSERT INTO master_data (category, key, value, color, sort_order, methodology) VALUES
    ('issue_status', 'todo', 'Todo', '#6366f1', 1, 'waterfall'),
    ('issue_status', 'in_progress', 'In Progress', '#f59e0b', 2, 'waterfall'),
    ('issue_status', 'in_review', 'In Review', '#8b5cf6', 3, 'waterfall'),
    ('issue_status', 'done', 'Done', '#10b981', 4, 'waterfall'),
    ('issue_status', 'cancelled', 'Cancelled', '#ef4444', 5, 'waterfall')
ON CONFLICT (category, key, methodology) DO UPDATE SET sort_order = EXCLUDED.sort_order;
