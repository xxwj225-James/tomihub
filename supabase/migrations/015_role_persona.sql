-- Migration: 015_role_persona
-- Description: Add persona column to roles table for report generation routing
-- ROLLBACK: ALTER TABLE roles DROP COLUMN IF EXISTS persona;

ALTER TABLE roles ADD COLUMN IF NOT EXISTS persona VARCHAR(20);

-- Populate existing roles with sensible persona defaults
UPDATE roles SET persona = 'pm'        WHERE name ILIKE '%lead%'    OR name ILIKE '%manager%' OR name ILIKE '%pm%';
UPDATE roles SET persona = 'qa'        WHERE name ILIKE '%qa%'      OR name ILIKE '%tester%'  OR name ILIKE '%test%';
UPDATE roles SET persona = 'developer' WHERE name ILIKE '%dev%'     OR name ILIKE '%engineer%' OR persona IS NULL;
UPDATE roles SET persona = 'viewer'    WHERE name ILIKE '%view%'    OR persona IS NULL;
