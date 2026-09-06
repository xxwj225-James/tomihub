#!/bin/sh
# Detached Java image build — launched via Windows Start-Process so it
# survives client disconnects. Logs to WSL /tmp/hardening-java12.log.
cd /mnt/c/Users/wuj/ai-project-manager/docker || exit 1
docker compose build core auth > /tmp/hardening-java12.log 2>&1
echo "BUILD EXIT: $?" >> /tmp/hardening-java12.log
