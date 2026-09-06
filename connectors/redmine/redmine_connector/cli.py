"""
Redmine connector CLI — run a sync manually (for testing / ops).

Usage:
    python -m redmine_connector.cli --full
    python -m redmine_connector.cli --incremental
    python -m redmine_connector.cli --full --project myproj

Env: AIPM_REDMINE_URL / AIPM_REDMINE_API_KEY / AIPM_REDMINE_PROJECT_KEYS /
     AIPM_REDMINE_TENANT_ID (fallback AIPM_FALLBACK_TENANT_ID)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("redmine.cli")


def _env(name: str) -> str:
    return os.getenv(f"AIPM_{name}", "").strip()


async def _run(full: bool, project_filter: str | None) -> dict:
    from redmine_connector.sync import RedmineSync

    # Standalone connector — config via env only (no ai-brain settings module).
    url = _env("REDMINE_URL")
    api_key = _env("REDMINE_API_KEY")
    keys_raw = _env("REDMINE_PROJECT_KEYS")
    tenant_id = _env("REDMINE_TENANT_ID") or _env("FALLBACK_TENANT_ID")
    dsn = _env("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/ai_pm"

    if not (url and api_key and keys_raw):
        log.error("Missing AIPM_REDMINE_URL / AIPM_REDMINE_API_KEY / AIPM_REDMINE_PROJECT_KEYS")
        return {"error": "missing config"}
    if not tenant_id:
        log.error("Missing AIPM_REDMINE_TENANT_ID / AIPM_FALLBACK_TENANT_ID")
        return {"error": "missing tenant"}

    keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
    if project_filter:
        keys = [k for k in keys if k == project_filter]
    if not keys:
        log.error("No project keys to sync")
        return {"error": "no project"}

    dsn = dsn.replace("+asyncpg", "")
    results: dict[str, dict] = {}
    for key in keys:
        log.info("Syncing project %s (%s)...", key, "full" if full else "incremental")
        sync = RedmineSync(dsn, tenant_id, url, api_key, key)
        try:
            results[key] = await (sync.run_full() if full else sync.run_incremental())
            log.info("Project %s done: %s", key, results[key])
        except Exception as e:
            log.exception("Sync failed for %s", key)
            results[key] = {"error": str(e)}
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Redmine → TomiHub sync CLI")
    parser.add_argument("--full", action="store_true", help="full mirror")
    parser.add_argument("--incremental", action="store_true", help="incremental since cursor")
    parser.add_argument("--project", default=None, help="single project identifier (filter)")
    args = parser.parse_args()
    if not (args.full or args.incremental):
        parser.error("choose --full or --incremental")
    results = asyncio.run(_run(full=args.full, project_filter=args.project))
    import json
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0 if not any("error" in v for v in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
