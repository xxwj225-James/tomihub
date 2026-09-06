"""
Redmine experiment setup — creates an isolated test tenant in the ai_pm DB.

Creates (idempotent):
  * tenants row with a deterministic uuid (slug 'redmine-test')
  * llm_config row for the tenant (ai-brain analysis reuse, step 6)
  * (optional) api_keys row so ai-brain can call the Java backend

The Redmine connector only needs the tenants row (projects.tenant_id has an FK);
workflows fall back to the global default ('00000000-...').

Usage:
    python -m redmine_connector.setup_tenant --dsn postgresql://postgres:postgres@localhost:5433/ai_pm
    # prints TENANT_ID=... — paste into AIPM_REDMINE_TENANT_ID

Env fallback: AIPM_DATABASE_URL
"""

from __future__ import annotations

import argparse
import asyncio
import os
import uuid

import asyncpg

TENANT_SLUG = "redmine-test"
TENANT_NAME = "Redmine Experiment"


def _tenant_id() -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "tomihub/tenant/redmine-test"))


async def _main(dsn: str, with_api_key: bool) -> int:
    conn = await asyncpg.connect(dsn)
    try:
        tid = _tenant_id()
        await conn.execute(
            """INSERT INTO tenants (id, name, slug, plan, is_active)
               VALUES ($1, $2, $3, 'pro', TRUE)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name""",
            tid, TENANT_NAME, TENANT_SLUG)
        print(f"Tenant ready: id={tid} slug={TENANT_SLUG}")

        await conn.execute(
            """INSERT INTO llm_config (tenant_id, backend)
               VALUES ($1, 'ollama')
               ON CONFLICT (tenant_id) DO NOTHING""", tid)
        print("llm_config row ready (backend=ollama)")

        if with_api_key:
            import os as _os
            key = _os.getenv("AIPM_JAVA_API_KEY", "")
            if key:
                await conn.execute(
                    """INSERT INTO api_keys (id, tenant_id, name, key_hash, is_active, created_by)
                       VALUES ($1, $2, 'redmine-experiment', $3, TRUE, '00000000-0000-0000-0000-000000000000')
                       ON CONFLICT DO NOTHING""",
                    str(uuid.uuid4()), tid, key)
                print("api_keys row ready (reuses AIPM_JAVA_API_KEY)")
            else:
                print("AIPM_JAVA_API_KEY empty — skipped api_keys row")

        print(f"\nSet in your sync env: AIPM_REDMINE_TENANT_ID={tid}")
        return 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Create isolated Redmine test tenant")
    parser.add_argument("--dsn", default=None)
    parser.add_argument("--with-api-key", action="store_true",
                        help="also insert api_keys row using AIPM_JAVA_API_KEY")
    args = parser.parse_args()

    dsn = args.dsn or os.getenv("AIPM_DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/ai_pm")
    dsn = dsn.replace("+asyncpg", "")
    return asyncio.run(_main(dsn, args.with_api_key))


if __name__ == "__main__":
    raise SystemExit(main())
