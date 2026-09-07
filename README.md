# TomiHub

AI-powered project management platform — **open-source core, closed AI engine**.

> TomiHub = project management (Issues / Board / Gantt / Wiki / Sprint /
> Permissions / Multi-tenant) + AI assistance (6-dimension health analysis,
> risk prediction, AI reports). This repository is the **open-source base**
> (AGPL-3.0): a fully usable project-management stack plus the Redmine
> connector.
>
> The AI analysis engine (ai-brain) is a separate closed component —
> distributed under a per-deployment commercial license, not part of this
> repository.
>
> **AI features are gated:** they are NOT part of this open-source download.
> They run on the closed `ai-brain` engine, which requires an **ai-brain
> release** plus a **per-deployment license file (`ai-brain.lic`)** — see
> [Enterprise / AI](#enterprise--ai).

## Screenshots

Project Overview — AI health radar & risk monitoring (AI edition):

![Project Overview 1](screenshots/ProjectOverview1.png)

![Project Overview 2](screenshots/ProjectOverview2.png)

> Screenshots show the AI edition. Without an ai-brain + license the same
> screens render the no-AI edition (no health/risk/knowledge-map entries).

## What's in this repository

| Module | Description |
|--------|-------------|
| `backend/` | Java Spring Boot 3.3 microservices (auth / core / tenant / notification / webhook…) |
| `frontend/` | React 19 + TanStack Router + Zustand + Vite |
| `supabase/migrations/` | PostgreSQL schema (pgvector) |
| `connectors/redmine/` | Redmine REST connector + DB import engine (standalone) |
| `docker/` | Compose + Dockerfiles (core / frontend / infra) |
| `docs/` | Architecture / UI / deployment / permission design (non-AI) |

**Not included:** the closed `ai-brain/` analysis engine and
its AI design docs.

## Quick start (self-hosted, no-AI mode)

The open compose runs the full project-management stack WITHOUT the AI
engine (core + frontend + postgres + redis + rabbitmq). AI features require
the licensed ai-brain component — see the Enterprise section.

```bash
cd docker
cp .env.example .env        # adjust passwords / base URL
bash gen-keys.sh            # generate the JWT signing key pair into .env
docker compose up -d --build
# open http://localhost — the first-run setup wizard creates your tenant
```

> The no-AI build hides AI entries (health/risk/assistant/knowledge-map) in
> the UI and the nginx AI routes return a JSON notice instead of proxying to
> a missing ai-brain. The compose shipped in this repository already builds
> the no-AI edition (`VITE_ENABLE_AI_FEATURES=false`, demo mode off).
> `docker-compose.enterprise.yml` is the AI edition — used by deployments
> that run the licensed `ai-brain` component.

## Redmine connector

Mirror a Redmine project into the TomiHub data model with full + incremental
sync:

```bash
cd connectors/redmine
pip install -e .
AIPM_REDMINE_URL=... AIPM_REDMINE_API_KEY=... \
AIPM_REDMINE_PROJECT_KEYS=myproj AIPM_REDMINE_TENANT_ID=... \
AIPM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_pm \
python -m redmine_connector.cli --full
```

See `docs/redmine-connector-design.md` and `docs/redmine-experiment.md`.

## Enterprise / AI

AI features (health / risk / reports) run on the closed `ai-brain` service.
To obtain them you need:

1. an **ai-brain release** (prebuilt images, delivered against your machine),
2. a **per-deployment license file** (`ai-brain.lic`) issued for your
   machine — the runtime enforces it: without a valid license the AI
   services will not run (the enterprise compose sets
   `AIPM_LICENSE_ENFORCE=true`).

Contact us to request the ai-brain + license, or for: migration from
Redmine / Jira / ZenTao, industry templates, enterprise integration
(Feishu / WeCom / SSO), AI tuning, and ops retainers.

## MCP: connect clients (TomiLite as an MCP client)

TomiHub exposes an MCP server at:

```
https://<your-tomihub>/api/v1/mcp
```

Any MCP-compatible client can connect — **TomiLite works as an MCP client** ([TomiLite on GitHub](https://github.com/xxwj225-James/tomilite)).
In *TomiLite → Settings → MCP Servers* add a server with:

- **URL**: `https://<your-tomihub>/api/v1/mcp`
- **Auth**: an API key from *TomiHub → Settings → API Keys*, sent as header `X-Api-Key`

Example for Claude Code / Cursor (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "tomiHub": {
      "type": "http",
      "url": "https://<your-tomihub>/api/v1/mcp",
      "headers": { "X-Api-Key": "<your-api-key>" }
    }
  }
}
```

TomiHub's MCP tools (project health, risk, reports, …) then become available
to the connected client; write tools go through the HITL approval queue.

> **Availability**: the MCP AI tools are served by `ai-brain` and require the
> licensed AI edition (`docker-compose.enterprise.yml`). The open no-AI
> compose returns an `ai_unavailable` notice on `/api/v1/mcp`.

## License

AGPL-3.0 — see [LICENSE](LICENSE). Commercial licensing is available for
deployments that cannot comply with AGPL; it is bundled with enterprise
services, not sold separately.

The Redmine connector under `connectors/redmine/` is also AGPL-3.0 (an open
acquisition asset; the analysis engine that consumes mirrored data stays
distributed under a per-deployment license).
