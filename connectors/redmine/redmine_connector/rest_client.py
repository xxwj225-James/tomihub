"""
Redmine REST API client — read projects/issues/journals/versions/wiki via the
Redmine REST API (JSON). Supports pagination and `updated_on` cursors for
incremental sync.

Redmine REST reference:
  GET /issues.json?project_id=X&updated_on=>=2026-08-01T00:00:00Z&limit=100&page=N
  GET /issues/{id}.json?include=journals
  GET /versions.json?project_id=X
  GET /projects/{id}/wiki/index.json
  GET /wiki/{title}.json
"""

from __future__ import annotations

import logging
import time
from typing import Any, AsyncIterator, Optional

import httpx

log = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 30.0
_PAGE_SIZE = 100


class RedmineRestClient:
    """Minimal Redmine REST API client with cursor-based incremental reads."""

    def __init__(self, base_url: str, api_key: str, timeout: float = _DEFAULT_TIMEOUT,
                 page_size: int = _PAGE_SIZE):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.page_size = page_size
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            headers = {"X-Redmine-API-Key": self.api_key, "Accept": "application/json"}
            if self.api_key.startswith("Bearer "):
                headers = {"Authorization": self.api_key, "Accept": "application/json"}
            self._client = httpx.AsyncClient(
                headers=headers, timeout=self.timeout,
                follow_redirects=True)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _get_json(self, path: str, params: dict | None = None) -> dict:
        client = await self._get_client()
        resp = await client.get(f"{self.base_url}{path}", params=params or {})
        if resp.status_code == 401:
            raise PermissionError(f"Redmine auth failed ({resp.status_code}) for {path}")
        if resp.status_code == 404:
            raise FileNotFoundError(f"Redmine resource not found: {path}")
        if resp.status_code >= 400:
            raise RuntimeError(f"Redmine API error {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    # ─── Projects ─────────────────────────────────────────────────────────

    async def list_projects(self) -> list[dict]:
        """All visible projects."""
        data = await self._get_json("/projects.json", {"limit": 100})
        return data.get("projects", [])

    # ─── Issues (with cursor) ─────────────────────────────────────────────

    async def iter_issues(self, project_id: int | None = None,
                          updated_since: str | None = None,
                          include_journals: bool = False) -> AsyncIterator[dict]:
        """Iterate issues with pagination. `updated_since` is an ISO datetime
        for incremental pulls (Redmine: updated_on=>=...)."""
        params: dict[str, Any] = {"limit": self.page_size}
        if project_id is not None:
            params["project_id"] = project_id
        if updated_since:
            params["updated_on"] = f">={updated_since}"
        if include_journals:
            params["include"] = "journals"

        page = 1
        while True:
            params["page"] = page
            data = await self._get_json("/issues.json", params)
            issues = data.get("issues", [])
            if not issues:
                break
            for issue in issues:
                yield issue
            total = data.get("total_count", 0)
            if page * self.page_size >= total or len(issues) < self.page_size:
                break
            page += 1
            time.sleep(0.1)  # be polite

    async def get_issue(self, issue_id: int, include_journals: bool = True,
                        include_children: bool = False) -> dict:
        inc = []
        if include_journals:
            inc.append("journals")
        if include_children:
            inc.append("children")
        params = {"include": ",".join(inc)} if inc else None
        data = await self._get_json(f"/issues/{issue_id}.json", params)
        return data.get("issue", {})

    # ─── Journals / comments ──────────────────────────────────────────────

    async def iter_journals(self, issue_id: int) -> list[dict]:
        """All journals for an issue (notes + property changes)."""
        issue = await self.get_issue(issue_id, include_journals=True)
        return issue.get("journals", [])

    # ─── Versions (→ sprints) ─────────────────────────────────────────────

    async def list_versions(self, project_id: int | None = None) -> list[dict]:
        # Redmine 7: versions are a project sub-resource — the global
        # /versions.json endpoint no longer exists
        if project_id is None:
            raise ValueError("list_versions requires a project_id on Redmine 7")
        path = f"/projects/{project_id}/versions.json"
        data = await self._get_json(path, {"limit": 100})
        return data.get("versions", [])

    # ─── Wiki ─────────────────────────────────────────────────────────────

    async def list_wiki_pages(self, project_id: int | None = None) -> list[dict]:
        params = {"limit": 100}
        path = "/wiki/index.json"
        if project_id is not None:
            path = f"/projects/{project_id}/wiki/index.json"
        data = await self._get_json(path, params)
        return data.get("wiki_pages", [])

    async def get_wiki_page(self, project_identifier: str, title: str) -> dict:
        from urllib.parse import quote
        path = f"/projects/{quote(project_identifier)}/wiki/{quote(title)}.json"
        data = await self._get_json(path)
        return data.get("wiki_page", {})

    # ─── Trackers / statuses / priorities (enumerations) ─────────────────

    async def list_trackers(self) -> list[dict]:
        data = await self._get_json("/trackers.json", {"limit": 100})
        return data.get("trackers", [])

    async def list_statuses(self) -> list[dict]:
        data = await self._get_json("/issue_statuses.json", {"limit": 100})
        return data.get("issue_statuses", [])

    async def list_priorities(self) -> list[dict]:
        data = await self._get_json("/enumerations/issue_priorities.json", {"limit": 100})
        return data.get("issue_priorities", [])
