# Redmine AI Extension — Connector Design (R1)

> Status: **In progress** (schema corrections done, awaiting end-to-end integration testing)
> Background: first step of the Redmine extension (wedge → replace) in open-core-plan §3.5.
> Goal: **continuously sync-mirror** Redmine data into the TomiHub data model, so that ai-brain's
> six-dimension health/risk/reporting framework can be reused directly, while paving the way for the "replace Redmine" phase.
>
> v0.2 (2026-08-20) — corrected schema facts (users/comments/sprints have no tenant_id, etc.),
> cross-checked column by column against 001_initial_schema.sql

---

## 1. Goals and Non-Goals

**Goals**:
- Support Redmine REST API (read) + optional direct DB access (faster full load)
- **Incrementally sync** Redmine project data into the TomiHub model (projects/issues/journals→comments/changelog/versions→sprints/wiki)
- Idempotent, resumable, multi-project support
- Seamless integration with ai-brain's existing analysis framework (data available immediately once persisted)

**Non-Goals** (later phases):
- ❌ Write-back (comments/status suggestions) — R3
- ❌ Standalone AI panel UI — R2
- ❌ Redmine replacement migration guide — R4

---

## 2. Architecture

```
Redmine site
  ├── REST API (issues.json, journals, versions, wiki)
  └── (optional) Direct DB access (MySQL/PG/SQLite) — fast full import
        ↓
redmine_connector/  (new module)
  ├── rest_client.py      — REST API client (incremental pull, since_id cursor)
  ├── db_reader.py        — reuses import_engine/redmine_reader.py (full load)
  ├── mapper.py           — Redmine → TomiHub model mapping
  ├── sync.py             — sync orchestration (full init + scheduled incremental)
  └── state.py            — sync cursor/state persistence
        ↓
TomiHub PostgreSQL (ai_pm DB)
  ├── projects / issues / comments / issue_changelog / sprints / knowledge_pages
  └── new table: redmine_sync_state (cursor, last sync time, status)
        ↓
ai-brain existing analysis (six-dimension health/risk/reporting) — data source is already the TomiHub model, usable directly
```

---

## 3. Data Mapping (Redmine → TomiHub)

### 3.1 Projects

| Redmine | TomiHub projects | Notes |
|---------|-----------------|------|
| identifier | key | unique identifier |
| name | name | |
| description | description | |
| parent_id | (hierarchy mapping) | child project → separate project, record parent into custom_fields |
| is_public | visibility | public/private |

### 3.2 Issues

| Redmine | TomiHub issues | Notes |
|---------|----------------|------|
| id | custom_fields.redmine_id | keep original id for incremental sync |
| tracker_name | type | bug→bug, feature/story→story, task→task, rest→task |
| subject | title | |
| description | description | |
| status_id → name | status | map to todo/in_progress/in_review/done/cancelled |
| priority_id → name | priority | low/medium/high/critical |
| assigned_to_id | assignee_id | user mapping |
| author_id | reporter_id | user mapping |
| fixed_version_id | sprint_id | version→sprint mapping |
| parent_id | parent_id | issue hierarchy |
| estimated_hours | story_points | hours→points (configurable) |
| due_date | due_date | |
| start_date | started_at | |
| done_ratio | (derived) | used as completion-rate signal |
| created_on / updated_on | created_at / updated_at | |

### 3.3 Journal → Comments + Changelog

| Redmine Journal | TomiHub | Notes |
|-----------------|---------|------|
| notes non-empty | comments | author mapping, keep created_at |
| attribute changes (status/priority/assignee) | issue_changelog | field/old_value/new_value/created_at |
| private_notes | (skip or flag) | skip private by default |

> **Schema fact (v0.2 fix)**: the `comments` table has **no tenant_id** column; it has
> `author_name` (added in migration 050), `author_id NOT NULL`, `body NOT NULL`.
> The `issue_changelog` primary key is `(tenant_id, id)`, with `changed_by NOT NULL` —
> changelog entries whose user cannot be resolved are skipped directly.

### 3.4 Versions → Sprints

| Redmine Version | TomiHub sprints | Notes |
|-----------------|-----------------|------|
| name | name | |
| start_date / created_on | start_date | NOT NULL — default back to created_on when missing |
| effective_date / due_date | end_date | NOT NULL — default back to start_date when missing |
| status | status | open/locked→planning, closed→closed |
| description | goal | optional |

> **Schema fact (v0.2 fix)**: the `sprints` table has **no tenant_id**;
> `start_date DATE NOT NULL`, `end_date DATE NOT NULL`; `status` defaults to
> `'planning'` (no 'active' default value, but the column is VARCHAR(20) without CHECK, so 'active' also works —
> the mapping uniformly uses planning/closed to stay consistent with the backend SprintService).

### 3.5 Wiki → Knowledge Base

| Redmine WikiPage | TomiHub knowledge_pages | Notes |
|------------------|------------------------|------|
| title | title | |
| text | content | |
| created_on/updated_on | created_at/updated_at | |
| parent page | hierarchical title (parent/child) | |

---

## 4. Sync Strategy

### 4.1 Full Initial Load (first run)
- Option A (recommended): paginated REST API pull of the full set (issues?limit=100&page=N)
- Option B: direct DB access (reuse redmine_reader, read full set in one pass)
- Output: TomiHub project + full issue/comment/changelog/sprint/wiki

### 4.2 Incremental Sync (scheduled, e.g. every 5-15 minutes)
- **issues**:`issues.json?updated_on=>=<last_sync>` or `since_id`
- **journals**:pull journals for issues updated since last sync
- **versions / wiki**:full comparison on updated_on

### 4.3 Idempotency
- issues deduplicated via `UNIQUE(project_id, issue_number)` conflict key (issue_number = Redmine id)
- comments deduplicated by `id` (deterministically generated via make_uuid)
- changelog deduplicated via `(tenant_id, id)` conflict key
- ON CONFLICT DO UPDATE (update when fields change)

> **User mapping (v0.2 fix)**: the `users` table has **no tenant_id / custom_fields columns**,
> so redmine_user_id cannot be stored in custom_fields. Changed to:
> 1. `users.id = make_uuid("redmine-user", redmine_uid)` — the deterministic UUID itself is the mapping
> 2. Before inserting, deduplicate by email (if a real user has the same email, reuse their id)
> 3. Password hash is `!redmine-sync` (sync account that cannot log in)
> Users are written before issues (author/assignee are upserted first), guaranteeing
> `reporter_id NOT NULL REFERENCES users(id)` is not violated.

### 4.4 State Persistence
New table `redmine_sync_state`:
```sql
CREATE TABLE IF NOT EXISTS redmine_sync_state (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    redmine_url VARCHAR(255) NOT NULL,
    project_key VARCHAR(100) NOT NULL,      -- Redmine identifier
    last_issue_updated VARCHAR(40),          -- updated_on cursor
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE(tenant_id, redmine_url, project_key)
);
```

---

## 5. Configuration (env-driven, AIPM_ prefix)

```
# Redmine REST API
AIPM_REDMINE_URL=http://redmine.example.com
AIPM_REDMINE_API_KEY=xxxx                # Redmine REST API key
AIPM_REDMINE_PROJECT_KEYS=proj1,proj2    # identifiers of projects to sync (comma-separated)
AIPM_REDMINE_TENANT_ID=                  # target TomiHub tenant; empty = use FALLBACK_TENANT_ID
AIPM_REDMINE_SYNC_INTERVAL_MINUTES=30    # Celery beat incremental interval (minutes)
```

> **v0.2 fix**: `AIPM_REDMINE_PROJECTS` → `AIPM_REDMINE_PROJECT_KEYS` (consistent with the
> settings field); `AIPM_REDMINE_SYNC_INTERVAL` (seconds) →
> `AIPM_REDMINE_SYNC_INTERVAL_MINUTES` (minutes); DB_DSN direct-connection full load is deferred (R1 uses REST only).

---

## 6. File Structure

```
ai-brain/
├── redmine_connector/
│   ├── __init__.py
│   ├── rest_client.py    # httpx REST client (pagination/cursor/rate limiting)
│   ├── mapper.py         # Redmine → TomiHub model mapping (pure functions, unit-testable)
│   ├── sync.py           # sync orchestration (full + incremental, idempotent writes)
│   ├── state.py          # cursor/state read/write
│   └── cli.py            # manual sync trigger (python -m redmine_connector.cli --full)
├── tests/
│   └── test_redmine_mapper.py   # mapper unit tests (13 cases)
└── tasks/
    └── redmine_sync_tasks.py   # Celery scheduled tasks (periodic incremental sync)
```

---

## 7. Reuse and New Additions

| Reuse | Notes |
|------|------|
| `import_engine/field_mapper.py` | reference for enum mapping logic (tracker/status/priority) |
| `import_engine/redmine_reader.py` | direct DB read (optional full-load method) |
| `db/connection.py` PG_DSN | writing to TomiHub |
| analysis framework | reused with zero changes once data is persisted |

| New additions | Notes |
|------|------|
| rest_client.py | REST pull (currently only DB read exists) |
| mapper.py | model mapping (current importer writes to DB; needs to be distilled into pure mapping) |
| sync.py + state.py | incremental sync orchestration |
| redmine_sync_state table | migration file |
| Celery scheduled task | periodic sync |

---

## 8. Acceptance Criteria

1. Configure Redmine URL + API key + project identifiers → full sync to TomiHub
2. Second run → incremental (only pulls changes), no duplicates
3. Edit issue/add comment in Redmine → mirrored to TomiHub within the interval period
4. ai-brain health analysis/risk works directly on the mirrored project (identical to native TomiHub projects)
5. Network down/Redmine unreachable → no crash, last_error recorded in state, resumes after recovery
6. Multi-project independent cursors that do not interfere with each other
7. User/comment/sprint writes do not violate NOT NULL and FK constraints (users.email, comments.author_id,
   issue_changelog.changed_by, sprints.start_date/end_date, issues.workflow_id)
