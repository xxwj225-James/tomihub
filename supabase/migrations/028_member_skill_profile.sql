-- Migration: 028_member_skill_profile
-- Description: Extend roles table with skill tags + module affinity for AI-driven assignee suggestions
-- ROLLBACK: ALTER TABLE roles DROP COLUMN IF EXISTS skill_tags, DROP COLUMN IF EXISTS module_affinity;

ALTER TABLE roles ADD COLUMN IF NOT EXISTS skill_tags TEXT[] DEFAULT '{}';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS module_affinity JSONB DEFAULT '{}';
-- module_affinity example: {"frontend": {"score": 0.85, "last_touched": "2026-06-15"}, ...}

COMMENT ON COLUMN roles.skill_tags IS 'Extracted skill keywords for this member role';
COMMENT ON COLUMN roles.module_affinity IS 'Module affinity scores: {module_name: {score, last_touched}}';
