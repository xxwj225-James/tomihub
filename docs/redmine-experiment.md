# Redmine Connector Experiment Guide (R1 End-to-End Validation)

> Status: experiment steps (v1.1, 2026-08-23)
> Goal: locally validate the four things about `redmine_connector` — full sync / incremental sync / fault tolerance / reuse,
> acceptance criteria in `docs/redmine-connector-design.md` §8.
>
> **Environment conventions**:
> - Redmine instance: **you need to start it yourself** (see "Where does the environment come from" below) — official `redmine:latest`
>   Docker image, ships with SQLite, zero dependencies, works started on Windows or in WSL
> - TomiHub database: the `ai_pm` of the WSL `tomihub-test` stack (Windows side connects via `localhost:5433`)
> - Sync uses an **independent tenant** `redmine-test`, doesn't touch demo data
> - Windows local Python already has asyncpg/httpx → run cli / seed / verify directly on Windows

---

## ⚠ Where does the environment come from (important)

**There is no ready-made Redmine instance, and I didn't set it up either.** This agent process keeps getting
denied access to WSL (`Wsl/Service/E_ACCESSDENIED`), and can't start Docker containers either — so:

| Step | Who does it |
|------|------|
| Start the Redmine container | **You** (either Docker Desktop or WSL environment) |
| Change the admin password in browser + generate API key | **You** |
| Run the seed / setup_tenant / cli / verify scripts | I prepare them, **you run them in the Windows terminal** (or I run the Windows-side commands) |

Windows doesn't have Docker installed? Use WSL:
```bash
wsl.exe bash -c "docker run -d --name redmine-test -p 3000:3000 redmine:latest"
```
Windows has Docker Desktop installed? Run directly in PowerShell:
```powershell
docker run -d --name redmine-test -p 3000:3000 redmine:latest
```
Both ways are equivalent — Redmine listens on **http://localhost:3000** either way.

---

## Step overview (one table)

| # | What to do | Who does it | Command |
|---|--------|------|------|
| 0 | Confirm 5433 can connect to ai_pm | You/me | See below |
| 1 | Start the Redmine container | **You** | `docker run -d --name redmine-test -p 3000:3000 redmine:latest` |
| 2 | Change password + generate API key in browser | **You** | http://localhost:3000 |
| 3 | Create data | You run/me run | `python -m redmine_connector.seed_demo --force` |
| 4 | Create test tenant | You run/me run | `python -m redmine_connector.setup_tenant --with-api-key` |
| 5 | Full sync | You run/me run | `python -m redmine_connector.cli --full` |
| 6 | Verify | You run/me run | `python -m redmine_connector.verify_sync` |
| 7 | Incremental sync | You edit in UI + run | `python -m redmine_connector.cli --incremental` |
| 8 | Fault tolerance | You run | Wrong key → `--incremental` → check last_error |
| 9 | ai-brain reuse (optional) | After deploy | `deploy-wsl.sh all` + view in UI |

---

## Detailed steps

### Step 0: Confirm you can reach the TomiHub database

```powershell
python -c "import socket; print(socket.create_connection(('localhost',5433),2))"
# Success → prints a socket object; failure → tomihub-test stack not up, or port mapping differs
```

If you can't connect, check the mapping in WSL:
```bash
wsl.exe bash -c "docker ps --format '{{.Names}} {{.Ports}}' | grep postgres"
```
> If the tomihub-test stack's postgres doesn't map 5433 to the host, you can temporarily add a mapping in WSL
> or use the in-stack address directly (see the last FAQ entry).

### Step 1: Start Redmine (you need to do this)

```powershell
# Windows Docker Desktop version:
docker run -d --name redmine-test -p 3000:3000 redmine:latest
# WSL version:
wsl.exe bash -c "docker run -d --name redmine-test -p 3000:3000 redmine:latest"
```
Wait 30–60 seconds for initialization, then verify:
```powershell
curl -s -o NUL -w "%{http_code}" http://localhost:3000/login   # expected 200
```

### Step 2: Browser initialization (you need to do this)

Open **http://localhost:3000**:
1. Default account `admin` / `admin` (the official image **forces a password change** on first login)
2. After changing the password: **My account → Show API access key → Generate**, copy this key
3. Tell me the key (or fill it into the subsequent commands yourself), **be careful not to commit it to git**

### Step 3: Create data

```powershell
cd C:\Users\wuj\ai-project-manager\ai-brain
$env:AIPM_REDMINE_URL="http://localhost:3000"
$env:AIPM_REDMINE_API_KEY="<the key from step 2>"
python -m redmine_connector.seed_demo --force
```
The script automatically creates: project `testproj`, users alice/bob, versions v1.0/v1.1,
6 issues (including parent-child, comments, status-change journals), 2 wiki pages.
Re-running reports "already exists"; add `--force` to rebuild.

### Step 4: Create an independent test tenant

```powershell
$env:AIPM_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ai_pm"
python -m redmine_connector.setup_tenant --with-api-key
# prints TENANT_ID=xxx, copy it
```
Idempotent — safe to re-run.

### Step 5: Full sync

```powershell
$env:AIPM_REDMINE_TENANT_ID="<the TENANT_ID from step 4>"
$env:AIPM_REDMINE_PROJECT_KEYS="testproj"
python -m redmine_connector.cli --full
# expected {"testproj": {"issues": 6, "versions": 2, "wiki": 2, "cursor": ...}}
```

### Step 6: Verify

```powershell
python -m redmine_connector.verify_sync
# expected:
#   Project: TESTPROJ ... redmine_project_id=<number>
#   Issues: 6 / Comments: 4 / Changelog: >=1 / Sprints: 2 / Wiki: 2
#   Synced users: >=2  (alice@redmine.test, bob@redmine.test)
#   Sync state: cursor=... last_error=None
```

Spot-check with SQL (psql or any client connected to 5433):
```sql
SELECT c.author_name, left(c.body,40) FROM comments c
JOIN issues i ON i.id=c.issue_id JOIN projects p ON p.id=i.project_id
WHERE p.key='TESTPROJ';
SELECT name, start_date, end_date, status FROM sprints
WHERE project_id=(SELECT id FROM projects WHERE key='TESTPROJ');
```

### Step 7: Incremental sync + cursor

```powershell
# 1) Edit an issue in the Redmine UI: add a comment / change status (you click)
# 2) Incremental pull (I run it or you run it)
python -m redmine_connector.cli --incremental
python -m redmine_connector.verify_sync   # comment count should increase
```

**Verify the cursor takes effect** (optional): reset the cursor to an old value in psql, then run incremental again — it should re-pull all changes:
```sql
UPDATE redmine_sync_state SET last_issue_updated='2020-01-01T00:00:00Z'
WHERE tenant_id='<TENANT_ID>';
-- run --incremental again → issues_synced should go back to >=6
```

### Step 8: Fault tolerance

```powershell
$env:AIPM_REDMINE_API_KEY="wrong-key"
python -m redmine_connector.cli --incremental   # doesn't crash, records last_error
python -m redmine_connector.verify_sync         # last_error has a value
$env:AIPM_REDMINE_API_KEY="<correct key>"
python -m redmine_connector.cli --incremental   # recovers and resumes
```

### Step 9: ai-brain reuse (optional, needs deploy)

1. `scripts/deploy-wsl.sh all` (brings migration 071 + new code to the tomihub-test stack)
2. Create a login-capable member account on a new tenant, enter the TESTPROJ project page in the UI
3. The project overview health radar should show analysis for this project (depends on the ai-brain 2h scheduled task)

---

## FAQ

| Symptom | Handling |
|------|------|
| `Redmine project not found: testproj` | seed not run / identifier isn't testproj / URL points to another instance |
| `PermissionError: Redmine auth failed` | API key wrong or not generated (step 2) |
| `database "ai_pm" does not exist` | 5433 isn't connected to tomihub-test's postgres; confirm with `docker ps` |
| `No workflow exists` | migration 017 not fully run; retry after `deploy-wsl.sh all` |
| Comment count is 0 | make sure seed ran with `--force` (journals are only generated when there are notes) |
| Windows lacks Python dependencies | run from the in-stack container: `docker exec ai-pm-brain-api python -m redmine_connector.cli --full` (DSN uses in-container `postgres:5432`) |
