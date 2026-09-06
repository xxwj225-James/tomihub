"""
Redmine REST → TomiHub model mapping (pure functions, unit-testable).

Takes Redmine REST JSON structures (from rest_client) and produces dicts ready
for TomiHub tables (projects/issues/comments/changelog/sprints/knowledge_pages).
Enum mapping (tracker/status/priority) reuses import_engine.field_mapper's
DEFAULT_*_MAP — the connector path just feeds it REST-shaped input.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from import_engine.field_mapper import (
    DEFAULT_TRACKER_MAP,
    DEFAULT_STATUS_MAP,
    DEFAULT_PRIORITY_MAP,
    make_uuid,
)

log = logging.getLogger(__name__)


# ─── Enumerations ────────────────────────────────────────────────────────────

def map_type(tracker_name: str | None) -> str:
    return DEFAULT_TRACKER_MAP.get(str(tracker_name or ""), "task")


def map_status(status_name: str | None) -> str:
    return DEFAULT_STATUS_MAP.get(str(status_name or ""), "open")


def map_priority(priority_name: str | None) -> str:
    return DEFAULT_PRIORITY_MAP.get(str(priority_name or ""), "medium")


# ─── Project ────────────────────────────────────────────────────────────────

def to_project(redmine_project: dict, tenant_id: str) -> dict:
    """Redmine project JSON → TomiHub projects row."""
    identifier = str(redmine_project.get("identifier", "") or redmine_project.get("id", ""))
    return {
        "id": make_uuid("redmine-project", identifier),
        "tenant_id": tenant_id,
        "key": identifier.upper()[:10],  # projects.key is VARCHAR(10)
        "name": redmine_project.get("name", identifier),
        "description": redmine_project.get("description", "") or "",
        "visibility": "public" if redmine_project.get("is_public", True) else "private",
        "status": "active",
        "phase": "development",
        "settings": {"redmine_project_id": redmine_project.get("id")},
    }


# ─── Issue ──────────────────────────────────────────────────────────────────

def to_issue(redmine_issue: dict, project_id: str, tenant_id: str,
             user_map: dict[int, str]) -> dict:
    """Redmine issue JSON → TomiHub issues row. user_map: redmine_user_id → tomihub uuid."""
    # Tracker / status / priority names come in the REST payload as nested objects
    tracker = (redmine_issue.get("tracker") or {}).get("name", "")
    status = (redmine_issue.get("status") or {}).get("name", "")
    priority = (redmine_issue.get("priority") or {}).get("name", "")

    assigned_id = redmine_issue.get("assigned_to") or {}
    author_id = redmine_issue.get("author") or {}
    version = redmine_issue.get("fixed_version") or {}

    custom_map = {str(c.get("name", "")): c.get("value") for c in redmine_issue.get("custom_fields", [])}

    return {
        "id": make_uuid("redmine-issue", redmine_issue.get("id")),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "issue_number": int(redmine_issue.get("id") or 0),
        "title": redmine_issue.get("subject", "")[:500],
        "description": redmine_issue.get("description", "") or "",
        "type": map_type(tracker),
        "status": map_status(status),
        "priority": map_priority(priority),
        "assignee_id": user_map.get(int(assigned_id.get("id", 0)) or 0),
        "reporter_id": user_map.get(int(author_id.get("id", 0)) or 0),
        "sprint_id": None,  # resolved by version→sprint mapping in sync.py
        "parent_id": None,  # resolved in second pass (parent may come later)
        "due_date": _to_date(redmine_issue.get("due_date")),
        "started_at": _to_dt(_to_ts(redmine_issue.get("start_date"))),
        "story_points": _hours_to_points(redmine_issue.get("estimated_hours")),
        "labels": [],
        "custom_fields": {
            **custom_map,
            "redmine_id": redmine_issue.get("id"),
            "redmine_updated_on": redmine_issue.get("updated_on"),
        },
        "created_at": _to_dt(redmine_issue.get("created_on")),
        "updated_at": _to_dt(redmine_issue.get("updated_on")),
    }


def _to_ts(value: str | None) -> str | None:
    """Redmine dates are 'YYYY-MM-DD'; issues.started_at is TIMESTAMPTZ."""
    if not value:
        return None
    if "T" in value or value.endswith("Z"):
        return value
    return f"{value[:10]}T00:00:00Z"


def _to_date(value: str | None):
    """'YYYY-MM-DD' → datetime.date (asyncpg requires date objects for DATE columns)."""
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _to_dt(value: str | None):
    """ISO datetime string → timezone-aware datetime (asyncpg TIMESTAMPTZ
    columns reject plain strings)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _hours_to_points(hours) -> float | None:
    """Estimated hours → story points (configurable later; 1h ≈ 0.1 pt)."""
    if hours is None:
        return None
    try:
        return round(float(hours) * 0.1, 1)
    except (TypeError, ValueError):
        return None


# ─── User ───────────────────────────────────────────────────────────────────

def to_user(redmine_user: dict, tenant_id: str) -> dict:
    """Redmine user JSON → TomiHub users row (minimal; link by email later).

    NOTE: `users` has no tenant_id / custom_fields columns (001_initial_schema.sql),
    so the mapping redmine_user_id → uuid is carried by the deterministic id
    (make_uuid) and by email lookup in sync._upsert_user.
    """
    uid = redmine_user.get("id")
    email = redmine_user.get("mail", "") or f"redmine-{uid}@sync.local"
    first = redmine_user.get("firstname", "")
    last = redmine_user.get("lastname", "")
    name = (f"{first} {last}").strip() or redmine_user.get("name", "") or f"Redmine User {uid}"
    return {
        "id": make_uuid("redmine-user", uid),
        "email": email,
        "password_hash": "!redmine-sync",  # cannot log in — sync-only account
        "display_name": name[:100],
        "email_verified": True,
    }


# ─── Journal → comment + changelog ─────────────────────────────────────────

def to_comment(journal: dict, issue_id: str, tenant_id: str,
               user_map: dict[int, str]) -> dict | None:
    """Redmine journal → TomiHub comment. Returns None if no notes (pure change).

    comments has NO tenant_id column (001_initial_schema.sql); author_name was
    added by migration 050.
    """
    notes = (journal.get("notes") or "").strip()
    if not notes:
        return None
    author = journal.get("user") or {}
    return {
        "id": make_uuid("redmine-comment", journal.get("id")),
        "issue_id": issue_id,
        "author_id": user_map.get(int(author.get("id", 0)) or 0),
        "author_name": author.get("name", ""),
        "body": notes,
        "created_at": _to_dt(journal.get("created_on")),
    }


def to_changelog(journal: dict, issue_id: str, tenant_id: str,
                 user_map: dict[int, str]) -> list[dict]:
    """Redmine journal property changes → TomiHub issue_changelog rows."""
    entries = []
    author = journal.get("user") or {}
    user_id = user_map.get(int(author.get("id", 0)) or 0)
    for change in journal.get("details", []):
        prop = change.get("property", "")
        name = change.get("name", "")
        old = change.get("old_value")
        new = change.get("new_value")

        # Only status / priority / assignee matter to the health framework
        field = None
        if prop == "attr" and name == "status_id":
            field = "status"
        elif prop == "attr" and name == "priority_id":
            field = "priority"
        elif prop == "attr" and name == "assigned_to_id":
            field = "assignee_id"
        elif prop == "attr" and name == "done_ratio":
            field = "done_ratio"
        if field is None:
            continue

        entries.append({
            "id": make_uuid("redmine-clog", journal.get("id"), name, str(old), str(new)),
            "tenant_id": tenant_id,
            "issue_id": issue_id,
            "changed_by": user_id,
            "field": field,
            "old_value": str(old) if old is not None else None,
            "new_value": str(new) if new is not None else None,
            "created_at": _to_dt(journal.get("created_on")),
        })
    return entries


# ─── Version → sprint ───────────────────────────────────────────────────────

def to_sprint(version: dict, project_id: str, tenant_id: str) -> dict:
    """Redmine version JSON → TomiHub sprints row.

    sprints has NO tenant_id column (001_initial_schema.sql); start_date and
    end_date are NOT NULL — fall back to created_on / effective_date, and
    finally to today, so the insert never fails on missing Redmine dates.
    Status: Redmine open/locked → 'planning' (sprints default), closed → 'closed'.
    """
    created = str(version.get("created_on") or "")[:10] or None
    start_date = version.get("start_date") or created
    end_date = version.get("effective_date") or version.get("due_date") or start_date or created
    if not start_date or not end_date:
        today = datetime.now(timezone.utc).date().isoformat()
        start_date = start_date or today
        end_date = end_date or today
    rstatus = str(version.get("status") or "").lower()
    return {
        "id": make_uuid("redmine-version", version.get("id")),
        "project_id": project_id,
        "name": (version.get("name", "") or "")[:255],
        "goal": version.get("description", "") or None,
        "status": "closed" if rstatus == "closed" else "planning",
        "start_date": _to_date(start_date),
        "end_date": _to_date(end_date),
    }


# ─── Wiki page → knowledge_pages ───────────────────────────────────────────

def to_wiki_page(page: dict, project_id: str, tenant_id: str) -> dict:
    return {
        "id": make_uuid("redmine-wiki", page.get("title")),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "title": page.get("title", ""),
        "content": page.get("text", "") or "",
        "status": "published",
        "created_at": _to_dt(page.get("created_on")),
        "updated_at": _to_dt(page.get("updated_on")),
    }
