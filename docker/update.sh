#!/bin/bash
# ═══ Production Update — incremental deploy, no data loss ═══
# Usage:
#   bash update.sh                  → db-init only (schema changes)
#   bash update.sh --build core     → rebuild + restart core
#   bash update.sh --build all      → rebuild all services
#   bash update.sh --build frontend → rebuild frontend only
set -e
cd "$(dirname "$0")"

BUILD_TARGET="${2:-}"

echo "=== Update: $(date) ==="

# ── Step 1: DB schema sync (idempotent, always safe) ──
echo "=== DB Init (schema sync) ==="
bash docker/db-init.sh

# ── Step 2: Build if requested ──
if [ "$1" = "--build" ] && [ -n "$BUILD_TARGET" ]; then
  echo "=== Rebuilding: $BUILD_TARGET ==="
  if [ "$BUILD_TARGET" = "all" ]; then
    docker compose build
  else
    docker compose build "$BUILD_TARGET"
  fi
fi

# ── Step 3: Restart changed services ──
echo "=== Restarting services ==="
if [ "$1" = "--build" ] && [ -n "$BUILD_TARGET" ]; then
  if [ "$BUILD_TARGET" = "all" ]; then
    docker compose up -d --force-recreate
  else
    docker compose up -d --force-recreate "$BUILD_TARGET"
    # Also restart frontend if core changed (nginx DNS cache)
    if [ "$BUILD_TARGET" = "core" ]; then
      docker compose up -d --force-recreate frontend
    fi
  fi
fi

# ── Step 4: Health check ──
echo "=== Health check ==="
sleep 5
docker compose ps

echo ""
echo "Update complete."
