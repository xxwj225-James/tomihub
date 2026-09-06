#!/bin/bash
# ═══ DB Init — run all migration SQLs + post-deploy patches ═══
# Called by deploy.sh / update.sh after containers start.
# All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING — safe to run repeatedly.
#
# Sources:
#   1. /docker-entrypoint-initdb.d/*.sql  — all supabase migrations (mounted volume)
#   2. Inline patches below — post-deploy fixes not yet in migrations
set -e

# Compose invocation — override for layered deploys (e.g. live demo):
#   COMPOSE_ARGS="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.demo"
: "${COMPOSE_ARGS:=-f \"$(dirname \"$0\")/docker-compose.yml\"}"

echo "=== DB Init: running all migrations ==="

# ── Phase 1: Run all Flyway migration files (idempotent) ──
MIGDIR=/docker-entrypoint-initdb.d
FILES=$(docker compose $COMPOSE_ARGS exec -T postgres \
  sh -c "ls $MIGDIR/*.sql 2>/dev/null | sort" 2>/dev/null)
for f in $FILES; do
  fname=$(basename "$f")
  echo "  Running: $fname"
  docker compose $COMPOSE_ARGS exec -T postgres \
    psql -U postgres -d ai_pm -f "$f" 2>&1 | grep -vE 'NOTICE|already exists|skipping|CREATE INDEX|^$' | tail -3
done

echo ""
echo "=== DB Init: post-deploy patches ==="

# ── Phase 2: Patches not yet in migrations ──
docker compose $COMPOSE_ARGS exec -T postgres psql -U postgres -d ai_pm <<'SQL'
-- ── api_keys fixes ──
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS hitl_mode VARCHAR(20) DEFAULT 'manual';
ALTER TABLE api_keys ALTER COLUMN scopes TYPE TEXT USING COALESCE(scopes::TEXT, 'read,write');
ALTER TABLE api_keys ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE api_keys ALTER COLUMN created_by SET DEFAULT NULL;

-- ── comments fix ──
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name VARCHAR(255);

-- ── issues workflow_id fix ──
ALTER TABLE issues ALTER COLUMN workflow_id DROP NOT NULL;
ALTER TABLE issues ALTER COLUMN workflow_id SET DEFAULT NULL;

-- ── refresh_tokens device_info jsonb→text fix ──
ALTER TABLE refresh_tokens ALTER COLUMN device_info TYPE TEXT;

-- ── issues security_level_id FK fix ──
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_security_level_id_fkey;
ALTER TABLE issues ALTER COLUMN security_level_id TYPE TEXT;

-- ── ai_gantt_charts ──
CREATE TABLE IF NOT EXISTS ai_gantt_charts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    title VARCHAR(128) NOT NULL,
    chart_data_jsonb TEXT NOT NULL DEFAULT '{"tasks": [], "links": []}',
    ai_rationale TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── System-wide master_data seed ──
-- Workspace roles
INSERT INTO master_data (category, key, value, icon, color, sort_order) VALUES
    ('workspace_role', 'owner',   'Workspace Owner',  '👑', '#6366f1', 1),
    ('workspace_role', 'admin',   'Workspace Admin',  '🛡', '#f59e0b', 2),
    ('workspace_role', 'member',  'Workspace Member', '👤', '#10b981', 3),
    ('workspace_role', 'viewer',  'Workspace Viewer', '👁', '#6b7280', 4)
ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value;

-- Project roles
INSERT INTO master_data (category, key, value, color, sort_order) VALUES
    ('project_role', 'Project Owner', 'Project Owner', '#6366f1', 1),
    ('project_role', 'Project Lead',  'Project Lead',  '#f59e0b', 2),
    ('project_role', 'Developer',     'Developer',     '#10b981', 3),
    ('project_role', 'QA Engineer',   'QA Engineer',   '#8b5cf6', 4),
    ('project_role', 'Viewer',        'Viewer',        '#6b7280', 5)
ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value;
SQL

echo ""
echo "=== DB Init: complete ==="
