-- Add logs column to batch_task_runs (used by Batch Monitor API)
ALTER TABLE batch_task_runs ADD COLUMN IF NOT EXISTS logs TEXT;
