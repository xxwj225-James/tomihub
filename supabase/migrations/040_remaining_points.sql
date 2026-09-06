-- Migration: 040_remaining_points
-- Description: Add remaining_points column to issues for Sprint burndown tracking
-- ROLLBACK: ALTER TABLE issues DROP COLUMN IF EXISTS remaining_points;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS remaining_points DECIMAL(3,1);

-- Initialize remaining_points = story_points for existing issues with estimates
UPDATE issues SET remaining_points = story_points WHERE remaining_points IS NULL AND story_points IS NOT NULL;

-- Set remaining_points = 0 for already-done issues
UPDATE issues SET remaining_points = 0 WHERE remaining_points IS NULL AND status = 'done';
