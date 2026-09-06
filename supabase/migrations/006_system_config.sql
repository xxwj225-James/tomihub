-- Migration: 20260608000006_system_config
-- Description: System-level configuration table (SMTP, etc.)
-- ROLLBACK: DROP TABLE IF EXISTS system_configs CASCADE;

CREATE TABLE IF NOT EXISTS system_configs (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(36)
);

-- Seed: default empty SMTP config
INSERT INTO system_configs (key, value, description) VALUES
    ('smtp.host', '', 'SMTP server host'),
    ('smtp.port', '587', 'SMTP server port'),
    ('smtp.username', '', 'SMTP username/email'),
    ('smtp.password', '', 'SMTP password (encrypted at rest)'),
    ('smtp.starttls', 'true', 'Enable STARTTLS'),
    ('smtp.from_name', 'TomiHub', 'Sender display name')
ON CONFLICT (key) DO NOTHING;
