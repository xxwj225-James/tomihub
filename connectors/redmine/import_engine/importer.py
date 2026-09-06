"""
Bulk importer — writes mapped data to TomiHub PostgreSQL via asyncpg.

Uses PostgreSQL COPY protocol for maximum speed (>10K rows/sec).
Maintains idempotency via ON CONFLICT handling.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

log = logging.getLogger(__name__)


class TomiHubImporter:
    """Bulk-imports mapped data into TomiHub PostgreSQL."""

    def __init__(self, dsn: str):
        self.dsn = dsn
        self.pool = None
        self.stats = {
            "users": {"created": 0, "skipped": 0},
            "sprints": {"created": 0},
            "issues": {"created": 0},
            "comments": {"created": 0},
            "changelog": {"created": 0},
            "wiki": {"created": 0},
        }

    async def connect(self) -> None:
        import asyncpg
        self.pool = await asyncpg.create_pool(dsn=self.dsn, min_size=2, max_size=10)
        log.info("Connected to TomiHub PostgreSQL")

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    # ─── Users ─────────────────────────────────────────────────────────────

    async def import_users(self, users: list[dict]) -> dict[int, str]:
        """Import users. If email already exists, link to existing user.
        Returns updated {redmine_id: tomihub_uuid} mapping.
        """
        user_map: dict[int, str] = {}
        async with self.pool.acquire() as conn:
            for u in users:
                redmine_id = u.pop("_redmine_id", 0)
                u.pop("_redmine_login", "")

                # Check if user already exists by email
                existing = await conn.fetchrow(
                    "SELECT id FROM users WHERE email = $1", u["email"]
                )
                if existing:
                    user_map[redmine_id] = existing["id"]
                    self.stats["users"]["skipped"] += 1
                    continue

                # Insert new user
                try:
                    await conn.execute("""
                        INSERT INTO users (id, email, display_name, password_hash, status)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
                    """, u["id"], u["email"], u["display_name"], u["password_hash"], u["status"])
                    user_map[redmine_id] = u["id"]
                    self.stats["users"]["created"] += 1
                except Exception as e:
                    log.warning("Failed to create user %s: %s", u["email"], e)
                    # Still map the ID so references don't break
                    user_map[redmine_id] = u["id"]

        return user_map

    # ─── Project settings ──────────────────────────────────────────────────

    async def update_project(self, project_data: dict) -> None:
        """Update project description + settings from Redmine metadata."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                UPDATE projects
                SET description = CASE WHEN description IS NULL OR description = '' THEN $2 ELSE description END,
                    settings = COALESCE(settings, '{}'::jsonb) || $3::jsonb
                WHERE id = $1
            """, project_data.get("_target_id"), project_data.get("description", ""),
                __import__("json").dumps(project_data.get("settings", {})))

    # ─── Sprints ───────────────────────────────────────────────────────────

    async def import_sprints(self, sprints: list[dict]) -> dict[int, str]:
        """Import versions as sprints."""
        sprint_map: dict[int, str] = {}
        if not sprints:
            return sprint_map

        # Prepare rows for bulk insert
        columns = ["id", "project_id", "name", "goal", "start_date", "end_date", "status", "created_at"]
        rows = []
        for s in sprints:
            redmine_id = s.pop("_redmine_id", 0)
            sprint_map[redmine_id] = s["id"]
            rows.append([s.get(c) for c in columns])

        async with self.pool.acquire() as conn:
            await conn.copy_records_to_table("sprints", columns=columns, records=rows)
            self.stats["sprints"]["created"] = len(rows)

        return sprint_map

    # ─── Issues (bulk COPY) ────────────────────────────────────────────────

    async def import_issues(self, issues: list[dict], user_map: dict[int, str],
                            sprint_map: dict[int, str]) -> dict[int, str]:
        """Bulk-import issues using COPY protocol."""
        issue_map: dict[int, str] = {}
        if not issues:
            return issue_map

        import json as jmod

        columns = [
            "id", "tenant_id", "project_id", "workflow_id",
            "issue_number", "title", "description",
            "type", "status", "priority",
            "assignee_id", "reporter_id", "sprint_id", "parent_id",
            "story_points", "due_date", "started_at", "closed_at",
            "labels", "custom_fields", "created_at", "updated_at",
        ]

        rows = []
        issue_numbers = {}  # Per-project counter for issue_number assignment

        for idx, issue in enumerate(issues):
            redmine_id = issue.pop("_redmine_id", 0)
            issue_map[redmine_id] = issue["id"]

            # Assign sequential issue_number per project
            pid = issue["project_id"]
            if pid not in issue_numbers:
                # Get current max issue_number for this project
                async with self.pool.acquire() as conn:
                    max_num = await conn.fetchval(
                        "SELECT COALESCE(MAX(issue_number), 0) FROM issues WHERE project_id = $1",
                        pid,
                    )
                issue_numbers[pid] = max_num
            issue_numbers[pid] += 1
            issue["issue_number"] = issue_numbers[pid]

            # Resolve parent_id through issue_map (issues imported in order)
            if issue.get("parent_id") is None and issue.get("_redmine_parent_id"):
                issue["parent_id"] = issue_map.get(issue["_redmine_parent_id"])

            rows.append([
                issue["id"], issue["tenant_id"], issue["project_id"],
                issue.get("workflow_id"), issue["issue_number"],
                issue["title"], issue.get("description", ""),
                issue["type"], issue["status"], issue["priority"],
                issue.get("assignee_id"), issue.get("reporter_id"),
                issue.get("sprint_id"), issue.get("parent_id"),
                issue.get("story_points"), issue.get("due_date"),
                issue.get("started_at"), issue.get("closed_at"),
                issue.get("labels", []), jmod.dumps(issue.get("custom_fields", {}), ensure_ascii=False),
                issue.get("created_at"), issue.get("updated_at"),
            ])

        async with self.pool.acquire() as conn:
            await conn.copy_records_to_table("issues", columns=columns, records=rows)
            self.stats["issues"]["created"] = len(rows)

        # Update issue_number sequence
        for pid, max_num in issue_numbers.items():
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "SELECT setval('issues_issue_number_seq', $1) WHERE EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'issues_issue_number_seq')",
                    max_num,
                )

        return issue_map

    # ─── Comments ──────────────────────────────────────────────────────────

    async def import_comments(self, comments: list[dict]) -> int:
        if not comments:
            return 0

        columns = ["id", "issue_id", "author_id", "body", "created_at"]
        rows = [[c.get(cn) for cn in columns] for c in comments]

        async with self.pool.acquire() as conn:
            await conn.copy_records_to_table("comments", columns=columns, records=rows)
            self.stats["comments"]["created"] = len(rows)

        return len(rows)

    # ─── Changelog ─────────────────────────────────────────────────────────

    async def import_changelog(self, entries: list[dict]) -> int:
        if not entries:
            return 0

        columns = ["id", "tenant_id", "issue_id", "changed_by", "field", "old_value", "new_value", "created_at"]
        rows = [[e.get(cn) for cn in columns] for e in entries]

        async with self.pool.acquire() as conn:
            await conn.copy_records_to_table("issue_changelog", columns=columns, records=rows)
            self.stats["changelog"]["created"] = len(rows)

        return len(rows)

    # ─── Wiki ──────────────────────────────────────────────────────────────

    async def import_wiki_pages(self, pages: list[dict]) -> int:
        if not pages:
            return 0

        columns = [
            "id", "tenant_id", "project_id", "title", "content",
            "category", "status", "created_by", "created_at", "updated_at",
        ]
        rows = []
        for p in pages:
            p.pop("_redmine_id", None)
            rows.append([p.get(cn) for cn in columns])

        async with self.pool.acquire() as conn:
            await conn.copy_records_to_table("knowledge_pages", columns=columns, records=rows)
            self.stats["wiki"]["created"] = len(rows)

        return len(rows)

    # ─── Stats ─────────────────────────────────────────────────────────────

    def get_stats(self) -> dict[str, Any]:
        return self.stats
