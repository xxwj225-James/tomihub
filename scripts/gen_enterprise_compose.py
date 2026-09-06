#!/usr/bin/env python3
"""Generate the enterprise (full-AI) compose from the main compose.

Changes vs docker/docker-compose.yml:
  * ai-brain services → pull prebuilt images from ghcr.io (no build section;
    source/Dockerfile never shipped — code-protection, see
    docs/enterprise-ai-delivery.md)
  * open services keep their local build (core/auth/frontend are open source)
Output: docker/docker-compose.enterprise.yml

Usage: python scripts/gen_enterprise_compose.py
"""
import yaml

MAIN = "docker/docker-compose.yml"
OUT = "docker/docker-compose.enterprise.yml"
GHCR = "ghcr.io/xxwj225-james"


def main():
    with open(MAIN, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    services = data["services"]
    # ai-brain services pull from ghcr; drop their build sections.
    brain_targets = {"ai-brain-api": "api", "ai-brain-worker": "worker",
                     "ai-brain-beat": "beat"}
    for name in services:
        if name in brain_targets:
            svc = services[name]
            svc.pop("build", None)
            svc["image"] = f"{GHCR}/tomihub-brain-{brain_targets[name]}:latest"
            svc["pull_policy"] = "always"
            # Deliveries must ENFORCE the license — without a valid ai-brain.lic
            # the brain must not run. Hard "true", not env-overridable.
            env = svc.setdefault("environment", {})
            env["AIPM_LICENSE_ENFORCE"] = "true"
            print(f"[ai-brain] {name} -> {svc['image']} (pull, no build, license enforced)")

    with open(OUT, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)
    print(f"[ok] wrote {OUT}")
    print("NOTE: open services (core/auth/frontend) still build from source —")
    print("      they are batch-1 open source. Only ai-brain is closed/pulled.")


if __name__ == "__main__":
    main()
