# Supabase / Flyway Migration Guide

## Incremental Migration Rules (CRITICAL)

**Absolutely forbidden** to modify migration files already deployed to production!

### File Naming Conventions

```
supabase/migrations/
├── 20260606000001_initial_schema.sql   ← initial DDL (never modify again)
├── 20260607000001_add_issue_tags.sql   ← add new column (new file)
├── 20260607000002_add_issue_index.sql  ← add new index (new file)
└── ...
```

Naming format: `YYYYMMDDHHmmss_descriptive_name.sql`

### How to Add a New Change

```sql
-- WRONG (❌): modify 001_initial_schema.sql
ALTER TABLE issues ADD COLUMN priority_color VARCHAR(7);

-- CORRECT (✅): create a new incremental file
-- File: 20260607000001_add_issue_priority_color.sql
ALTER TABLE issues ADD COLUMN IF NOT EXISTS priority_color VARCHAR(7);

-- Always use IF NOT EXISTS / IF EXISTS to guarantee idempotency
-- Always write rollback SQL as a comment
-- ROLLBACK: ALTER TABLE issues DROP COLUMN IF EXISTS priority_color;
```

### Local Development vs. Production Deployment

```bash
# Local reset (discards all data)
supabase db reset

# Production incremental deployment (runs only new migrations)
supabase db push
# or
flyway migrate
```

### Pre-Migration Checklist

- [ ] SQL contains IF NOT EXISTS / IF EXISTS (idempotent)
- [ ] Rollback SQL is written in a comment
- [ ] New indexes validated with EXPLAIN ANALYZE in test environment
- [ ] Large-table ALTER accounts for lock time (> 10M rows needs online DDL)
- [ ] Migration passes `flyway validate` in CI
