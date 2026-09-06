"""
Redmine experiment verification — checks synced data in the TomiHub DB.

Queries the ai_pm database and prints, for a given tenant / project key:
  * project row (settings.redmine_project_id)
  * issues count + sample
  * comments count
  * changelog count
  * sprints (versions) count
  * knowledge_pages count
  * synced users (email like 'redmine-%@sync.local' or matched by email)
  * redmine_sync_state cursor row

Usage:
    python -m redmine_connector.verify_sync --dsn postgresql://postgres:postgres@localhost:5433/ai_pm \
        --tenant <tenant-id> [--project-key TESTPROJ]

Env fallback: AIPM_DATABASE_URL, AIPM_REDMINE_TENANT_ID, AIPM_REDMINE_PROJECT_KEYS
"""

from __future__ import annotations

import argparse
import asyncio
import os

import asyncpg


async def _main(dsn: str, tenant_id: str, project_key: str) -> int:
    conn = await asyncpg.connect(dsn)
    try:
        key_upper = project_key.upper()

        project = await conn.fetchrow(
            """SELECT id, key, name, settings, created_at, updated_at
               FROM projects
               WHERE tenant_id = $1 AND key = $2""", tenant_id, key_upper)
        if not project:
            print(f"!! Project {key_upper} not found for tenant {tenant_id}")
            print("   Did the full sync run? Check AIPM_REDMINE_TENANT_ID matches the seed tenant.")
            return 1
        pid = project["id"]
        rpid = (project["settings"] or {}).get("redmine_project_id") if isinstance(project["settings"], dict) else None
        print(f"Project: {project['key']}  name={project['name']!r}  redmine_project_id={rpid}")

        n_issues = await conn.fetchval(
            "SELECT count(*) FROM issues WHERE project_id = $1", pid)
        print(f"Issues: {n_issues}")

        sample = await conn.fetch(
            """SELECT issue_number, title, type, status, priority,
                      reporter_id, assignee_id, sprint_id, parent_id,
                      custom_fields->>'redmine_id' AS redmine_id
               FROM issues WHERE project_id = $1
               ORDER BY issue_number LIMIT 3""", pid)
        for row in sample:
            print(f"  #{row['issue_number']} [{row['type']}/{row['status']}/{row['priority']}] "
                  f"{row['title'][:48]!r} reporter={str(row['reporter_id'])[:8]}.. "
                  f"redmine_id={row['redmine_id']}")

        n_comments = await conn.fetchval(
            """SELECT count(*) FROM comments c
               JOIN issues i ON i.id = c.issue_id
               WHERE i.project_id = $1""", pid)
        print(f"Comments: {n_comments}")

        n_changelog = await conn.fetchval(
            """SELECT count(*) FROM issue_changelog cl
               JOIN issues i ON i.id = cl.issue_id
               WHERE i.project_id = $1""", pid)
        print(f"Changelog entries: {n_changelog}")

        n_sprints = await conn.fetchval(
            "SELECT count(*) FROM sprints WHERE project_id = $1", pid)
        print(f"Sprints (versions): {n_sprints}")

        n_wiki = await conn.fetchval(
            "SELECT count(*) FROM knowledge_pages WHERE project_id = $1", pid)
        print(f"Knowledge pages (wiki): {n_wiki}")

        # users synced into this tenant's project (author/assignee/commenters)
        urows = await conn.fetch(
            """SELECT DISTINCT u.id, u.email, u.display_name
               FROM users u
               JOIN issues i ON i.reporter_id = u.id OR i.assignee_id = u.id
               WHERE i.project_id = $1""", pid)
        print(f"Synced users (via issues): {len(urows)}")
        for u in urows[:6]:
            print(f"  {u['email']}  {u['display_name']}")

        state = await conn.fetchrow(
            """SELECT last_issue_updated, last_sync_at, last_error
               FROM redmine_sync_state
               WHERE tenant_id = $1""", tenant_id)
        if state:
            print(f"Sync state: cursor={state['last_issue_updated']}  "
                  f"last_sync_at={state['last_sync_at']}  last_error={state['last_error']}")
        else:
            print("Sync state: (no row — run_full/run_incremental never saved a cursor)")

        return 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Redmine → TomiHub sync result")
    parser.add_argument("--dsn", default=None)
    parser.add_argument("--tenant", default=None)
    parser.add_argument("--project-key", default="TESTPROJ")
    args = parser.parse_args()

    dsn = args.dsn or os.getenv("AIPM_DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/ai_pm")
    dsn = dsn.replace("+asyncpg", "")
    tenant = args.tenant or os.getenv("AIPM_REDMINE_TENANT_ID") or os.getenv("AIPM_FALLBACK_TENANT_ID", "")
    if not tenant:
        print("--tenant required (or set AIPM_REDMINE_TENANT_ID)")
        return 2
    keys = os.getenv("AIPM_REDMINE_PROJECT_KEYS", args.project_key)
    project_key = keys.split(",")[0].strip().upper()
    return asyncio.run(_main(dsn, tenant, project_key))


if __name__ == "__main__":
    raise SystemExit(main())
