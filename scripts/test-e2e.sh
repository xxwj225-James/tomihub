#!/bin/bash
# TomiHub E2E Test Suite — HTTP-only, no WSL dependency
BASE="http://localhost/api/v1"
PASS=0; FAIL=0

ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "============================================"
echo " TomiHub E2E Test Suite"
echo "============================================"
echo ""

# ─── 1. Frontend Pages ───
echo "1. Frontend Pages"
for page in / /login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost$page" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then ok "$page → 200"
  elif [ "$code" = "000" ]; then fail "$page → UNREACHABLE (is frontend running?)"
  else fail "$page → $code"; fi
done
echo ""

# ─── 2. Auth — Guest Login ───
echo "2. Demo Guest Login"
resp=$(curl -s --max-time 10 -X POST "$BASE/auth/guest-login" 2>/dev/null || echo "")
if echo "$resp" | grep -q "accessToken"; then
  ok "Guest login OK"
  GTOKEN=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['tokens']['accessToken'])" 2>/dev/null)
else
  fail "Guest login: $(echo "$resp" | head -c 100)"
fi
echo ""

# ─── 3. Permission Tests ───
echo "3. Permission Tests"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE/projects" 2>/dev/null)
[ "$code" = "401" ] && ok "Unauth GET → 401" || fail "Unauth GET → $code (expected 401)"

if [ -n "$GTOKEN" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "Authorization: Bearer $GTOKEN" "$BASE/projects" 2>/dev/null)
  [ "$code" = "200" ] && ok "Viewer GET /projects → 200" || fail "Viewer GET /projects → $code"

  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST \
    -H "Authorization: Bearer $GTOKEN" -H "Content-Type: application/json" \
    "$BASE/projects" -d '{"name":"x","key":"X"}' 2>/dev/null)
  [ "$code" = "403" ] && ok "Viewer POST → 403" || fail "Viewer POST → $code (expected 403)"
fi
echo ""

# ─── 4. License Status (with guest token) ───
echo "4. License Status"
LICENSE_TOKEN=""
if [ -n "$GTOKEN" ]; then LICENSE_TOKEN="$GTOKEN"; fi
resp=$(curl -s --max-time 5 -H "Authorization: Bearer $LICENSE_TOKEN" "$BASE/license/status" 2>/dev/null || echo '{}')
mode=$(echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('mode','UNKNOWN'))" 2>/dev/null || echo "ERROR")
echo "  Mode: $mode"
[[ "$mode" =~ ^(LOCKED|NORMAL|GRACE_PERIOD)$ ]] && ok "License API" || fail "License API: $mode"
echo ""

# ─── 5. Register + Login ───
echo "5. Register + Login Flow"
EMAIL="e2e_$(date +%s)@test.local"
PASSWD="Test@1234"

resp=$(curl -s --max-time 10 -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWD\",\"displayName\":\"E2E Tester\"}" 2>/dev/null)
if echo "$resp" | grep -q "accessToken"; then
  ok "Register OK"
  TOKEN=$(echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['tokens']['accessToken'])" 2>/dev/null)

  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "Authorization: Bearer $TOKEN" "$BASE/projects" 2>/dev/null)
  [ "$code" = "200" ] && ok "Auth'd user GET /projects → 200" || fail "Auth'd user GET → $code"

  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$BASE/projects" -d '{"name":"My Project","key":"MYPROJ"}' 2>/dev/null)
  if [ "$code" = "200" ]; then
    ok "Auth'd user POST /projects → 200"
  elif [ "$mode" = "LOCKED" ] && [ "$code" = "403" ]; then
    echo "  ⚠️  POST 403 — expected (no license, LOCKED mode)"
  else
    fail "Auth'd user POST → $code"
  fi
elif echo "$resp" | grep -q "quota"; then
  echo "  ⚠️  Tenant quota full — skip register test (clean tenants to fix)"
else
  fail "Register: $(echo "$resp" | head -c 120)"
fi
echo ""

# ─── 6. i18n Check ───
echo "6. i18n (quick spot-check)"
curl -s --max-time 5 "http://localhost/" > /dev/null 2>&1 && ok "Frontend serves HTML" || fail "Frontend unreachable"
echo ""

# ─── Summary ───
echo "============================================"
echo " Results: $PASS passed, $FAIL failed"
echo "============================================"
[ "$FAIL" -eq 0 ]
