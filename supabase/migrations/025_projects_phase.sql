-- Migration: 025_projects_phase
-- Description: Add phase column to projects table

ALTER TABLE projects ADD COLUMN IF NOT EXISTS phase VARCHAR(20) DEFAULT 'development';
