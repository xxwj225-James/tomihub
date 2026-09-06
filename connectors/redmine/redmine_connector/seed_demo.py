"""
Redmine experiment seed — creates demo data via the Redmine REST API.

Creates (idempotent-ish, --force to reset):
  * project `testproj` (+ description)
  * users alice / bob (admin required)
  * 2 versions (v1.0 open, v1.1 closed)
  * 6 issues across trackers/statuses/priorities, some assigned, some with
    comments, one status change (generates a journal/changelog)
  * 2 wiki pages

Usage:
    python -m redmine_connector.seed_demo --url http://localhost:3000 --api-key KEY
    python -m redmine_connector.seed_demo --url ... --api-key KEY --force   # delete+recreate
    # or via env: AIPM_REDMINE_URL / AIPM_REDMINE_API_KEY
"""

from __future__ import annotations

import argparse
import logging
import sys

import httpx

log = logging.getLogger("redmine.seed")

PROJECT_IDENTIFIER = "testproj"
PROJECT_NAME = "Redmine Experiment Project"


class RedmineSeeder:
    def __init__(self, url: str, api_key: str):
        self.base = url.rstrip("/")
        self.headers = {"X-Redmine-API-Key": api_key, "Accept": "application/json"}
        self.client = httpx.Client(headers=self.headers, timeout=30.0)

    def _get(self, path: str, params: dict | None = None) -> dict:
        r = self.client.get(f"{self.base}{path}", params=params or {})
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, body: dict) -> dict:
        r = self.client.post(f"{self.base}{path}", json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"POST {path} -> {r.status_code}: {r.text[:300]}")
        return r.json()

    def _put(self, path: str, body: dict) -> dict:
        r = self.client.put(f"{self.base}{path}", json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"PUT {path} -> {r.status_code}: {r.text[:300]}")
        # Redmine returns 204 No Content for successful PUTs
        if not r.content:
            return {}
        return r.json()

    def _delete(self, path: str) -> None:
        r = self.client.delete(f"{self.base}{path}")
        if r.status_code >= 400:
            raise RuntimeError(f"DELETE {path} -> {r.status_code}: {r.text[:300]}")

    # ─── lookups ──────────────────────────────────────────────────────────

    def find_project(self) -> dict | None:
        data = self._get("/projects.json", {"limit": 100})
        for p in data.get("projects", []):
            if p.get("identifier") == PROJECT_IDENTIFIER:
                return p
        return None

    def trackers(self) -> dict[str, int]:
        return {t["name"].lower(): t["id"] for t in self._get("/trackers.json").get("trackers", [])}

    def statuses(self) -> dict[str, int]:
        return {s["name"].lower(): s["id"] for s in self._get("/issue_statuses.json").get("issue_statuses", [])}

    def priorities(self) -> dict[str, int]:
        return {p["name"].lower(): p["id"] for p in
                self._get("/enumerations/issue_priorities.json").get("issue_priorities", [])}

    def find_user(self, login: str) -> int | None:
        data = self._get("/users.json", {"limit": 100})
        for u in data.get("users", []):
            if u.get("login") == login:
                return u["id"]
        return None

    # ─── creators ─────────────────────────────────────────────────────────

    def create_project(self) -> dict:
        body = {"project": {
            "name": PROJECT_NAME,
            "identifier": PROJECT_IDENTIFIER,
            "description": "Auto-seeded by redmine_connector.seed_demo for R1 experiment",
            "is_public": True,
        }}
        return self._post("/projects.json", body).get("project")

    def create_user(self, login: str, first: str, last: str, mail: str) -> int:
        existing = self.find_user(login)
        if existing:
            return existing
        body = {"user": {
            "login": login, "firstname": first, "lastname": last,
            "mail": mail, "password": "tomihub-test-2026",
        }}
        return self._post("/users.json", body).get("user", {}).get("id")

    def create_version(self, project_id: int, name: str, status: str, due: str | None) -> int:
        body = {"version": {"name": name,
                            "status": status, "due_date": due}}
        # Redmine REST: versions are a project sub-resource
        return self._post(f"/projects/{project_id}/versions.json", body).get("version", {}).get("id")

    def create_issue(self, project_id: int, subject: str, tracker_id: int,
                     status_id: int, priority_id: int, description: str = "",
                     assigned_to: int | None = None, fixed_version: int | None = None,
                     estimated_hours: float | None = None,
                     start_date: str | None = None, due_date: str | None = None,
                     parent_id: int | None = None) -> int:
        issue = {
            "project_id": project_id, "subject": subject,
            "tracker_id": tracker_id, "status_id": status_id, "priority_id": priority_id,
            "description": description,
        }
        if assigned_to:
            issue["assigned_to_id"] = assigned_to
        if fixed_version:
            issue["fixed_version_id"] = fixed_version
        if estimated_hours is not None:
            issue["estimated_hours"] = estimated_hours
        if start_date:
            issue["start_date"] = start_date
        if due_date:
            issue["due_date"] = due_date
        if parent_id:
            issue["parent_issue_id"] = parent_id
        return self._post("/issues.json", {"issue": issue}).get("issue", {}).get("id")

    def update_issue(self, issue_id: int, **fields) -> None:
        self._put(f"/issues/{issue_id}.json", {"issue": fields})

    def create_wiki(self, project_identifier: str, title: str, text: str) -> None:
        # Redmine 7 requires the wiki_page wrapper for wiki writes
        self._put(f"/projects/{project_identifier}/wiki/{title}.json",
                  {"wiki_page": {"text": text}})

    # ─── seed ─────────────────────────────────────────────────────────────

    def seed(self, force: bool = False) -> dict:
        if force:
            p = self.find_project()
            if p:
                log.info("Deleting existing project %s (id=%s) --force", PROJECT_IDENTIFIER, p["id"])
                self._delete(f"/projects/{p['id']}.json")

        project = self.find_project()
        if project:
            raise RuntimeError(
                f"Project '{PROJECT_IDENTIFIER}' already exists (id={project['id']}). "
                "Re-run with --force to reset, or reuse it.")

        tr = self.trackers(); st = self.statuses(); pr = self.priorities()
        log.info("Trackers: %s | Statuses: %s | Priorities: %s",
                 tr, list(st.keys()), list(pr.keys()))
        bug = tr.get("bug") or min(tr.values())
        feature = tr.get("feature") or max(tr.values())
        task = tr.get("task") or min(tr.values())
        new_s = st.get("new") or min(st.values())
        progress = st.get("in progress") or st.get("in_progress") or new_s
        closed = st.get("closed") or max(st.values())
        resolved = st.get("resolved") or closed
        high = pr.get("high") or max(pr.values())
        normal = pr.get("normal") or min(pr.values())
        urgent = pr.get("urgent") or max(pr.values())
        low = pr.get("low") or min(pr.values())

        project = self.create_project()
        pid = project["id"]
        log.info("Created project %s (id=%s)", PROJECT_IDENTIFIER, pid)

        alice = self.create_user("alice", "Alice", "Tester", "alice@redmine.test")
        bob = self.create_user("bob", "Bob", "Dev", "bob@redmine.test")
        log.info("Users: alice=%s bob=%s", alice, bob)

        # Assignees must be project members — add alice (Developer, role 4)
        # and bob (Manager, role 3) before creating issues
        for uid, role_ids in ((alice, [4]), (bob, [3])):
            self._post(f"/projects/{pid}/memberships.json",
                       {"membership": {"user_id": uid, "role_ids": role_ids}})
        log.info("Memberships: alice(dev) bob(manager) added to project %s", pid)

        v10 = self.create_version(pid, "v1.0", "open", "2026-09-15")
        # open status required: Redmine only allows open versions as target
        v11 = self.create_version(pid, "v1.1", "open", "2026-08-30")
        log.info("Versions: v1.0=%s v1.1=%s", v10, v11)

        # Issue 1: parent bug, high, new
        i1 = self.create_issue(pid, "[BUG] Login page 500 on empty password",
                               bug, new_s, high, "Repro: submit login with empty password field.",
                               alice, v10, 8.0, "2026-08-20", "2026-09-01")
        # Issue 2: child of 1, urgent, in progress, assigned bob
        i2 = self.create_issue(pid, "[BUG] Empty-password flash message missing",
                               bug, progress, urgent, "After 500, user sees no message.",
                               bob, v10, 3.0, "2026-08-21", "2026-08-28", parent_id=i1)
        # Issue 3: feature, normal, new, alice
        i3 = self.create_issue(pid, "[FEATURE] Dark mode for reports",
                               feature, new_s, normal, "Theme toggle on Report page.",
                               alice, v10, 16.0, "2026-08-22", "2026-09-10")
        # Issue 4: task, low, new, unassigned
        i4 = self.create_issue(pid, "[TASK] Update README quickstart",
                               task, new_s, low, "Document local dev setup.",
                               None, None, 2.0, "2026-08-23", "2026-09-05")
        # Issue 5: closed support ticket (closed issues cannot carry a target version)
        i5 = self.create_issue(pid, "[SUPPORT] Reset password flow broken",
                               tr.get("support", bug), closed, normal,
                               "User could not reset password; already fixed.",
                               bob, None, 1.5, "2026-08-18", "2026-08-25")
        # Issue 6: task in progress, alice, v1.1 (for incremental test)
        i6 = self.create_issue(pid, "[TASK] Backfill 2025 release notes",
                               task, progress, normal, "Add missing release notes.",
                               alice, v11, 4.0, "2026-08-24", "2026-09-02")

        # Status change on i2 → journal + changelog
        self.update_issue(i2, status_id=closed, notes="Fixed in 8c4f2a1; closing.")
        # Comments on i1
        self.update_issue(i1, notes="Confirmed on staging; assigning to Bob.")
        self.update_issue(i1, notes="Root cause found: missing null check in AuthController.")
        # Comment + reopen on i3
        self.update_issue(i3, notes="Estimate updated to 16h after spike.")

        self.create_wiki(PROJECT_IDENTIFIER, "Getting-Started",
                         "h1. Getting Started\n\n* Clone repo\n* Run `docker compose up`\n* Open http://localhost:3000")
        self.create_wiki(PROJECT_IDENTIFIER, "API-Reference",
                         "h1. API Reference\n\nEndpoints are documented under /api/v1.\n\nSee [[Getting-Started]].")

        log.info("Seeded issues: i1=%s i2=%s i3=%s i4=%s i5=%s i6=%s", i1, i2, i3, i4, i5, i6)
        return {"project_id": pid, "project_identifier": PROJECT_IDENTIFIER,
                "users": {"alice": alice, "bob": bob},
                "versions": {"v1.0": v10, "v1.1": v11},
                "issues": [i1, i2, i3, i4, i5, i6]}


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed Redmine demo data for R1 experiment")
    parser.add_argument("--url", default=None, help="Redmine base URL (env AIPM_REDMINE_URL)")
    parser.add_argument("--api-key", default=None, help="Redmine API key (env AIPM_REDMINE_API_KEY)")
    parser.add_argument("--force", action="store_true", help="delete project first if it exists")
    args = parser.parse_args()

    import os
    url = args.url or os.getenv("AIPM_REDMINE_URL", "http://localhost:3000")
    api_key = args.api_key or os.getenv("AIPM_REDMINE_API_KEY", "")
    if not api_key:
        parser.error("--api-key required (or set AIPM_REDMINE_API_KEY)")
        return 2

    seeder = RedmineSeeder(url, api_key)
    try:
        result = seeder.seed(force=args.force)
    except RuntimeError as e:
        log.error("%s", e)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
