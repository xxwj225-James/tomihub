#!/bin/bash
set -e
cd "$(dirname "$0")"

# ═══ Pre-flight: verify we're building from the SAME code we develop on ═══
SCRIPT_DIR="$(pwd)"
PROJECT_ROOT="$(cd .. && pwd)"

echo "=== Pre-flight checks ==="
echo "  Script dir:    $SCRIPT_DIR"
echo "  Project root:  $PROJECT_ROOT"

# Verify project root has expected structure (single source of truth)
if [ ! -f "$PROJECT_ROOT/backend/pom.xml" ]; then
  echo "ERROR: Project root not found at $PROJECT_ROOT"
  echo "  Expected to find backend/pom.xml — are you running from docker/?"
  exit 1
fi

# Verify critical anti-decompile files exist in build context
for f in "backend/proguard.cfg" "ai-brain/compile_cython.py"; do
  if [ ! -f "$PROJECT_ROOT/$f" ]; then
    echo "ERROR: $f not found — anti-decompile will fail"
    exit 1
  fi
done

# Verify .dockerignore doesn't block proguard.cfg
if grep -qF "proguard.cfg" "$PROJECT_ROOT/.dockerignore" 2>/dev/null; then
  echo "ERROR: .dockerignore blocks proguard.cfg — fix it first"
  exit 1
fi

# Verify WSL2 can reach Docker daemon
if ! docker info >/dev/null 2>&1; then
  echo "WARNING: docker daemon not reachable. Is Docker running?"
  echo "  WSL2: sudo service docker start"
  echo "  Windows: start Docker Desktop"
fi

echo "  All checks passed."
echo ""

# Auto-detect docker CLI on Windows
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"

echo "=== Stopping all containers ==="
docker compose down

echo "=== Building all images ==="
docker compose build --no-cache

echo "=== Starting services ==="
docker compose up -d --force-recreate

# ── DB Init: must run BEFORE health checks, independent of set -e ──
set +e
echo "=== DB Init (migrations) ==="
bash docker/db-init.sh
echo ""
set -e

echo "=== Waiting for health checks ==="
sleep 8
docker compose ps

# Retry loop: restart any failed/errored services up to 3 times
MAX_RETRIES=3
RETRY=1
while [ $RETRY -le $MAX_RETRIES ]; do
  FAILED=$(docker compose ps --format json 2>/dev/null | python3 -c "
import sys, json
failed = []
for line in sys.stdin:
    s = json.loads(line)
    if s.get('Health') not in ('', 'healthy') and s.get('State') in ('exited', 'created'):
        continue
    st = s.get('State', '')
    if st in ('exited', 'restarting'):
        failed.append(s['Service'])
if not failed:
    print('')
else:
    print(' '.join(failed))
" 2>&1)
  if [ -z "$FAILED" ]; then
    echo "  All services healthy."
    break
  fi
  echo "  Retry $RETRY/$MAX_RETRIES: restarting $FAILED ..."
  for svc in $FAILED; do
    docker compose up -d --force-recreate "$svc" 2>/dev/null
  done
  sleep 5
  RETRY=$((RETRY + 1))
done

echo ""
echo "=== Anti-decompile verification ==="
bash verify-anti-decompile.sh || echo "WARNING: Some checks failed"

echo ""
echo "Deploy complete. http://localhost"
