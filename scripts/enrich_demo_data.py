#!/usr/bin/env python3
"""
Enrich the Redmine demo project (testproj) with realistic data so the AI
analysis (health, risks, knowledge map) has enough signal to be interesting.

Creates via the Redmine REST API:
  * 4 extra users (carol/dave/erin/frank)
  * ~25 issues: mixed trackers/statuses/priorities — overdue tasks, open
    bugs, unassigned work, recently-closed ones (intake vs completion)
  * comments + status churn on several issues (complex-issue signal)
  * 2 more wiki pages with real content
  * project description update

Usage (inside ai-brain container):
  python /app/scripts/enrich_demo_data.py --url http://172.17.0.1:3000 --api-key <redmine admin key>
"""
from __future__ import annotations

import argparse
import random
import sys

import httpx

log = lambda m: print(m, flush=True)

TRACKERS = {
    "bug": 1, "feature": 2, "support": 3, "task": 4,
}  # Redmine default tracker ids — may differ; resolved at runtime

# ISSUES list uses short status names; map to Redmine's default names
STATUS_MAP = {
    "open": "new",
    "in_progress": "in progress",
    "resolved": "resolved",
    "done": "closed",
}

ISSUES = [
    # (subject, tracker, status, priority, assigned, days_due_offset, est_hours)
    ("[BUG] Login page 500 on empty password", "bug", "open", "high", "alice", None, 2.0),
    ("[BUG] API returns 500 when issue has no assignee", "bug", "open", "urgent", "carol", None, 3.0),
    ("[BUG] Gantt chart renders wrong on Firefox", "bug", "open", "normal", None, None, 1.0),
    ("[BUG] Email notification duplicated on status change", "bug", "resolved", "high", "bob", None, 4.0),
    ("[BUG] Search index misses Chinese keywords", "bug", "done", "normal", "dave", None, 2.0),
    ("[FEATURE] Two-factor authentication for admin accounts", "feature", "open", "high", "bob", 14, 8.0),
    ("[FEATURE] Export issues to Excel with history", "feature", "open", "normal", "carol", 21, 5.0),
    ("[FEATURE] Webhook for issue create/update events", "feature", "open", "normal", None, 30, 8.0),
    ("[FEATURE] Dark mode for the whole app", "feature", "open", "low", "erin", 60, 5.0),
    ("[FEATURE] Custom field for sprint capacity", "feature", "done", "normal", "alice", None, 3.0),
    ("[SUPPORT] Reset password flow broken for LDAP users", "support", "open", "high", "carol", -2, 2.0),
    ("[SUPPORT] Onboarding doc missing SAML section", "support", "open", "normal", None, -5, 1.0),
    ("[SUPPORT] Migration from Jira: attachments lost", "support", "resolved", "normal", "bob", None, 6.0),
    ("[SUPPORT] License activation fails behind proxy", "support", "open", "high", "dave", 1, 2.0),
    ("[TASK] Backfill 2025 release notes", "task", "open", "low", "erin", -7, 1.0),
    ("[TASK] Update README quickstart", "task", "done", "normal", "alice", None, 0.5),
    ("[TASK] Upgrade PostgreSQL to 16", "task", "open", "high", "bob", -1, 5.0),
    ("[TASK] Set up staging environment", "task", "in_progress", "normal", "dave", None, 4.0),
    ("[TASK] Audit dependency licenses", "task", "open", "normal", None, 7, 2.0),
    ("[TASK] Refactor issue import parser", "task", "in_progress", "normal", "carol", None, 8.0),
    ("[TASK] Load-testing before v1.2 release", "task", "open", "high", "bob", 3, 6.0),
    ("[TASK] Write disaster recovery runbook", "task", "open", "normal", "erin", 10, 2.0),
    ("[TASK] Clean up unused S3 buckets", "task", "done", "low", "dave", None, 1.0),
    ("[TASK] Quarterly security review", "task", "open", "high", "frank", 5, 3.0),
    ("[TASK] Localize UI to Japanese", "task", "open", "low", "erin", 45, 5.0),
]

WIKI_PAGES = [
    {
        "title": "Architecture-Overview",
        "text": """h1. Architecture Overview

TomiHub mirrors issue trackers over REST and runs AI analysis on the mirror.

* *Ingestion* — Redmine connector pulls issues/wiki/changelogs every 10 min
* *AI Brain* — Python service: health scoring, risk detection, knowledge maps
* *Core* — Java/Spring: multi-tenant business data, RBAC, license gating
* *Frontend* — React SPA

See [[Deployment-Guide]] for how the pieces are deployed.""",
    },
    {
        "title": "Deployment-Guide",
        "text": """h1. Deployment Guide

h2. Requirements

* Linux x86_64 host, 4 vCPU / 8 GB RAM
* Docker 24+ and docker compose v2
* A domain pointing at the host

h2. Steps

# Upload the image bundle, run @./install.sh@
# Copy the license file into the deploy directory
# @docker compose up -d@
# Open @http://localhost:8080@ and finish the setup wizard

h2. Troubleshooting

* Port 80 busy: edit @docker-compose.yml@ @ports:@ section
* License LOCKED: check @/var/log/tomiHub/tomiHub.lic@ exists""",
    },
]

COMMENT_PLANS = {
    # subject → list of notes to add
    "[BUG] Login page 500 on empty password": [
        "Reproduced on staging. Stack trace points at the password validator.",
        "Looks like the empty-string check runs after bcrypt hashing — hashing an empty byte array throws.",
        "Fix candidate: short-circuit empty input before hashing. Assigning to carol for a patch.",
        "Patch posted for review, adds a guard + regression test.",
    ],
    "[SUPPORT] Reset password flow broken for LDAP users": [
        "Customer reported via support ticket #221. LDAP users get a blank page after the reset link.",
        "The reset token isn't stored when the user authenticates via LDAP — the lookup path is skipped.",
        "Priority raised: this blocks an enterprise customer rollout.",
    ],
    "[FEATURE] Two-factor authentication for admin accounts": [
        "Scoped to TOTP only for v1. Backup codes can wait for v2.",
        "Design doc added to the wiki. Need a decision on SMS fallback.",
        "SMS fallback rejected — TOTP + backup codes is the approved scope.",
        "Backend token verification done; frontend enrollment UI in progress.",
    ],
    "[TASK] Refactor issue import parser": [
        "The Redmine import parser has grown too many special cases; splitting into per-field mappers.",
        "Halfway through: issue fields done, changelog mapper next.",
        "Found a data-loss bug in the old parser for custom fields — patch backported to v1.1.",
    ],
}

STATUS_CHURN = {
    # subject → list of (status_id, note)
    "[BUG] Login page 500 on empty password": [
        ("resolved", "Fixed in branch fix/empty-password; QA regression failed on staging — reopening."),
        ("open", "Reopened: the guard works but a null-password path through SSO still 500s."),
    ],
    "[SUPPORT] Reset password flow broken for LDAP users": [
        ("in_progress", "carol started investigating the LDAP auth path."),
    ],
    "[TASK] Refactor issue import parser": [
        ("in_progress", "Started: parser split into per-field mappers."),
    ],
}


class Enricher:
    def __init__(self, url: str, api_key: str):
        self.base = url.rstrip("/")
        self.h = {"X-Redmine-API-Key": api_key, "Content-Type": "application/json"}
        self.client = httpx.Client(headers=self.h, timeout=30.0)
        self.users: dict[str, int] = {}
        self.tracker_ids: dict[str, int] = {}
        self.status_ids: dict[str, int] = {}
        self.priority_ids: dict[str, int] = {}

    # ── helpers ──
    def get(self, path, params=None):
        r = self.client.get(f"{self.base}{path}", params=params or {})
        r.raise_for_status()
        return r.json()

    def post(self, path, body):
        r = self.client.post(f"{self.base}{path}", json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"POST {path} -> {r.status_code}: {r.text[:200]}")
        return r.json()

    def put(self, path, body):
        r = self.client.put(f"{self.base}{path}", json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"PUT {path} -> {r.status_code}: {r.text[:200]}")
        return r.json() if r.content else {}

    # ── setup ──
    def load_enums(self):
        for t in self.get("/trackers.json")["trackers"]:
            self.tracker_ids[t["name"].lower()] = t["id"]
        # Redmine REST API cannot create trackers (403) — if the Task
        # tracker is disabled in this instance, task-type issues use
        # the feature tracker instead.
        if "task" not in self.tracker_ids:
            self.tracker_ids["task"] = self.tracker_ids.get("feature")
            log(f"note: no Task tracker — task issues will use feature tracker")
        for s in self.get("/issue_statuses.json")["issue_statuses"]:
            self.status_ids[s["name"].lower()] = s["id"]
        for p in self.get("/enumerations/issue_priorities.json")["issue_priorities"]:
            self.priority_ids[p["name"].lower()] = p["id"]
        log(f"trackers={self.tracker_ids} statuses={self.status_ids} priorities={self.priority_ids}")

    def ensure_user(self, login, first, last):
        try:
            u = self.post("/users.json", {
                "user": {"login": login, "firstname": first, "lastname": last,
                         "mail": f"{login}@example.com", "password": "demo1234",
                         "admin": False}
            })["user"]
            log(f"user created: {login} ({u['id']})")
        except RuntimeError as e:
            if "has already been taken" in str(e) or "422" in str(e):
                existing = self.get("/users.json", {"name": login})
                u = existing["users"][0]
                log(f"user exists: {login} ({u['id']})")
            else:
                raise
        self.users[login] = u["id"]
        return u["id"]

    def ensure_users(self):
        for login, first, last in [("alice", "Alice", "Zhang"), ("bob", "Bob", "Li"),
                                   ("carol", "Carol", "Wang"), ("dave", "Dave", "Chen"),
                                   ("erin", "Erin", "Liu"), ("frank", "Frank", "Zhao")]:
            try:
                self.ensure_user(login, first, last)
            except RuntimeError as e:
                log(f"skip user {login}: {e}")

    def ensure_membership(self, uid):
        try:
            self.post(f"/projects/testproj/memberships.json", {
                "membership": {"user_id": uid, "role_ids": [3]}})
        except RuntimeError as e:
            if "already" not in str(e).lower():
                log(f"membership {uid}: {e}")

    # ── data ──
    def create_issues(self):
        from datetime import datetime, timedelta
        for subject, tracker, status, priority, assignee, due_offset, est in ISSUES:
            redmine_status = STATUS_MAP.get(status, status)
            body = {"issue": {
                "project_id": "testproj",
                "subject": subject,
                "tracker_id": self.tracker_ids[tracker],
                "status_id": self.status_ids[redmine_status],
                "priority_id": self.priority_ids[priority],
                "estimated_hours": est,
            }}
            if assignee:
                body["issue"]["assigned_to_id"] = self.users.get(assignee)
            if due_offset is not None:
                due = datetime.now() + timedelta(days=due_offset)
                body["issue"]["due_date"] = due.strftime("%Y-%m-%d")
            try:
                issue = self.post("/issues.json", body)["issue"]
                log(f"issue #{issue['id']}: {subject}")
                if subject in COMMENT_PLANS:
                    for note in COMMENT_PLANS[subject]:
                        self.put(f"/issues/{issue['id']}.json", {"issue": {"notes": note}})
                        log(f"  + comment on #{issue['id']}")
                if subject in STATUS_CHURN:
                    for sid, note in STATUS_CHURN[subject]:
                        self.put(f"/issues/{issue['id']}.json",
                                 {"issue": {"status_id": self.status_ids[STATUS_MAP.get(sid, sid)], "notes": note}})
                        log(f"  ~ status change on #{issue['id']}")
            except RuntimeError as e:
                log(f"FAIL {subject}: {e}")

    def create_wiki(self):
        for page in WIKI_PAGES:
            try:
                self.put(f"/projects/testproj/wiki/{page['title']}.json",
                         {"wiki_page": {"text": page["text"], "comments": "added by enrich script"}})
                log(f"wiki: {page['title']}")
            except RuntimeError as e:
                log(f"FAIL wiki {page['title']}: {e}")

    def update_project(self):
        self.put("/projects/testproj.json", {"project": {
            "description": "testproj — the demo project for the TomiHub × Redmine integration. "
                           "Mirrors a realistic team: 6 members, an active release cycle, "
                           "known bugs and an overdue support backlog. Used to validate AI "
                           "health scoring, risk alerts and knowledge maps."}})
        log("project description updated")

    def run(self):
        self.load_enums()
        self.ensure_users()
        for uid in self.users.values():
            self.ensure_membership(uid)
        self.update_project()
        self.create_issues()
        self.create_wiki()
        log("DONE — trigger a sync in TomiHub to mirror the new data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://172.17.0.1:3000")
    ap.add_argument("--api-key", required=True)
    args = ap.parse_args()
    Enricher(args.url, args.api_key).run()


if __name__ == "__main__":
    sys.exit(main())
