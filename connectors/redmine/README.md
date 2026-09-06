# TomiHub Redmine Connector

Read-only REST connector that mirrors a Redmine project into the TomiHub
data model (`ai_pm` PostgreSQL) — issues, journals (→ comments/changelog),
versions (→ sprints) and wiki pages — with full + incremental (updated_on
cursor) sync.

This is part of TomiHub batch-1 open source (AGPL-3.0). It is self-contained
(httpx + asyncpg only) and does **not** require the TomiHub ai-brain service
to run as a CLI tool. ai-brain consumes it as a library.

## Layout

```
connectors/redmine/
├── redmine_connector/     REST sync (rest_client / mapper / sync / state)
├── import_engine/         DB-direct one-shot import (Redmine MySQL/PG/SQLite)
├── pyproject.toml
└── README.md
```

## Usage

```bash
# Full mirror of Redmine project "myproj" into ai_pm (tenant set below)
AIPM_REDMINE_URL=https://redmine.example.com \
AIPM_REDMINE_API_KEY=<redmine-api-key> \
AIPM_REDMINE_PROJECT_KEYS=myproj \
AIPM_REDMINE_TENANT_ID=<tomihub-tenant-uuid> \
AIPM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_pm \
python -m redmine_connector.cli --full

# Incremental since the saved cursor
python -m redmine_connector.cli --incremental
```

See `docs/redmine-experiment.md` (in the main repo) for the full end-to-end
experiment guide and `docs/redmine-connector-design.md` for the design.

## License

AGPL-3.0 — see LICENSE in the repository root. (Connector = open-source
acquisition asset; the TomiHub ai-brain analysis engine that consumes the
mirrored data is a separate closed component until batch-2 open source.)
