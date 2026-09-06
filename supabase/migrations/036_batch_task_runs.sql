-- Migration 036: Batch Task Execution Logs
-- Track nightly batch task runs for admin monitoring

CREATE TABLE IF NOT EXISTS batch_task_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(32) NOT NULL DEFAULT '',
    task_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / running / success / failed
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    result_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_runs_task ON batch_task_runs(task_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_task_runs(status);
