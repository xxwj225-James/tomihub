#!/usr/bin/env python3
"""
Build the batch-1 open-source publish tree (P2).

Creates `publish-tomihub/` with ONLY batch-1 content (AGPL-3.0):
  backend/ frontend/ supabase/ connectors/ docs(non-AI) scripts/
  + license/README/gitignore.

EXCLUDED (closed / offline / not batch-1):
  ai-brain/            ← closed until batch-2 (analysis engine)
  tools/ tools-offline/ ← issuance tooling (offline)
  releases/            ← binary tarballs
  history-backup.bundle
  .env* (real secrets), *.lic, docker/tomatoHub.lic
  docs/ AI design docs  ← closed until batch-2

Usage:  python scripts/build_publish_tree.py [--out publish-tomihub]
After building: cd publish-tomihub && git init && git add -A && git commit
then push to the public repo (needs your GitHub credentials).
"""

from __future__ import annotations

import argparse
import os
import shutil

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─── Batch-1 top-level items ─────────────────────────────────────────────
INCLUDE_TOPLVL = [
    "backend", "frontend", "supabase", "connectors", "scripts",
]

# ─── docs: batch-1 publishes ONLY these English-translated core docs ─────
# (Englishized 2026-08-29). Other design docs stay out — they are either
# Chinese working docs or AI-design IP (closed until batch-2).
DOCS_ALLOWLIST = [
    "01-architecture-design.md",
    "29-deployment-guide.md",
    "19-backend-frontend-coding-standards.md",
    "17-ui-coding-standards.md",
    "11-ui-page-matrix.md",
    "10-issue-security-performance.md",
    "18-master-table-design.md",
    "redmine-connector-design.md",
    "redmine-experiment.md",
    "redmine-plugin-design.md",
]

# ─── docker: batch-1 keeps infra + build files, but NOT brain services ───
# The open compose drops ai-brain services; a no-AI compose is added.
DOCKER_EXCLUDE_FILES = {
    ".env", ".env.demo", "tomatoHub.lic", "tomiHub.lic",
    "Dockerfile.python",   # builds closed ai-brain
    "build-brain-detached.sh",   # builds closed ai-brain image
    "build-push-brain.sh",        # pushes closed ai-brain images to ghcr
    "verify-anti-decompile.sh",  # verifies ai-brain .so protection
    "deploy-demo.sh",            # demo stack incl. brain + demo secrets
    "entrypoint-python.sh",      # ai-brain entrypoint
    "docker-compose.demo.yml",   # demo overlay incl. brain
    "seed_workflows.py",         # ai-brain seeding script
}

# ─── global excludes (patterns matched against basename or path) ─────────
EXCLUDE_BASENAMES = {
    ".env", ".env.local", ".env.demo", ".env.production",
    "*.lic", "private_key.pem", "*.pem", "*.key",
    "history-backup.bundle",
}
EXCLUDE_DIRNAMES = {"__pycache__", "node_modules", "target", "dist", ".git",
                    ".idea", ".vscode", ".claude", "releases", "tools",
                    "tools-offline", ".husky", ".githooks", ".mvn",
                    "data"}  # local dev DB files (H2 .mv.db), uploads, etc.


def _excluded_by_basename(name: str) -> bool:
    import fnmatch
    return any(fnmatch.fnmatch(name, pat) for pat in EXCLUDE_BASENAMES)


def copy_tree(src: str, dst: str, *, exclude_dirs=None, exclude_files=None) -> int:
    """Copy src→dst honoring global excludes + per-call ones. Returns file count."""
    exclude_dirs = set(exclude_dirs or [])
    exclude_files = set(exclude_files or [])
    count = 0
    for root, dirs, files in os.walk(src):
        # prune dirs
        dirs[:] = [d for d in dirs
                   if d not in EXCLUDE_DIRNAMES and d not in exclude_dirs]
        rel = os.path.relpath(root, src)
        for f in files:
            if f in exclude_files or _excluded_by_basename(f):
                continue
            src_f = os.path.join(root, f)
            dst_f = os.path.join(dst, rel, f) if rel != "." else os.path.join(dst, f)
            os.makedirs(os.path.dirname(dst_f), exist_ok=True)
            shutil.copy2(src_f, dst_f)
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Build batch-1 publish tree")
    parser.add_argument("--out", default="publish-tomihub")
    parser.add_argument("--force", action="store_true", help="wipe existing out dir")
    args = parser.parse_args()

    out = os.path.join(REPO, args.out)
    if os.path.exists(out):
        if args.force:
            shutil.rmtree(out)
        else:
            print(f"[!] {out} exists — re-run with --force to rebuild")
            return 1
    os.makedirs(out)

    total = 0
    # scripts/: skip ai-brain/demo-internal helpers (they import the closed
    # ai-brain modules or ship demo secrets)
    SCRIPTS_EXCLUDE = {
        "reset_demo.py", "regression_obfuscated.py", "deploy-wsl.sh",
        "verify_so_protection.py",  # verifies ai-brain .so IP protection (closed)
    }
    # supabase: exclude demo-data migrations (056-069) — they seed the
    # @tomihub.demo AI-demo user/projects for the cloud AI demo, not the
    # no-AI open edition. Shipping them would surface AI-demo banners and a
    # read-only demo account in a pure-PM deployment.
    SUPABASE_EXCLUDE = {
        "056_demo_mobile_app_data.sql",
        "057_demo_reports_notifications.sql",
        "058_demo_risk_scenarios.sql",
        "059_demo_api_keys.sql",
        "060_demo_member_roles.sql",
        "061_demo_more_roles.sql",
        "062_demo_tenant_members.sql",
        "069_demo_comments_enrichment.sql",
    }
    for item in INCLUDE_TOPLVL:
        src = os.path.join(REPO, item)
        if not os.path.isdir(src):
            print(f"[skip] {item} (not a dir)")
            continue
        per_exclude_files = set()
        if item == "scripts":
            per_exclude_files = SCRIPTS_EXCLUDE
        elif item == "supabase":
            per_exclude_files = SUPABASE_EXCLUDE
        n = copy_tree(src, os.path.join(out, item), exclude_files=per_exclude_files)
        print(f"[ok]   {item}: {n} files")
        total += n

    # docs — English allowlist only (closed AI/IP docs excluded)
    docs_src = os.path.join(REPO, "docs")
    docs_dst = os.path.join(out, "docs")
    os.makedirs(docs_dst, exist_ok=True)
    n_docs = 0
    for f in DOCS_ALLOWLIST:
        sp = os.path.join(docs_src, f)
        if os.path.isfile(sp):
            shutil.copy2(sp, os.path.join(docs_dst, f))
            n_docs += 1
        else:
            print(f"[!] allowlisted doc missing: {f}")
    print(f"[ok]   docs (English allowlist): {n_docs} files")
    total += n_docs

    # docker — infra + build, brain compose dropped
    docker_src = os.path.join(REPO, "docker")
    docker_dst = os.path.join(out, "docker")
    os.makedirs(docker_dst, exist_ok=True)
    n_dkr = 0
    for f in sorted(os.listdir(docker_src)):
        if f in DOCKER_EXCLUDE_FILES:
            continue
        p = os.path.join(docker_src, f)
        if os.path.isfile(p):
            if _excluded_by_basename(f):
                continue
            shutil.copy2(p, os.path.join(docker_dst, f))
            n_dkr += 1
        elif os.path.isdir(p):
            n_dkr += copy_tree(p, os.path.join(docker_dst, f))

    # Strip ai-brain + ollama services from the open compose (batch-1 has no
    # AI engine). The compose is the "no-AI mode" deployment.
    _strip_brain_compose(os.path.join(docker_src, "docker-compose.yml"),
                         os.path.join(docker_dst, "docker-compose.yml"))
    # Neutralize AI/redmine/MCP proxy locations in nginx → return a JSON
    # guidance message instead of proxying to a non-existent ai-brain.
    _neutralize_nginx_ai(os.path.join(docker_src, "nginx-frontend.conf"),
                         os.path.join(docker_dst, "nginx-frontend.conf"))
    # No-AI runnable support files: env template + JWT key generator
    tpl = os.path.join(REPO, "scripts", "publish-templates")
    for tname, oname in (("env.example", ".env.example"),
                         ("gen-keys.sh", "gen-keys.sh")):
        sp = os.path.join(tpl, tname)
        if os.path.isfile(sp):
            shutil.copy2(sp, os.path.join(docker_dst, oname))
            n_dkr += 1
    print(f"[ok]   docker: {n_dkr} files (compose stripped of ai-brain)")
    total += n_dkr

    # Copy root templates (LICENSE / README / .gitignore) into the tree
    tpl = os.path.join(REPO, "scripts", "publish-templates")
    for tname, oname in (("LICENSE", "LICENSE"),
                         ("README.md", "README.md"),
                         ("gitignore-template", ".gitignore")):
        sp = os.path.join(tpl, tname)
        if os.path.isfile(sp):
            shutil.copy2(sp, os.path.join(out, oname))
            total += 1
        else:
            print(f"[!] template missing: {sp}")

    # README screenshots (referenced from README.md)
    shot_src = os.path.join(tpl, "screenshots")
    if os.path.isdir(shot_src):
        shot_dst = os.path.join(out, "screenshots")
        os.makedirs(shot_dst, exist_ok=True)
        n_shot = 0
        for f in os.listdir(shot_src):
            p = os.path.join(shot_src, f)
            if os.path.isfile(p) and not _excluded_by_basename(f):
                shutil.copy2(p, os.path.join(shot_dst, f))
                n_shot += 1
        total += n_shot
        print(f"[ok]   screenshots: {n_shot} files")

    print(f"\nPublish tree ready: {out} ({total} files)")
    return 0


def _strip_brain_compose(src: str, dst: str) -> None:
    """Remove ai-brain-* and ollama-embed services + their volumes refs."""
    try:
        import yaml
    except ImportError:
        print("[!] PyYAML missing — compose left as-is (may reference ai-brain)")
        return
    with open(src, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not data or "services" not in data:
        return
    drop = [k for k in data["services"]
            if k.startswith("ai-brain") or k in ("ollama-embed",)]
    for k in drop:
        del data["services"][k]
    # Remove dead mounts on core: the old license file + docker.sock (license
    # verification was removed in P1; docker.sock was for ai-brain tooling).
    for svc in data["services"].values():
        vols = svc.get("volumes") or []
        kept = [v for v in vols
                if not (isinstance(v, str) and (".lic" in v or "docker.sock" in v))]
        if kept != vols:
            svc["volumes"] = kept
    # Force open-edition frontend defaults so a downloaded tree runs as a
    # normal product: no AI chrome (batch-1 ships no engine) and NO demo user —
    # registration is enabled and there is no "Try demo" guest path.
    fe_args = (
        ((data.get("services") or {}).get("frontend") or {})
        .get("build") or {}
    ).get("args")
    if fe_args is not None:
        fe_args["VITE_ENABLE_AI_FEATURES"] = "false"
        fe_args["VITE_ENABLE_DEMO_MODE"] = "false"
    with open(dst, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)


def _neutralize_nginx_ai(src: str, dst: str) -> None:
    """Replace AI/redmine/MCP proxy locations in nginx with a JSON notice.

    The no-AI open edition has no ai-brain upstream; proxying would 502.
    Instead these locations return a small JSON explaining AI needs the
    enterprise edition. Line-based parser — safe across server blocks.
    """
    with open(src, encoding="utf-8") as f:
        lines = f.readlines()

    notice_body = (
        'location ~ ^/api/v1/(ai|redmine|mcp) { '
        "default_type application/json; "
        'return 404 \'{"code": "ai_unavailable", "message": "AI features '
        'are not included in this open-source edition. See the README '
        'Enterprise section to enable the licensed ai-brain."}\';\n'
        "    }\n"
    )

    out: list[str] = []
    i = 0
    n = 0
    in_server = False     # track whether we are inside a server {} block
    ai_done_in_server = False
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        # Track server-block entry (top-level "server {").
        if stripped.startswith("server") and "{" in stripped and "location" not in stripped:
            in_server = True
            ai_done_in_server = False
        # A location line targeting an AI upstream (single- or multi-line).
        is_ai_loc = (
            stripped.startswith("location /api/v1/ai/")
            or stripped.startswith("location /api/v1/redmine/")
            or stripped.startswith("location /api/v1/mcp")
            or stripped.startswith("location ~ /api/v1/ai")
            or stripped.startswith("location ~* /api/v1/ai")
        )
        if is_ai_loc:
            # Skip this location block: find its closing brace.
            if stripped.endswith("}"):
                i += 1
            else:
                i += 1
                while i < len(lines) and lines[i].strip() != "}":
                    i += 1
                i += 1  # skip the closing '}'
            if not ai_done_in_server:
                out.append(notice_body)
                ai_done_in_server = True
                n += 1
            continue
        out.append(line)
        i += 1

    with open(dst, "w", encoding="utf-8") as f:
        f.writelines(out)
    print(f"[ok]   nginx AI locations neutralized ({n} blocks)")


if __name__ == "__main__":
    raise SystemExit(main())
