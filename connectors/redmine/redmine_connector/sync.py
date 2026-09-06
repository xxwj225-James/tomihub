"""
Redmine → TomiHub sync orchestration.

Full-init + incremental (updated_on cursor) mirroring of a Redmine project into
the TomiHub data model. Idempotent (deterministic UUIDs + ON CONFLICT).

Schema notes (verified against supabase/migrations):
  * users          — NO tenant_id / custom_fields; mapping carried by
                     deterministic id + email lookup
  * comments       — NO tenant_id; has author_name (migration 050)
  * sprints        — NO tenant_id; start_date/end_date NOT NULL
  * knowledge_pages— no custom_fields column
  * issues         — workflow_id NOT NULL REFERENCES workflows(id)

Usage (async):
    from redmine_connector.sync import RedmineSync
    sync = RedmineSync(dsn, tenant_id, redmine_url, api_key, project_key)
    await sync.run_full()      # first-time full mirror
    await sync.run_incremental()  # periodic incremental
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import asyncpg

from .rest_client import RedmineRestClient
from .state import SyncState, ensure_table
from . import mapper

log = logging.getLogger(__name__)


class RedmineSync:
    def __init__(self, dsn: str, tenant_id: str, redmine_url: str, api_key: str,
                 project_key: str, target_project_name: str = ""):
        self.dsn = dsn
        self.tenant_id = tenant_id
        self.project_key = project_key
        self.target_project_name = target_project_name or project_key
        self.client = RedmineRestClient(redmine_url, api_key)
        self.state = SyncState(dsn, tenant_id, redmine_url, project_key)

    # ─── Helpers ──────────────────────────────────────────────────────────

    async def _default_workflow_id(self, conn: asyncpg.Connection) -> str:
        """A real workflow id for the tenant (issues.workflow_id has an FK).

        Prefer the tenant's default, then any tenant workflow, then any global
        default workflow. Returns None (caller must abort) if none exists.
        """
        tenant_queries = (
            """SELECT id FROM workflows
               WHERE tenant_id = $1 AND is_default = TRUE LIMIT 1""",
            """SELECT id FROM workflows WHERE tenant_id = $1 LIMIT 1""",
        )
        global_queries = (
            """SELECT id FROM workflows
               WHERE tenant_id = '00000000-0000-0000-0000-000000000000'
                 AND is_default = TRUE LIMIT 1""",
            """SELECT id FROM workflows LIMIT 1""",
        )
        for sql in tenant_queries:
            row = await conn.fetchrow(sql, self.tenant_id)
            if row:
                return row["id"]
        for sql in global_queries:
            row = await conn.fetchrow(sql)
            if row:
                return row["id"]
        raise RuntimeError(
            "No workflow exists in the database; seed workflows first "
            "(migration 017_seed_master_data.sql)")

    async def _upsert_user(self, conn: asyncpg.Connection, redmine_user: dict) -> str | None:
        """Create or fetch the TomiHub user for a Redmine user.

        Matches by email first (a real user may already exist); otherwise
        inserts with the deterministic uuid and `!redmine-sync` password hash.
        Returns tomihub id or None.
        """
        if not redmine_user:
            return None
        uid = redmine_user.get("id")
        if uid is None:
            return None
        u = mapper.to_user(redmine_user, self.tenant_id)
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", u["email"])
        if existing:
            return existing["id"]
        try:
            await conn.execute(
                """INSERT INTO users (id, email, password_hash, display_name, email_verified)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (email) DO NOTHING""",
                u["id"], u["email"], u["password_hash"],
                u["display_name"], u["email_verified"])
        except Exception as e:
            log.warning("User upsert failed for redmine user %s: %s", uid, e)
            return None
        row = await conn.fetchrow("SELECT id FROM users WHERE email = $1", u["email"])
        return row["id"] if row else u["id"]

    # ─── Project ──────────────────────────────────────────────────────────

    async def _upsert_project(self, conn: asyncpg.Connection, redmine_project: dict) -> str:
        p = mapper.to_project(redmine_project, self.tenant_id)
        p["name"] = self.target_project_name or p["name"]
        await conn.execute(
            """INSERT INTO projects (id, tenant_id, key, name, description, visibility, status, phase, settings)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 updated_at = NOW()""",
            p["id"], p["tenant_id"], p["key"], p["name"], p["description"],
            p["visibility"], p["status"], p["phase"],
            json.dumps(p["settings"], ensure_ascii=False))
        return p["id"]

    # ─── Versions → sprints ───────────────────────────────────────────────

    async def _sync_versions(self, conn: asyncpg.Connection, project_id: str,
                             redmine_project_id: int) -> dict[int, str]:
        versions = await self.client.list_versions(redmine_project_id)
        version_map: dict[int, str] = {}
        for v in versions:
            s = mapper.to_sprint(v, project_id, self.tenant_id)
            await conn.execute(
                """INSERT INTO sprints (id, project_id, name, goal, status, start_date, end_date)
                   VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)
                   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
                     status = EXCLUDED.status, end_date = EXCLUDED.end_date""",
                s["id"], s["project_id"], s["name"], s["goal"], s["status"],
                s["start_date"], s["end_date"])
            version_map[int(v["id"])] = s["id"]
        return version_map

    # ─── Issues ───────────────────────────────────────────────────────────

    async def _sync_issues(self, conn: asyncpg.Connection, project_id: str,
                           workflow_id: str, redmine_project_id: int,
                           user_map: dict[int, str], version_map: dict[int, str],
                           updated_since: str | None,
                           sync_journals: bool = True) -> tuple[dict[int, str], str | None]:
        """Mirror issues; returns (issue_map, max_updated_on). Users are
        upserted BEFORE to_issue so assignee/reporter resolve correctly."""
        issue_map: dict[int, str] = {}
        parent_map: dict[int, int] = {}  # redmine issue id → parent redmine id
        max_updated: str | None = None
        journal_stats = {"comments": 0, "changelog": 0}

        # Redmine 7 list-endpoint quirks: child issues are excluded from list
        # responses when a project filter is applied, and journals are never
        # embedded in list responses. Collect roots from the list, then walk
        # children and fetch journals via the detail endpoint.
        roots: list[dict] = []
        async for redmine_issue in self.client.iter_issues(
                project_id=redmine_project_id, updated_since=updated_since,
                include_journals=sync_journals):
            roots.append(redmine_issue)

        queue = list(roots)
        seen: set[int] = set()
        while queue:
            redmine_issue = queue.pop(0)
            rid = int(redmine_issue.get("id") or 0)
            if rid in seen:
                continue
            seen.add(rid)

            # Detail fetch — fills journals AND children (list omits both)
            if sync_journals:
                try:
                    full = await self.client.get_issue(
                        rid, include_journals=True, include_children=True)
                    if full:
                        redmine_issue = full
                except Exception:
                    pass
            for child in redmine_issue.get("children") or []:
                queue.append(child)

            # Upsert author/assignee users first
            for who in (redmine_issue.get("author"), redmine_issue.get("assigned_to")):
                if who and who.get("id") not in user_map:
                    uid = await self._upsert_user(conn, who)
                    if uid:
                        user_map[int(who["id"])] = uid

            i = mapper.to_issue(redmine_issue, project_id, self.tenant_id, user_map)
            i["workflow_id"] = workflow_id
            # Resolve sprint from fixed_version
            version = redmine_issue.get("fixed_version") or {}
            if version.get("id") in version_map:
                i["sprint_id"] = version_map[int(version["id"])]

            # reporter_id is NOT NULL — guard against a failed author upsert
            if i["reporter_id"] is None:
                log.warning("Issue %s skipped: author user could not be resolved", rid)
                continue

            await conn.execute(
                """INSERT INTO issues
                       (id, tenant_id, project_id, workflow_id, issue_number, title, description,
                        type, status, priority, assignee_id, reporter_id, sprint_id, parent_id,
                        story_points, due_date, started_at, labels, custom_fields, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::date,$17,$18,$19,$20,$21)
                   ON CONFLICT (project_id, issue_number) DO UPDATE SET
                     title = EXCLUDED.title, description = EXCLUDED.description,
                     status = EXCLUDED.status, priority = EXCLUDED.priority,
                     assignee_id = EXCLUDED.assignee_id, sprint_id = EXCLUDED.sprint_id,
                     story_points = EXCLUDED.story_points, due_date = EXCLUDED.due_date,
                     updated_at = EXCLUDED.updated_at""",
                i["id"], i["tenant_id"], i["project_id"], i["workflow_id"],
                i["issue_number"], i["title"], i["description"],
                i["type"], i["status"], i["priority"],
                i["assignee_id"], i["reporter_id"], i["sprint_id"], i["parent_id"],
                i["story_points"], i["due_date"], i["started_at"],
                i["labels"], json.dumps(i["custom_fields"], ensure_ascii=False),
                i["created_at"], i["updated_at"])
            issue_map[rid] = i["id"]
            parent = redmine_issue.get("parent") or {}
            if parent.get("id"):
                parent_map[rid] = int(parent["id"])

            if sync_journals and redmine_issue.get("journals"):
                js = await self._sync_journals(
                    conn, project_id, redmine_issue, i["id"], user_map)
                journal_stats["comments"] += js["comments"]
                journal_stats["changelog"] += js["changelog"]

            up = redmine_issue.get("updated_on")
            if up and (max_updated is None or up > max_updated):
                max_updated = up

        # Resolve parents in-memory (no second API fetch)
        for rid, parent_rid in parent_map.items():
            if parent_rid in issue_map and rid in issue_map:
                await conn.execute(
                    "UPDATE issues SET parent_id = $1 WHERE id = $2",
                    issue_map[parent_rid], issue_map[rid])

        log.info("Issues synced: %d, journals: %s", len(issue_map), journal_stats)
        return issue_map, max_updated

    # ─── Journals (comments + changelog) ──────────────────────────────────

    async def _sync_journals(self, conn: asyncpg.Connection, project_id: str,
                             redmine_issue: dict, issue_id: str,
                             user_map: dict[int, str]) -> dict[str, int]:
        journals = redmine_issue.get("journals", []) or []
        stats = {"comments": 0, "changelog": 0}
        for journal in journals:
            # Sync journal author
            author = journal.get("user") or {}
            if author.get("id") not in user_map:
                uid = await self._upsert_user(conn, author)
                if uid:
                    user_map[int(author["id"])] = uid

            # Comment (if notes) — author_id NOT NULL, skip if unresolved
            c = mapper.to_comment(journal, issue_id, self.tenant_id, user_map)
            if c and c["author_id"]:
                await conn.execute(
                    """INSERT INTO comments (id, issue_id, author_id, author_name, body, created_at)
                       VALUES ($1,$2,$3,$4,$5,$6)
                       ON CONFLICT (id) DO NOTHING""",
                    c["id"], c["issue_id"], c["author_id"],
                    c["author_name"], c["body"], c["created_at"])
                stats["comments"] += 1

            # Changelog — changed_by NOT NULL, skip unresolved entries
            for cl in mapper.to_changelog(journal, issue_id, self.tenant_id, user_map):
                if not cl["changed_by"]:
                    continue
                await conn.execute(
                    """INSERT INTO issue_changelog (id, tenant_id, issue_id, changed_by, field, old_value, new_value, created_at)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                       ON CONFLICT (tenant_id, id) DO NOTHING""",
                    cl["id"], cl["tenant_id"], cl["issue_id"], cl["changed_by"],
                    cl["field"], cl["old_value"], cl["new_value"], cl["created_at"])
                stats["changelog"] += 1
        return stats

    # ─── Wiki ─────────────────────────────────────────────────────────────

    async def _sync_wiki(self, conn: asyncpg.Connection, project_id: str,
                         redmine_project_id: int) -> int:
        pages = await self.client.list_wiki_pages(redmine_project_id)
        count = 0
        for p in pages:
            try:
                full = await self.client.get_wiki_page(self.project_key, p.get("title", ""))
            except Exception as e:
                log.warning("Wiki page %s sync failed: %s", p.get("title"), e)
                continue
            wp = mapper.to_wiki_page(full, project_id, self.tenant_id)
            await conn.execute(
                """INSERT INTO knowledge_pages (id, tenant_id, project_id, title, content, status, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                   ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at""",
                wp["id"], wp["tenant_id"], wp["project_id"], wp["title"], wp["content"],
                wp["status"], wp["created_at"], wp["updated_at"])
            count += 1
        return count

    # ─── Public entry points ──────────────────────────────────────────────

    async def _find_redmine_project(self) -> dict:
        projects = await self.client.list_projects()
        rp = next((p for p in projects if str(p.get("identifier", "")).lower() == self.project_key.lower()
                   or str(p.get("id")) == self.project_key), None)
        if not rp:
            raise RuntimeError(f"Redmine project not found: {self.project_key}")
        return rp

    async def run_full(self) -> dict:
        """Full mirror of the Redmine project into TomiHub."""
        await ensure_table(self.dsn)
        conn = await asyncpg.connect(self.dsn)
        try:
            rp = await self._find_redmine_project()
            workflow_id = await self._default_workflow_id(conn)
            project_id = await self._upsert_project(conn, rp)
            user_map: dict[int, str] = {}

            version_map = await self._sync_versions(conn, project_id, int(rp["id"]))
            issue_map, max_updated = await self._sync_issues(
                conn, project_id, workflow_id, int(rp["id"]), user_map, version_map, None)
            wiki_count = await self._sync_wiki(conn, project_id, int(rp["id"]))

            await self.state.save(max_updated)
            return {
                "issues": len(issue_map),
                "versions": len(version_map),
                "wiki": wiki_count,
                "cursor": max_updated,
            }
        finally:
            await conn.close()
            await self.client.close()

    async def run_incremental(self) -> dict:
        """Incremental sync since last cursor."""
        await ensure_table(self.dsn)
        state = await self.state.load()
        cursor = state.get("last_issue_updated")
        conn = await asyncpg.connect(self.dsn)
        try:
            rp = await self._find_redmine_project()
            workflow_id = await self._default_workflow_id(conn)
            project_id = await self._upsert_project(conn, rp)
            user_map: dict[int, str] = {}

            version_map = await self._sync_versions(conn, project_id, int(rp["id"]))
            issue_map, max_updated = await self._sync_issues(
                conn, project_id, workflow_id, int(rp["id"]), user_map, version_map, cursor)
            wiki_count = await self._sync_wiki(conn, project_id, int(rp["id"]))

            new_cursor = max_updated or cursor
            await self.state.save(new_cursor)
            return {
                "issues_synced": len(issue_map),
                "wiki": wiki_count,
                "cursor": new_cursor,
            }
        except Exception as e:
            await self.state.save(cursor, error=str(e))
            raise
        finally:
            await conn.close()
            await self.client.close()
