# TomiHub

**English** | [中文](README.zh.md)

AI-powered project management platform — **open-source core, closed AI engine**.

> TomiHub = project management (Issues / Board / Gantt / Wiki / Sprint /
> Permissions / Multi-tenant) + AI assistance (6-dimension health analysis,
> risk prediction, AI reports). This repository is the **open-source base**
> (AGPL-3.0): a fully usable project-management stack plus the Redmine
> connector.
>
> The AI analysis engine (ai-brain) is a separate closed component: the images
> are freely pullable from ghcr.io, but running them requires a **license file
> (`ai-brain.lic`)** issued per deployment. The engine is not part of this
> repository's source and is **not** covered by AGPL-3.0.
>
> **AI features are gated by the license, not by the download:** the open core
> runs fine without any license, and with the ai-brain images + a valid license
> you get the full AI edition — see [Enterprise / AI](#enterprise--ai).

## Live demo

Try TomiHub without installing anything — the official site runs a shared
guest demo of the **full AI edition** (health radar, risk prediction, AI
reports, assistant, knowledge map):

**→ <http://124.223.90.64/login?demo=1>**

Also reachable from the website: <https://tomatovector.com/hub> → "Live Demo".

No account is needed — the link signs you in as a guest. It is a shared
workspace: the data is common to all visitors and resets daily, with
per-visitor quotas on AI features and issue creation.

> Prefer your own instance? Start with the open compose in
> [Quick start](#quick-start-self-hosted-no-ai-mode) — the project-management
> stack needs no license.

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

**Not included in this repository's source:** the closed `ai-brain/` analysis
engine and its AI design docs. (Its prebuilt images are downloadable from
ghcr.io and require a license to run — see [Enterprise / AI](#enterprise--ai).)

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

AI features (health / risk / reports / assistant / knowledge map) run on the
`ai-brain` service. The images are **freely pullable** — the open core plus
these images give you the complete AI edition:

```bash
docker pull ghcr.io/xxwj225-james/tomihub-brain-api:v1.2.2
docker pull ghcr.io/xxwj225-james/tomihub-brain-worker:v1.2.2
docker pull ghcr.io/xxwj225-james/tomihub-brain-beat:v1.2.2
```

Then run `docker/docker-compose.enterprise.yml` and drop your license file
into `docker/ai-brain.lic`. The compose file pins these same `v1.2.2` tags, so
the images you pull are exactly the ones the stack starts.

> Using a different version? Pull that tag and change the three `image:` lines
> in `docker-compose.enterprise.yml` to match — the tags are pinned on purpose
> so an upgrade is always an explicit, traceable action.

**The license is what gates AI features**, not the download: without a valid
`ai-brain.lic` the AI endpoints answer `403 license_required` and the AI
services refuse to start. Licensing is enforced in code (there is no
configuration switch to disable it).

Want to see it before licensing? The [live demo](#live-demo) runs the full AI
edition on a shared guest workspace. To run your own, request a **free 14-day
trial license** or a paid license at <https://tomatovector.com/hub-preview> —
issued per deployment and bound to your machine on first start. Quotas: 1
tenant / 10 seats / 3 projects for the trial; paid tiers scale to 200+ seats.

> **Proprietary component notice**: the `ai-brain` images are **proprietary
> software distributed under a commercial license — they are NOT covered by
> this repository's AGPL-3.0 license**. The AGPL-3.0 terms apply to the
> open-source code in this repository only. Redistribution of the `ai-brain`
> images outside your licensed deployment is not permitted.

Contact us for migration from Redmine / Jira / ZenTao, industry templates,
enterprise integration (Feishu / WeCom / SSO), AI tuning, and ops retainers.

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

AGPL-3.0 — see [LICENSE](LICENSE), covering the source code in this
repository. Commercial licensing is available for deployments that cannot
comply with AGPL; it is bundled with enterprise services, not sold separately.

**Scope note:** the `ai-brain` container images (pulled from ghcr.io) are
**proprietary software under a separate commercial license and are not covered
by AGPL-3.0**. They are provided for use within your licensed deployment only.

The Redmine connector under `connectors/redmine/` is also AGPL-3.0 (an open
acquisition asset; the analysis engine that consumes mirrored data stays
distributed under a per-deployment license).
