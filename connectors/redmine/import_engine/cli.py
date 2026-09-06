"""
CLI entry point for Redmine → TomiHub data migration.

Usage:
    python -m import_engine.cli redmine \\
        --redmine-db mysql://user:pass@host/redmine \\
        --tomihub-db postgresql://postgres:postgres@localhost:5433/ai_pm \\
        --tenant-id YOUR_TENANT_ID \\
        --project-identifier myproject \\
        --target-project-name "My Imported Project" \\
        --dry-run

Requirements:
    pip install aiomysql  # for Redmine MySQL support
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone

from .redmine_reader import read_redmine
from .field_mapper import FieldMapper
from .importer import TomiHubImporter

log = logging.getLogger(__name__)


async def migrate_redmine(
    redmine_dsn: str,
    tomihub_dsn: str,
    tenant_id: str,
    project_identifier: str,
    target_project_name: str = "",
    target_project_id: str = "",
    dry_run: bool = False,
    tracker_map: dict | None = None,
    status_map: dict | None = None,
    priority_map: dict | None = None,
    skip_users: bool = False,
    skip_wiki: bool = False,
    skip_versions: bool = False,
) -> dict:
    """Execute a full Redmine → TomiHub migration.

    Args:
        redmine_dsn: MySQL or PostgreSQL connection for Redmine
        tomihub_dsn: PostgreSQL connection for TomiHub
        tenant_id: Target tenant UUID
        project_identifier: Redmine project identifier or numeric ID
        target_project_name: Name for the imported project in TomiHub
        target_project_id: Existing project UUID (if importing into existing project)
        dry_run: If True, preview only without writing
        tracker_map: Override default tracker→type mapping
        status_map: Override default status mapping
        priority_map: Override default priority mapping
        skip_users: Don't import users (use existing TomiHub users)
        skip_wiki: Don't import wiki pages
        skip_versions: Don't import sprints/versions

    Returns:
        Migration statistics dict
    """
    started_at = datetime.now(timezone.utc)

    # ─── Step 1: Read from Redmine ────────────────────────────────────────
    print("=" * 60)
    print("  TomiHub Migration Tool — Redmine Import")
    print("=" * 60)
    print()
    print(f"[1/5] Reading Redmine data from: {redmine_dsn.split('@')[-1] if '@' in redmine_dsn else redmine_dsn}")
    data = await read_redmine(redmine_dsn, project_identifier)
    print(f"       Project:  {data.project.name}")
    print(f"       Issues:   {len(data.issues)}")
    print(f"       Journals: {len(data.journals)}")
    print(f"       Users:    {len(data.users)}")
    print(f"       Wiki:     {len(data.wiki_pages)} pages")
    print(f"       Versions: {len(data.versions)}")
    print(f"       Files:    {len(data.attachments)}")
    print(f"       Trackers: {', '.join(data.trackers)}")
    print(f"       Statuses: {', '.join(data.statuses)}")

    # ─── Step 2: Create target project if needed ──────────────────────────
    if not target_project_id:
        import uuid
        import asyncpg
        target_project_id = str(uuid.uuid4())
        target_project_name = target_project_name or data.project.name
        project_key = data.project.identifier.upper().replace("-", "")[:10]

        if not dry_run:
            conn = await asyncpg.connect(tomihub_dsn)
            try:
                await conn.execute("""
                    INSERT INTO projects (id, tenant_id, name, "key", description, phase, status)
                    VALUES ($1, $2, $3, $4, $5, 'development', 'active')
                """, target_project_id, tenant_id, target_project_name,
                    project_key, data.project.description or "")
            finally:
                await conn.close()
        print(f"\n[2/5] Created target project: {target_project_name} ({project_key})")
    else:
        # Fetch the existing project's key for issue-reference rewriting
        project_key = ""
        if not dry_run:
            try:
                import asyncpg
                conn = await asyncpg.connect(tomihub_dsn)
                try:
                    row = await conn.fetchrow('SELECT "key" FROM projects WHERE id = $1', target_project_id)
                    if row:
                        project_key = row["key"]
                finally:
                    await conn.close()
            except Exception:
                project_key = ""
        print(f"\n[2/5] Using existing project: {target_project_id}")
    print(f"       Project ID: {target_project_id}")

    if dry_run:
        print("\n[DRY RUN] Would import the above data. No changes made.")
        return {"dry_run": True, "stats": {
            "issues": len(data.issues),
            "users": len(data.users),
            "wiki": len(data.wiki_pages),
            "versions": len(data.versions),
            "comments": sum(1 for j in data.journals if j.notes and j.notes.strip()),
            "changelog": sum(len(j.details) for j in data.journals),
            "attachments": len(data.attachments),
        }}

    # ─── Step 3: Map fields ───────────────────────────────────────────────
    print(f"\n[3/5] Mapping fields to TomiHub schema...")
    mapper = FieldMapper(
        tenant_id=tenant_id,
        target_project_id=target_project_id,
        tracker_map=tracker_map,
        status_map=status_map,
        priority_map=priority_map,
        target_project_key=project_key,
    )

    # Map everything
    mapped_users = [mapper.map_user(u) for u in data.users]
    mapped_sprints = mapper.map_sprints(data.versions) if not skip_versions else []
    mapped_issues = mapper.map_issues(data.issues)
    mapped_comments = mapper.map_comments(data.journals)
    mapped_changelog = mapper.map_changelog(data.journals)
    mapped_wiki = mapper.map_wiki_pages(data.wiki_pages) if not skip_wiki else []

    print(f"       Mapped {len(mapped_users)} users")
    print(f"       Mapped {len(mapped_sprints)} sprints")
    print(f"       Mapped {len(mapped_issues)} issues")
    print(f"       Mapped {len(mapped_comments)} comments")
    print(f"       Mapped {len(mapped_changelog)} changelog entries")
    print(f"       Mapped {len(mapped_wiki)} wiki pages")

    # ─── Step 4: Import to TomiHub ──────────────────────────────────────
    print(f"\n[4/5] Importing to TomiHub...")
    importer = TomiHubImporter(tomihub_dsn)
    await importer.connect()
    try:
        # 4a. Users first (other entities reference them)
        if not skip_users:
            print("       Importing users...")
            user_mapping = await importer.import_users(mapped_users)
            # Update mapper with actual user IDs
            mapper.user_ids = {**mapper.user_ids, **user_mapping}
            # Re-resolve user references in issues and other mapped data
            for issue in mapped_issues:
                if issue.get("assignee_id") is None:
                    pass  # already mapped
                issue["assignee_id"] = mapper.user_ids.get(
                    issue.get("_redmine_assignee_id"), issue.get("assignee_id")
                )

        # 4b. Sprints
        if not skip_versions and mapped_sprints:
            print("       Importing sprints...")
            await importer.import_sprints(mapped_sprints)

        # 4c. Issues (bulk COPY)
        print(f"       Importing {len(mapped_issues)} issues...")
        issue_mapping = await importer.import_issues(
            mapped_issues, mapper.user_ids, mapper.version_ids
        )
        mapper.issue_ids = {**mapper.issue_ids, **issue_mapping}

        # Re-resolve comments/changelog with actual issue IDs
        for c in mapped_comments:
            c["issue_id"] = mapper.issue_ids.get(c.get("_redmine_issue_id"), c["issue_id"])
        for e in mapped_changelog:
            e["issue_id"] = mapper.issue_ids.get(e.get("_redmine_issue_id"), e["issue_id"])

        # 4d. Comments
        if mapped_comments:
            print(f"       Importing {len(mapped_comments)} comments...")
            await importer.import_comments(mapped_comments)

        # 4e. Changelog
        if mapped_changelog:
            print(f"       Importing {len(mapped_changelog)} changelog entries...")
            await importer.import_changelog(mapped_changelog)

        # 4f. Wiki
        if not skip_wiki and mapped_wiki:
            print(f"       Importing {len(mapped_wiki)} wiki pages...")
            await importer.import_wiki_pages(mapped_wiki)

    finally:
        await importer.close()

    # ─── Step 5: Report ───────────────────────────────────────────────────
    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    stats = importer.get_stats()
    print(f"\n[5/5] Migration complete in {elapsed:.1f}s")
    print("=" * 60)
    print("  IMPORT SUMMARY")
    print("=" * 60)
    print(f"  Project:      {target_project_name}")
    print(f"  Users:        {stats['users']['created']} created, {stats['users']['skipped']} skipped (already exist)")
    print(f"  Sprints:      {stats['sprints']['created']}")
    print(f"  Issues:       {stats['issues']['created']}")
    print(f"  Comments:     {stats['comments']['created']}")
    print(f"  Changelog:    {stats['changelog']['created']}")
    print(f"  Wiki Pages:   {stats['wiki']['created']}")
    print(f"  Duration:     {elapsed:.1f}s")
    print()

    return {"success": True, "stats": stats, "elapsed_s": elapsed, "project_id": target_project_id}


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="TomiHub Migration Tool — Import from Redmine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Preview what will be imported (dry run)
  python -m import_engine.cli redmine \\
      --redmine-db mysql://root:pass@localhost/redmine \\
      --tomihub-db postgresql://postgres:postgres@localhost:5433/ai_pm \\
      --tenant-id YOUR_TENANT_UUID \\
      --project-identifier myproject \\
      --dry-run

  # Full import (creates a new project in TomiHub)
  python -m import_engine.cli redmine \\
      --redmine-db mysql://root:pass@localhost/redmine \\
      --tomihub-db postgresql://postgres:postgres@localhost:5433/ai_pm \\
      --tenant-id YOUR_TENANT_UUID \\
      --project-identifier myproject \\
      --target-project-name "My Redmine Project"

  # Import into an existing project
  python -m import_engine.cli redmine \\
      --redmine-db mysql://root:pass@localhost/redmine \\
      --tomihub-db postgresql://postgres:postgres@localhost:5433/ai_pm \\
      --tenant-id YOUR_TENANT_UUID \\
      --project-identifier myproject \\
      --target-project-id EXISTING_PROJECT_UUID
""",
    )

    subparsers = parser.add_subparsers(dest="command", help="Source system")

    # Redmine subcommand
    redmine_parser = subparsers.add_parser("redmine", help="Import from Redmine")
    redmine_parser.add_argument("--redmine-db", required=True,
                                help="Redmine database DSN (mysql://user:pass@host/db or postgresql://...)")
    redmine_parser.add_argument("--tomihub-db", required=True,
                                help="TomiHub database DSN (postgresql://user:pass@host/db)")
    redmine_parser.add_argument("--tenant-id", required=True,
                                help="Target tenant UUID in TomiHub")
    redmine_parser.add_argument("--project-identifier", required=True,
                                help="Redmine project identifier (slug) or numeric ID")
    redmine_parser.add_argument("--target-project-name", default="",
                                help="Name for the imported project (default: Redmine project name)")
    redmine_parser.add_argument("--target-project-id", default="",
                                help="Import into an existing project UUID (instead of creating new)")
    redmine_parser.add_argument("--dry-run", action="store_true",
                                help="Preview only — don't write anything")
    redmine_parser.add_argument("--skip-users", action="store_true",
                                help="Skip user import")
    redmine_parser.add_argument("--skip-wiki", action="store_true",
                                help="Skip wiki page import")
    redmine_parser.add_argument("--skip-versions", action="store_true",
                                help="Skip sprint/version import")
    redmine_parser.add_argument("--verbose", "-v", action="store_true",
                                help="Enable debug logging")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Setup logging
    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)-5s] %(name)s - %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.command == "redmine":
        result = asyncio.run(migrate_redmine(
            redmine_dsn=args.redmine_db,
            tomihub_dsn=args.tomihub_db,
            tenant_id=args.tenant_id,
            project_identifier=args.project_identifier,
            target_project_name=args.target_project_name,
            target_project_id=args.target_project_id,
            dry_run=args.dry_run,
            skip_users=args.skip_users,
            skip_wiki=args.skip_wiki,
            skip_versions=args.skip_versions,
        ))
        if result.get("success"):
            sys.exit(0)
        else:
            sys.exit(1)


if __name__ == "__main__":
    main()
