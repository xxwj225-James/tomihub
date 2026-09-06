"""
Sync state persistence — cursor/status for each Redmine→TomiHub sync.

Stored in the TomiHub DB (table `redmine_sync_state`) so multiple workers
and restarts share the same cursors.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import asyncpg

log = logging.getLogger(__name__)

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS redmine_sync_state (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    redmine_url VARCHAR(255) NOT NULL,
    project_key VARCHAR(100) NOT NULL,
    last_issue_updated VARCHAR(40),
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE(tenant_id, redmine_url, project_key)
)
"""


async def ensure_table(dsn: str) -> None:
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(_TABLE_SQL)
    finally:
        await conn.close()


class SyncState:
    def __init__(self, dsn: str, tenant_id: str, redmine_url: str, project_key: str):
        self.dsn = dsn
        self.tenant_id = tenant_id
        self.redmine_url = redmine_url
        self.project_key = project_key

    async def load(self) -> dict:
        conn = await asyncpg.connect(self.dsn)
        try:
            row = await conn.fetchrow(
                """SELECT last_issue_updated, last_sync_at, last_error
                   FROM redmine_sync_state
                   WHERE tenant_id=$1 AND redmine_url=$2 AND project_key=$3""",
                self.tenant_id, self.redmine_url, self.project_key)
            if not row:
                return {"last_issue_updated": None, "last_sync_at": None, "last_error": None}
            return {
                "last_issue_updated": row["last_issue_updated"],
                "last_sync_at": row["last_sync_at"].isoformat() if row["last_sync_at"] else None,
                "last_error": row["last_error"],
            }
        finally:
            await conn.close()

    async def save(self, last_issue_updated: str | None, error: str | None = None) -> None:
        conn = await asyncpg.connect(self.dsn)
        try:
            await conn.execute(
                """INSERT INTO redmine_sync_state
                       (id, tenant_id, redmine_url, project_key, last_issue_updated, last_sync_at, last_error)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   ON CONFLICT (tenant_id, redmine_url, project_key)
                   DO UPDATE SET last_issue_updated = EXCLUDED.last_issue_updated,
                                 last_sync_at = EXCLUDED.last_sync_at,
                                 last_error = EXCLUDED.last_error""",
                str(uuid.uuid4()), self.tenant_id, self.redmine_url, self.project_key,
                last_issue_updated, datetime.now(timezone.utc), error)
        finally:
            await conn.close()
