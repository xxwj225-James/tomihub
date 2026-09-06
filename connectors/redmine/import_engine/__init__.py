"""
Import Engine — Migrate data from Redmine/ZenTao to TomiHub.

Usage:
    python -m import_engine.cli redmine \
        --redmine-db mysql://user:pass@host/redmine \
        --tomihub-db postgresql://postgres:postgres@localhost:5433/ai_pm \
        --tenant-id YOUR_TENANT_ID \
        --target-project-id YOUR_PROJECT_ID
"""

__version__ = "1.0.0"
