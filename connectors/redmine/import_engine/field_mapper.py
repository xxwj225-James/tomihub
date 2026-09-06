"""
Field mapper — transforms Redmine data structures into TomiHub-compatible formats.

All mapping logic lives here so it can be:
1. Tested independently
2. Configured via YAML/JSON overrides
3. Extended for ZenTao and other sources
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Optional

from .redmine_reader import (
    RedmineData,
    RedmineIssue,
    RedmineJournal,
    RedmineWikiPage,
    RedmineVersion,
    RedmineUser,
    RedmineAttachment,
    RedmineProject,
)

log = logging.getLogger(__name__)

# ─── Deterministic UUID generation ────────────────────────────────────────────


def make_uuid(namespace: str, *parts) -> str:
    """Generate a deterministic UUID v5 so re-runs produce the same IDs.

    Uses SHA-1 of namespace + parts. Same input → same UUID every time.
    This makes the import idempotent — re-running won't create duplicates.
    """
    key = ":".join(str(p) for p in parts)
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{namespace}:{key}"))

# ─── Default mappings — can be overridden via config file ─────────────────────

# Tracker → issue type
DEFAULT_TRACKER_MAP = {
    "Bug": "bug",
    "bug": "bug",
    "Feature": "story",
    "feature": "story",
    "Support": "task",
    "support": "task",
    "Task": "task",
    "task": "task",
    "Enhancement": "story",
    "enhancement": "story",
    "Story": "story",
    "story": "story",
    "Epic": "story",
    "epic": "story",
    "Refactor": "task",
    "refactor": "task",
}

# Redmine status → TomiHub status
DEFAULT_STATUS_MAP = {
    "New": "open",
    "new": "open",
    "Open": "open",
    "open": "open",
    "In Progress": "in_progress",
    "in progress": "in_progress",
    "InProgress": "in_progress",
    "in_progress": "in_progress",
    "Resolved": "in_review",
    "resolved": "in_review",
    "Feedback": "in_review",
    "feedback": "in_review",
    "Closed": "done",
    "closed": "done",
    "Rejected": "cancelled",
    "rejected": "cancelled",
    "Blocked": "blocked",
    "blocked": "blocked",
    "On Hold": "blocked",
    "on hold": "blocked",
    "Done": "done",
    "done": "done",
    "Testing": "in_review",
    "testing": "in_review",
    "Code Review": "in_review",
    "code review": "in_review",
}

# Redmine priority → TomiHub priority
DEFAULT_PRIORITY_MAP = {
    "Low": "low",
    "low": "low",
    "Normal": "medium",
    "normal": "medium",
    "Medium": "medium",
    "medium": "medium",
    "High": "high",
    "high": "high",
    "Urgent": "critical",
    "urgent": "critical",
    "Immediate": "critical",
    "immediate": "critical",
}

# ─── Wiki category mapping ───────────────────────────────────────────────────

WIKI_CATEGORY_MAP = {
    "architecture": "architecture",
    "api": "api-documentation",
    "api-documentation": "api-documentation",
    "runbook": "runbook",
    "testing": "testing",
    "retrospective": "retrospective",
    "general": "general",
    "development": "general",
    "guide": "general",
    "howto": "general",
    "meeting": "retrospective",
    "design": "architecture",
    "deployment": "runbook",
    "operations": "runbook",
    "security": "architecture",
    "onboarding": "general",
    "decisions": "architecture",
}


# ─── Mapper class ─────────────────────────────────────────────────────────────


class FieldMapper:
    """Transforms Redmine data to TomiHub format, maintaining ID mappings."""

    def __init__(
        self,
        tenant_id: str,
        target_project_id: str,
        tracker_map: Optional[dict[str, str]] = None,
        status_map: Optional[dict[str, str]] = None,
        priority_map: Optional[dict[str, str]] = None,
        target_project_key: str = "",
    ):
        self.tenant_id = tenant_id
        self.target_project_id = target_project_id
        self.target_project_key = target_project_key

        self.tracker_map = {**DEFAULT_TRACKER_MAP, **(tracker_map or {})}
        self.status_map = {**DEFAULT_STATUS_MAP, **(status_map or {})}
        self.priority_map = {**DEFAULT_PRIORITY_MAP, **(priority_map or {})}

        # Old ID → New UUID mappings
        self.user_ids: dict[int, str] = {}
        self.issue_ids: dict[int, str] = {}
        self.version_ids: dict[int, str] = {}
        self.wiki_ids: dict[int, str] = {}

    def map_tracker(self, redmine_tracker: str) -> str:
        return self.tracker_map.get(redmine_tracker, "task")

    def map_status(self, redmine_status: str) -> str:
        return self.status_map.get(redmine_status, "open")

    def map_priority(self, redmine_priority: str) -> str:
        return self.priority_map.get(redmine_priority, "medium")

    def map_wiki_category(self, title: str, content: str) -> str:
        """Heuristic: detect wiki category from title + content keywords."""
        text = (title + " " + (content or "")[:200]).lower()
        for keyword, category in WIKI_CATEGORY_MAP.items():
            if keyword in text:
                return category
        return "general"

    # ─── User mapping ──────────────────────────────────────────────────────

    def map_user(self, user: RedmineUser) -> dict:
        """Map a Redmine user to a TomiHub user row.

        Returns None-ready fields — the importer will check if user exists
        by email and either link or create a placeholder.
        """
        new_id = make_uuid("redmine-user", self.tenant_id, user.id)
        self.user_ids[user.id] = new_id
        return {
            "id": new_id,
            "email": user.mail or f"redmine-user-{user.id}@placeholder.local",
            "display_name": f"{user.firstname} {user.lastname}".strip() or user.login,
            "password_hash": "",  # placeholder — cannot login
            "status": "active" if user.status == 1 else "inactive",
            "_redmine_id": user.id,
            "_redmine_login": user.login,
        }

    def map_project(self, project: RedmineProject) -> dict:
        """Map Redmine project metadata (does NOT create the project — returns updates)."""
        return {
            "name": project.name,
            "description": project.description,
            "settings": {
                "redmine_id": project.id,
                "redmine_identifier": project.identifier,
                "is_public": project.is_public,
            },
        }

    # ─── Issue mapping ─────────────────────────────────────────────────────

    def map_issues(self, issues: list[RedmineIssue]) -> list[dict]:
        """Map all issues, building the ID mapping first."""
        # First pass: generate IDs
        for i in issues:
            self.issue_ids[i.id] = make_uuid("redmine-issue", self.tenant_id, i.id)

        # Second pass: map with resolved IDs
        return [self._map_issue(i) for i in issues]

    def _map_issue(self, issue: RedmineIssue) -> dict:
        new_id = self.issue_ids[issue.id]
        return {
            "id": new_id,
            "tenant_id": self.tenant_id,
            "project_id": self.target_project_id,
            "workflow_id": self.target_project_id,  # will be resolved by importer
            "issue_number": 0,  # assigned after insert
            "title": issue.subject[:500],
            "description": issue.description or "",
            "type": self.map_tracker(issue.tracker_name),
            "status": self.map_status(issue.status_name),
            "priority": self.map_priority(issue.priority_name),
            "assignee_id": self.user_ids.get(issue.assigned_to_id) if issue.assigned_to_id else None,
            "reporter_id": self.user_ids.get(issue.author_id) if issue.author_id else None,
            "sprint_id": self.version_ids.get(issue.fixed_version_id) if issue.fixed_version_id else None,
            "parent_id": self.issue_ids.get(issue.parent_id) if issue.parent_id else None,
            "story_points": round(issue.estimated_hours, 1) if issue.estimated_hours else None,
            "due_date": issue.due_date[:10] if issue.due_date and issue.due_date != "None" else None,
            "started_at": _to_timestamptz(issue.start_date),
            "closed_at": _to_timestamptz(issue.closed_on),
            "labels": [issue.category_name] if issue.category_name else [],
            "custom_fields": {
                "done_ratio": issue.done_ratio,
                "redmine_id": issue.id,
                "redmine_tracker": issue.tracker_name,
                **(issue.custom_fields or {}),
            },
            "created_at": _to_timestamptz(issue.created_on),
            "updated_at": _to_timestamptz(issue.updated_on),
            "_redmine_id": issue.id,
        }

    # ─── Journal → Comments + Changelog ────────────────────────────────────

    def map_comments(self, journals: list[RedmineJournal]) -> list[dict]:
        """Extract comments from journal notes (non-empty notes)."""
        comments = []
        for j in journals:
            if j.notes and j.notes.strip():
                issue_id = self.issue_ids.get(j.journalized_id)
                if not issue_id:
                    continue
                comments.append({
                    "id": make_uuid("redmine-comment", self.tenant_id, j.id),
                    "issue_id": issue_id,
                    "author_id": self.user_ids.get(j.user_id) if j.user_id else None,
                    "body": j.notes.strip(),
                    "created_at": _to_timestamptz(j.created_on),
                })
        return comments

    def map_changelog(self, journals: list[RedmineJournal]) -> list[dict]:
        """Extract changelog entries from journal details."""
        entries = []
        for j in journals:
            issue_id = self.issue_ids.get(j.journalized_id)
            if not issue_id:
                continue
            for d in j.details:
                if d.get("property") != "attr":
                    continue
                field = d.get("key", "")
                # Map common Redmine field names to TomiHub
                field = _CHANGELOG_FIELD_MAP.get(field, field)
                entries.append({
                    "id": make_uuid("redmine-changelog", self.tenant_id, j.id, d.get("key", "")),
                    "tenant_id": self.tenant_id,
                    "issue_id": issue_id,
                    "changed_by": self.user_ids.get(j.user_id) if j.user_id else None,
                    "field": field,
                    "old_value": d.get("old_value", "") or "",
                    "new_value": d.get("value", "") or "",
                    "created_at": _to_timestamptz(j.created_on),
                })
        return entries

    # ─── Wiki mapping ──────────────────────────────────────────────────────

    def map_wiki_pages(self, pages: list[RedmineWikiPage]) -> list[dict]:
        results = []
        for p in pages:
            new_id = make_uuid("redmine-wiki", self.tenant_id, p.id)
            self.wiki_ids[p.id] = new_id
            # Replace issue references in content: #123 → {project_key}-123
            content = p.text or ""
            content = _replace_issue_refs(content, self.target_project_key)
            results.append({
                "id": new_id,
                "tenant_id": self.tenant_id,
                "project_id": self.target_project_id,
                "title": p.title[:255],
                "content": content,
                "category": self.map_wiki_category(p.title, content),
                "status": "published",
                "created_by": self.user_ids.get(p.author_id) if p.author_id else None,
                "created_at": _to_timestamptz(p.created_on),
                "updated_at": _to_timestamptz(p.updated_on),
                "_redmine_id": p.id,
            })
        return results

    # ─── Sprint/Version mapping ────────────────────────────────────────────

    def map_sprints(self, versions: list[RedmineVersion]) -> list[dict]:
        results = []
        for v in versions:
            new_id = make_uuid("redmine-version", self.tenant_id, v.id)
            self.version_ids[v.id] = new_id
            results.append({
                "id": new_id,
                "project_id": self.target_project_id,
                "name": v.name,
                "goal": v.description or "",
                "start_date": v.created_on[:10] if v.created_on else None,
                "end_date": v.effective_date[:10] if v.effective_date else None,
                "status": "completed" if v.status == "closed" else "active",
                "created_at": _to_timestamptz(v.created_on),
                "_redmine_id": v.id,
            })
        return results

    # ─── Attachment mapping ────────────────────────────────────────────────

    def map_attachments(self, attachments: list[RedmineAttachment]) -> list[dict]:
        results = []
        for a in attachments:
            if a.container_type == "Issue":
                container_id = self.issue_ids.get(a.container_id)
            elif a.container_type == "WikiPage":
                container_id = self.wiki_ids.get(a.container_id)
            else:
                container_id = str(a.container_id)

            if not container_id:
                continue

            results.append({
                "id": make_uuid("redmine-attachment", self.tenant_id, a.id),
                "tenant_id": self.tenant_id,
                "container_type": a.container_type,
                "container_id": container_id,
                "filename": a.filename,
                "file_size": a.filesize,
                "content_type": a.content_type,
                "uploaded_by": self.user_ids.get(a.author_id) if a.author_id else None,
                "created_at": _to_timestamptz(a.created_on),
                "_redmine_disk_filename": a.disk_filename,
                "_redmine_id": a.id,
            })
        return results


# ─── Helpers ──────────────────────────────────────────────────────────────────

_CHANGELOG_FIELD_MAP = {
    "status_id": "status",
    "priority_id": "priority",
    "assigned_to_id": "assignee",
    "fixed_version_id": "sprint",
    "tracker_id": "type",
    "category_id": "labels",
    "done_ratio": "custom_fields.done_ratio",
}


def _replace_issue_refs(text: str, project_key: str = "") -> str:
    """Replace Redmine issue references #123 with {project_key}-123 format."""
    import re
    key = (project_key or "?") + "-"
    return re.sub(r'#(\d+)', lambda m: key + m.group(1), text)


def _to_timestamptz(value: str) -> Optional[str]:
    """Normalize a date/time string to ISO 8601."""
    if not value or value in ("None", ""):
        return None
    # Replace space separator with T if needed
    v = str(value).strip()
    if " " in v and "T" not in v:
        v = v.replace(" ", "T")
    if "T" not in v and len(v) == 10:
        v = v + "T00:00:00"
    return v
