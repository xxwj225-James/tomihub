# TomiHub Redmine Connector

Read-only REST connector that mirrors a Redmine project into the TomiHub
data model (`ai_pm` PostgreSQL) — issues, journals (→ comments/changelog),
versions (→ sprints) and wiki pages — with full + incremental (updated_on
cursor) sync.

This is part of the TomiHub open-source base (AGPL-3.0). It is self-contained
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

## Install

Requires Python 3.11+. Install the package (only `httpx` + `asyncpg`):

```bash
cd connectors/redmine
pip install -e .
# or: uv pip install -e .
```

## Usage

```bash
# Full mirror of Redmine project "myproj" into ai_pm (tenant set below)
AIPM_REDMINE_URL=https://redmine.example.com \
AIPM_REDMINE_API_KEY=<redmine-api-key> \
AIPM_REDMINE_PROJECT_KEYS=myproj \
AIPM_REDMINE_TENANT_ID=<tomihub-tenant-uuid> \
AIPM_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ai_pm \
python -m redmine_connector.cli --full

# Incremental since the saved cursor
python -m redmine_connector.cli --incremental
```

> **Port note**: the shipped `docker/docker-compose.yml` maps PostgreSQL as
> `5433:5432`, so the host-side DSN must use **5433**. Inside a container on
> the compose network, use `postgres:5432` instead.

See `docs/redmine-experiment.md` (in the main repo) for the full end-to-end
experiment guide and `docs/redmine-connector-design.md` for the design.

## License

AGPL-3.0 — see LICENSE in the repository root. (The connector is
open-source; the TomiHub ai-brain analysis engine that consumes the mirrored
data is a separate component distributed under a commercial license.)
