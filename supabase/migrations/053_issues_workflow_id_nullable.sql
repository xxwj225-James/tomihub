-- issues.workflow_id nullable — Issue entity has no workflowId field;
-- insert failed with NOT NULL violation (e.g. Gantt-generated tasks).
ALTER TABLE issues ALTER COLUMN workflow_id DROP NOT NULL;
