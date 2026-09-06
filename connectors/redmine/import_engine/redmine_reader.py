"""
Redmine database reader — connects to Redmine MySQL/PostgreSQL and extracts
all project data as structured Python dicts.

Redmine supports MySQL, PostgreSQL, and SQLite. This module uses asyncpg for
PostgreSQL and aiomysql for MySQL. SQLite is read synchronously via aiosqlite.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional, Protocol

log = logging.getLogger(__name__)

# ─── Types ────────────────────────────────────────────────────────────────────


@dataclass
class RedmineProject:
    id: int
    name: str
    identifier: str
    description: str = ""
    status: int = 1
    is_public: bool = True
    parent_id: Optional[int] = None
    created_on: str = ""
    updated_on: str = ""


@dataclass
class RedmineIssue:
    id: int
    project_id: int
    tracker_name: str
    subject: str
    description: str = ""
    status_name: str = ""
    priority_name: str = ""
    author_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    category_name: str = ""
    fixed_version_id: Optional[int] = None
    fixed_version_name: str = ""
    parent_id: Optional[int] = None
    start_date: str = ""
    due_date: str = ""
    done_ratio: int = 0
    estimated_hours: Optional[float] = None
    created_on: str = ""
    updated_on: str = ""
    closed_on: str = ""
    custom_fields: dict = field(default_factory=dict)
    issue_number: str = ""  # Redmine uses #id format


@dataclass
class RedmineJournal:
    id: int
    journalized_type: str
    journalized_id: int
    user_id: Optional[int]
    notes: str = ""
    created_on: str = ""
    details: list[dict] = field(default_factory=list)


@dataclass
class RedmineWikiPage:
    id: int
    title: str
    text: str = ""
    author_id: Optional[int] = None
    comments: str = ""
    created_on: str = ""
    updated_on: str = ""


@dataclass
class RedmineVersion:
    id: int
    project_id: int
    name: str
    description: str = ""
    effective_date: str = ""
    status: str = "open"
    created_on: str = ""
    updated_on: str = ""


@dataclass
class RedmineUser:
    id: int
    login: str
    firstname: str
    lastname: str
    mail: str
    admin: bool = False
    status: int = 1


@dataclass
class RedmineAttachment:
    id: int
    container_type: str
    container_id: int
    filename: str
    disk_filename: str
    filesize: int
    content_type: str = ""
    author_id: Optional[int] = None
    description: str = ""
    created_on: str = ""


@dataclass
class RedmineData:
    """Complete data snapshot from a Redmine instance."""
    project: RedmineProject
    issues: list[RedmineIssue] = field(default_factory=list)
    journals: list[RedmineJournal] = field(default_factory=list)
    wiki_pages: list[RedmineWikiPage] = field(default_factory=list)
    versions: list[RedmineVersion] = field(default_factory=list)
    users: list[RedmineUser] = field(default_factory=list)
    attachments: list[RedmineAttachment] = field(default_factory=list)
    # Raw tracker/status/priority enumerations
    trackers: list[str] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    priorities: list[str] = field(default_factory=list)


# ─── Abstract reader interface ────────────────────────────────────────────────


class ISourceReader(Protocol):
    """Protocol for source database readers."""

    async def connect(self) -> None: ...
    async def close(self) -> None: ...
    async def enumerate_tables(self) -> list[str]: ...
    async def read_project(self, project_identifier: str) -> RedmineProject: ...
    async def read_users(self, project_id: int) -> list[RedmineUser]: ...
    async def read_issues(self, project_id: int) -> list[RedmineIssue]: ...
    async def read_journals(self, issue_ids: list[int]) -> list[RedmineJournal]: ...
    async def read_wiki_pages(self, project_id: int) -> list[RedmineWikiPage]: ...
    async def read_versions(self, project_id: int) -> list[RedmineVersion]: ...
    async def read_attachments(self, container_ids: list[int], container_type: str) -> list[RedmineAttachment]: ...
    async def read_enumerations(self) -> dict[str, list[str]]: ...


# ─── MySQL Reader ─────────────────────────────────────────────────────────────


class MySqlRedmineReader:
    """Reads Redmine data from a MySQL database (most common Redmine backend)."""

    def __init__(self, dsn: str):
        self.dsn = dsn  # mysql://user:pass@host:port/database
        self.pool = None

    async def connect(self) -> None:
        import aiomysql
        # Parse DSN
        parsed = self._parse_mysql_dsn(self.dsn)
        self.pool = await aiomysql.create_pool(
            host=parsed["host"],
            port=parsed["port"],
            user=parsed["user"],
            password=parsed["password"],
            db=parsed["database"],
            charset="utf8mb4",
            autocommit=True,
            minsize=1,
            maxsize=5,
        )
        log.info("Connected to Redmine MySQL at %s:%d", parsed["host"], parsed["port"])

    async def close(self) -> None:
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()

    @staticmethod
    def _parse_mysql_dsn(dsn: str) -> dict:
        """Parse mysql://user:pass@host:port/database into components."""
        dsn = dsn.replace("mysql://", "")
        # Split auth and rest
        auth, rest = dsn.split("@", 1) if "@" in dsn else ("", dsn)
        user, _, password = auth.partition(":")
        host_part, _, database = rest.partition("/")
        host, _, port = host_part.partition(":")
        return {
            "host": host or "localhost",
            "port": int(port) if port else 3306,
            "user": user or "root",
            "password": password or "",
            "database": database or "redmine",
        }

    async def _query(self, sql: str, *params) -> list[dict]:
        import aiomysql  # local import — cython cannot resolve module-level names
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, params)
                return await cur.fetchall()

    async def enumerate_tables(self) -> list[str]:
        rows = await self._query("SHOW TABLES")
        return [list(r.values())[0] for r in rows]

    async def read_project(self, project_identifier: str) -> RedmineProject:
        rows = await self._query(
            "SELECT * FROM projects WHERE identifier = %s", project_identifier
        )
        if not rows:
            # Try by id
            if project_identifier.isdigit():
                rows = await self._query(
                    "SELECT * FROM projects WHERE id = %s", int(project_identifier)
                )
        if not rows:
            raise ValueError(f"Project not found: {project_identifier}")
        r = rows[0]
        return RedmineProject(
            id=r["id"],
            name=r["name"],
            identifier=r["identifier"],
            description=r.get("description") or "",
            status=r.get("status", 1),
            is_public=bool(r.get("is_public", True)),
            parent_id=r.get("parent_id"),
            created_on=str(r.get("created_on", "")),
            updated_on=str(r.get("updated_on", "")),
        )

    async def read_users(self, project_id: int) -> list[RedmineUser]:
        # Get all users referenced in this project (members + issue participants)
        rows = await self._query("""
            SELECT DISTINCT u.* FROM users u
            LEFT JOIN members m ON u.id = m.user_id
            WHERE m.project_id = %s OR u.id IN (
                SELECT DISTINCT assigned_to_id FROM issues WHERE project_id = %s AND assigned_to_id IS NOT NULL
                UNION
                SELECT DISTINCT author_id FROM issues WHERE project_id = %s AND author_id IS NOT NULL
            )
            ORDER BY u.id
        """, project_id, project_id, project_id)
        users = []
        for r in rows:
            users.append(RedmineUser(
                id=r["id"],
                login=r.get("login", ""),
                firstname=r.get("firstname", ""),
                lastname=r.get("lastname", ""),
                mail=r.get("mail", ""),
                admin=bool(r.get("admin", False)),
                status=r.get("status", 1),
            ))
        return users

    async def read_issues(self, project_id: int) -> list[RedmineIssue]:
        rows = await self._query("""
            SELECT
                i.id, i.subject, i.description, i.author_id,
                i.assigned_to_id, i.parent_id, i.start_date, i.due_date,
                i.done_ratio, i.estimated_hours, i.created_on, i.updated_on,
                i.closed_on,
                t.name AS tracker_name,
                s.name AS status_name,
                p.name AS priority_name,
                c.name AS category_name,
                v.id AS fixed_version_id,
                v.name AS fixed_version_name
            FROM issues i
            LEFT JOIN trackers t ON i.tracker_id = t.id
            LEFT JOIN issue_statuses s ON i.status_id = s.id
            LEFT JOIN enumerations p ON i.priority_id = p.id
            LEFT JOIN issue_categories c ON i.category_id = c.id
            LEFT JOIN versions v ON i.fixed_version_id = v.id
            WHERE i.project_id = %s
            ORDER BY i.id
        """, project_id)
        issues = []
        for r in rows:
            # Fetch custom field values for this issue
            custom_fields = await self._read_custom_values("Issue", r["id"])
            issues.append(RedmineIssue(
                id=r["id"],
                project_id=project_id,
                tracker_name=r.get("tracker_name", "Bug"),
                subject=r["subject"],
                description=r.get("description") or "",
                status_name=r.get("status_name", "New"),
                priority_name=r.get("priority_name", "Normal"),
                author_id=r.get("author_id"),
                assigned_to_id=r.get("assigned_to_id"),
                category_name=r.get("category_name") or "",
                fixed_version_id=r.get("fixed_version_id"),
                fixed_version_name=r.get("fixed_version_name") or "",
                parent_id=r.get("parent_id"),
                start_date=str(r.get("start_date", "")),
                due_date=str(r.get("due_date", "")),
                done_ratio=r.get("done_ratio") or 0,
                estimated_hours=r.get("estimated_hours"),
                created_on=str(r.get("created_on", "")),
                updated_on=str(r.get("updated_on", "")),
                closed_on=str(r.get("closed_on", "")),
                custom_fields=custom_fields,
            ))
        return issues

    async def _read_custom_values(self, customized_type: str, customized_id: int) -> dict:
        rows = await self._query("""
            SELECT cf.name, cv.value
            FROM custom_values cv
            JOIN custom_fields cf ON cv.custom_field_id = cf.id
            WHERE cv.customized_type = %s AND cv.customized_id = %s
        """, customized_type, customized_id)
        return {r["name"]: r["value"] for r in rows}

    async def read_journals(self, issue_ids: list[int]) -> list[RedmineJournal]:
        if not issue_ids:
            return []
        # Build IN clause
        placeholders = ",".join(["%s"] * len(issue_ids))
        rows = await self._query(
            f"SELECT * FROM journals WHERE journalized_type = 'Issue' AND journalized_id IN ({placeholders}) ORDER BY id",
            *issue_ids,
        )
        journals = []
        for r in rows:
            # Fetch journal details
            details = await self._query(
                "SELECT property, prop_key, old_value, value FROM journal_details WHERE journal_id = %s ORDER BY id",
                r["id"],
            )
            details_list = [
                {"property": d["property"], "key": d["prop_key"],
                 "old_value": d.get("old_value") or "", "value": d.get("value") or ""}
                for d in details
            ]
            journals.append(RedmineJournal(
                id=r["id"],
                journalized_type=r["journalized_type"],
                journalized_id=r["journalized_id"],
                user_id=r.get("user_id"),
                notes=r.get("notes") or "",
                created_on=str(r.get("created_on", "")),
                details=details_list,
            ))
        return journals

    async def read_wiki_pages(self, project_id: int) -> list[RedmineWikiPage]:
        rows = await self._query("""
            SELECT wp.id, wp.title, wp.parent_id, wp.created_on,
                   wc.text, wc.author_id, wc.comments, wc.updated_on
            FROM wiki_pages wp
            JOIN wikis w ON wp.wiki_id = w.id AND w.project_id = %s
            LEFT JOIN wiki_contents wc ON wp.id = wc.page_id
            WHERE wc.id = (
                SELECT MAX(id) FROM wiki_contents WHERE page_id = wp.id
            )
            ORDER BY wp.title
        """, project_id)
        return [
            RedmineWikiPage(
                id=r["id"],
                title=r["title"],
                text=r.get("text") or "",
                author_id=r.get("author_id"),
                comments=r.get("comments") or "",
                created_on=str(r.get("created_on", "")),
                updated_on=str(r.get("updated_on", "")),
            )
            for r in rows
        ]

    async def read_versions(self, project_id: int) -> list[RedmineVersion]:
        rows = await self._query(
            "SELECT * FROM versions WHERE project_id = %s ORDER BY id",
            project_id,
        )
        return [
            RedmineVersion(
                id=r["id"],
                project_id=r["project_id"],
                name=r["name"],
                description=r.get("description") or "",
                effective_date=str(r.get("effective_date", "")),
                status=r.get("status", "open"),
                created_on=str(r.get("created_on", "")),
                updated_on=str(r.get("updated_on", "")),
            )
            for r in rows
        ]

    async def read_attachments(self, container_ids: list[int], container_type: str = "Issue") -> list[RedmineAttachment]:
        if not container_ids:
            return []
        placeholders = ",".join(["%s"] * len(container_ids))
        rows = await self._query(
            f"SELECT * FROM attachments WHERE container_type = %s AND container_id IN ({placeholders}) ORDER BY id",
            container_type, *container_ids,
        )
        return [
            RedmineAttachment(
                id=r["id"],
                container_type=r["container_type"],
                container_id=r["container_id"],
                filename=r["filename"],
                disk_filename=r.get("disk_filename", r["filename"]),
                filesize=r.get("filesize", 0),
                content_type=r.get("content_type", ""),
                author_id=r.get("author_id"),
                description=r.get("description") or "",
                created_on=str(r.get("created_on", "")),
            )
            for r in rows
        ]

    async def read_enumerations(self) -> dict[str, list[str]]:
        """Read tracker/status/priority enumerations."""
        result: dict[str, list[str]] = {}
        for etype in ("IssuePriority", "DocumentCategory", "TimeEntryActivity"):
            rows = await self._query(
                "SELECT name FROM enumerations WHERE type = %s ORDER BY position", etype
            )
            if rows:
                result[etype] = [r["name"] for r in rows]
        # Trackers
        rows = await self._query("SELECT name FROM trackers ORDER BY position")
        result["trackers"] = [r["name"] for r in rows]
        # Statuses
        rows = await self._query("SELECT name FROM issue_statuses ORDER BY position")
        result["statuses"] = [r["name"] for r in rows]
        return result


# ─── PostgreSQL Reader ────────────────────────────────────────────────────────


class PgRedmineReader:
    """Reads Redmine data from a PostgreSQL database."""

    def __init__(self, dsn: str):
        self.dsn = dsn  # postgresql://user:pass@host:port/database
        self.pool = None

    async def connect(self) -> None:
        import asyncpg
        self.pool = await asyncpg.create_pool(dsn=self.dsn, min_size=1, max_size=5)
        log.info("Connected to Redmine PostgreSQL")

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    async def _query(self, sql: str, *params) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
            return [dict(r) for r in rows]

    async def enumerate_tables(self) -> list[str]:
        rows = await self._query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
        )
        return [r["table_name"] for r in rows]

    async def read_project(self, project_identifier: str) -> RedmineProject:
        if project_identifier.isdigit():
            rows = await self._query(
                "SELECT * FROM projects WHERE id = $1", int(project_identifier)
            )
        else:
            rows = await self._query(
                "SELECT * FROM projects WHERE identifier = $1", project_identifier
            )
        if not rows:
            raise ValueError(f"Project not found: {project_identifier}")
        r = rows[0]
        return RedmineProject(
            id=r["id"], name=r["name"], identifier=r["identifier"],
            description=r.get("description") or "", status=r.get("status", 1),
            is_public=bool(r.get("is_public", True)), parent_id=r.get("parent_id"),
            created_on=str(r.get("created_on", "")),
            updated_on=str(r.get("updated_on", "")),
        )

    async def read_users(self, project_id: int) -> list[RedmineUser]:
        rows = await self._query("""
            SELECT DISTINCT u.* FROM users u
            LEFT JOIN members m ON u.id = m.user_id
            WHERE m.project_id = $1 OR u.id IN (
                SELECT DISTINCT assigned_to_id FROM issues WHERE project_id = $1 AND assigned_to_id IS NOT NULL
                UNION
                SELECT DISTINCT author_id FROM issues WHERE project_id = $1 AND author_id IS NOT NULL
            )
            ORDER BY u.id
        """, project_id)
        return [
            RedmineUser(
                id=r["id"], login=r.get("login", ""),
                firstname=r.get("firstname", ""), lastname=r.get("lastname", ""),
                mail=r.get("mail", ""), admin=bool(r.get("admin", False)),
                status=r.get("status", 1),
            ) for r in rows
        ]

    async def read_issues(self, project_id: int) -> list[RedmineIssue]:
        rows = await self._query("""
            SELECT
                i.id, i.subject, i.description, i.author_id,
                i.assigned_to_id, i.parent_id, i.start_date, i.due_date,
                i.done_ratio, i.estimated_hours, i.created_on, i.updated_on,
                i.closed_on,
                t.name AS tracker_name, s.name AS status_name,
                p.name AS priority_name, c.name AS category_name,
                v.id AS fixed_version_id, v.name AS fixed_version_name
            FROM issues i
            LEFT JOIN trackers t ON i.tracker_id = t.id
            LEFT JOIN issue_statuses s ON i.status_id = s.id
            LEFT JOIN enumerations p ON i.priority_id = p.id AND p.type = 'IssuePriority'
            LEFT JOIN issue_categories c ON i.category_id = c.id
            LEFT JOIN versions v ON i.fixed_version_id = v.id
            WHERE i.project_id = $1
            ORDER BY i.id
        """, project_id)
        issues = []
        for r in rows:
            custom_fields = await self._read_custom_values("Issue", r["id"])
            issues.append(RedmineIssue(
                id=r["id"], project_id=project_id,
                tracker_name=r.get("tracker_name", "Bug"),
                subject=r["subject"], description=r.get("description") or "",
                status_name=r.get("status_name", "New"),
                priority_name=r.get("priority_name", "Normal"),
                author_id=r.get("author_id"), assigned_to_id=r.get("assigned_to_id"),
                category_name=r.get("category_name") or "",
                fixed_version_id=r.get("fixed_version_id"),
                fixed_version_name=r.get("fixed_version_name") or "",
                parent_id=r.get("parent_id"),
                start_date=str(r.get("start_date", "")),
                due_date=str(r.get("due_date", "")),
                done_ratio=r.get("done_ratio") or 0,
                estimated_hours=r.get("estimated_hours"),
                created_on=str(r.get("created_on", "")),
                updated_on=str(r.get("updated_on", "")),
                closed_on=str(r.get("closed_on", "")),
                custom_fields=custom_fields,
            ))
        return issues

    async def _read_custom_values(self, customized_type: str, customized_id: int) -> dict:
        rows = await self._query("""
            SELECT cf.name, cv.value
            FROM custom_values cv
            JOIN custom_fields cf ON cv.custom_field_id = cf.id
            WHERE cv.customized_type = $1 AND cv.customized_id = $2
        """, customized_type, customized_id)
        return {r["name"]: r["value"] for r in rows}

    async def read_journals(self, issue_ids: list[int]) -> list[RedmineJournal]:
        if not issue_ids:
            return []
        rows = await self._query(
            "SELECT * FROM journals WHERE journalized_type = 'Issue' AND journalized_id = ANY($1) ORDER BY id",
            issue_ids,
        )
        journals = []
        for r in rows:
            details = await self._query(
                "SELECT property, prop_key, old_value, value FROM journal_details WHERE journal_id = $1 ORDER BY id",
                r["id"],
            )
            details_list = [
                {"property": d["property"], "key": d["prop_key"],
                 "old_value": d.get("old_value") or "", "value": d.get("value") or ""}
                for d in details
            ]
            journals.append(RedmineJournal(
                id=r["id"], journalized_type=r["journalized_type"],
                journalized_id=r["journalized_id"], user_id=r.get("user_id"),
                notes=r.get("notes") or "", created_on=str(r.get("created_on", "")),
                details=details_list,
            ))
        return journals

    async def read_wiki_pages(self, project_id: int) -> list[RedmineWikiPage]:
        rows = await self._query("""
            SELECT wp.id, wp.title, wp.created_on,
                   wc.text, wc.author_id, wc.comments, wc.updated_on
            FROM wiki_pages wp
            JOIN wikis w ON wp.wiki_id = w.id AND w.project_id = $1
            LEFT JOIN wiki_contents wc ON wp.id = wc.page_id
            WHERE wc.version = (
                SELECT MAX(version) FROM wiki_contents WHERE page_id = wp.id
            )
            ORDER BY wp.title
        """, project_id)
        return [
            RedmineWikiPage(
                id=r["id"], title=r["title"], text=r.get("text") or "",
                author_id=r.get("author_id"), comments=r.get("comments") or "",
                created_on=str(r.get("created_on", "")),
                updated_on=str(r.get("updated_on", "")),
            ) for r in rows
        ]

    async def read_versions(self, project_id: int) -> list[RedmineVersion]:
        rows = await self._query(
            "SELECT * FROM versions WHERE project_id = $1 ORDER BY id", project_id
        )
        return [
            RedmineVersion(
                id=r["id"], project_id=r["project_id"], name=r["name"],
                description=r.get("description") or "",
                effective_date=str(r.get("effective_date", "")),
                status=r.get("status", "open"),
                created_on=str(r.get("created_on", "")),
                updated_on=str(r.get("updated_on", "")),
            ) for r in rows
        ]

    async def read_attachments(self, container_ids: list[int], container_type: str = "Issue") -> list[RedmineAttachment]:
        if not container_ids:
            return []
        rows = await self._query(
            "SELECT * FROM attachments WHERE container_type = $1 AND container_id = ANY($2) ORDER BY id",
            container_type, container_ids,
        )
        return [
            RedmineAttachment(
                id=r["id"], container_type=r["container_type"],
                container_id=r["container_id"], filename=r["filename"],
                disk_filename=r.get("disk_filename", r["filename"]),
                filesize=r.get("filesize", 0), content_type=r.get("content_type", ""),
                author_id=r.get("author_id"), description=r.get("description") or "",
                created_on=str(r.get("created_on", "")),
            ) for r in rows
        ]

    async def read_enumerations(self) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {}
        rows = await self._query(
            "SELECT name FROM trackers ORDER BY position"
        )
        result["trackers"] = [r["name"] for r in rows]
        rows = await self._query(
            "SELECT name FROM issue_statuses ORDER BY position"
        )
        result["statuses"] = [r["name"] for r in rows]
        rows = await self._query(
            "SELECT name FROM enumerations WHERE type = 'IssuePriority' ORDER BY position"
        )
        result["priorities"] = [r["name"] for r in rows]
        return result


# ─── Unified reader factory ───────────────────────────────────────────────────


async def read_redmine(dsn: str, project_identifier: str) -> RedmineData:
    """Read complete project data from a Redmine database.

    Args:
        dsn: Database connection string (mysql://... or postgresql://...)
        project_identifier: Project identifier string or numeric id

    Returns:
        RedmineData with all project data loaded
    """
    if dsn.startswith("mysql://") or dsn.startswith("mysql:"):
        reader = MySqlRedmineReader(dsn)
    elif dsn.startswith("postgresql://") or dsn.startswith("postgres:"):
        reader = PgRedmineReader(dsn)
    else:
        raise ValueError(f"Unsupported database type in DSN: {dsn}")

    await reader.connect()
    try:
        project = await reader.read_project(project_identifier)
        log.info("Reading project: %s (id=%d)", project.name, project.id)

        # Read all data in parallel where possible
        users = await reader.read_users(project.id)
        log.info("  Users: %d", len(users))

        issues = await reader.read_issues(project.id)
        log.info("  Issues: %d", len(issues))

        # Journals are per-issue — batch fetch
        issue_ids = [i.id for i in issues]
        journals = await reader.read_journals(issue_ids)
        log.info("  Journals: %d", len(journals))

        wiki_pages = await reader.read_wiki_pages(project.id)
        log.info("  Wiki pages: %d", len(wiki_pages))

        versions = await reader.read_versions(project.id)
        log.info("  Versions: %d", len(versions))

        attachments = await reader.read_attachments(issue_ids, "Issue")
        log.info("  Attachments: %d", len(attachments))

        enums = await reader.read_enumerations()

        return RedmineData(
            project=project,
            issues=issues,
            journals=journals,
            wiki_pages=wiki_pages,
            versions=versions,
            users=users,
            attachments=attachments,
            trackers=enums.get("trackers", []),
            statuses=enums.get("statuses", []),
            priorities=enums.get("priorities", []),
        )
    finally:
        await reader.close()
