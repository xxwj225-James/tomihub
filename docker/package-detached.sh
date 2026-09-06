#!/bin/sh
# Detached release packaging — launched via Windows Start-Process.
cd /mnt/c/Users/wuj/ai-project-manager || exit 1
bash deploy/package.sh --version v1.2.1 > /tmp/hardening-package.log 2>&1
echo "PACKAGE EXIT: $?" >> /tmp/hardening-package.log
