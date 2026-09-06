#!/usr/bin/env bash
# =========================================================
# TomiHub (no-AI open edition) — generate JWT key pair + .env
#
# Creates:
#   .env  ← docker/.env  (fills JWT_PRIVATE_KEY / JWT_PUBLIC_KEY)
#
# Usage:
#   cd docker
#   cp .env.example .env
#   bash gen-keys.sh
#   docker compose up -d --build
# =========================================================
set -e

cd "$(dirname "$0")"

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "[!] $ENV_FILE not found — copy .env.example first: cp .env.example .env"
  exit 1
fi

echo "[*] Generating RSA-2048 JWT key pair..."
TMP_KEY="$(mktemp)"
openssl genrsa -out "$TMP_KEY" 2048 2>/dev/null
# Private key: PKCS#8, single-line (matches what auth's JwtPublicKeyProvider expects)
PRIV="$(openssl pkcs8 -topk8 -nocrypt -in "$TMP_KEY" -outform PEM 2>/dev/null | tr -d '\n')"
# Public key: DER base64 single line (matches the existing ${JWT_PUBLIC_KEY} format)
PUB="$(openssl rsa -in "$TMP_KEY" -pubout -outform PEM 2>/dev/null | grep -v '^---' | tr -d '\n')"
rm -f "$TMP_KEY"

if [ -z "$PRIV" ] || [ -z "$PUB" ]; then
  echo "[!] openssl key generation failed"
  exit 1
fi

# Idempotent: replace existing values or insert after the marker lines
sed -i.bak "s|^JWT_PRIVATE_KEY=.*|JWT_PRIVATE_KEY=${PRIV}|" "$ENV_FILE"
sed -i.bak "s|^JWT_PUBLIC_KEY=.*|JWT_PUBLIC_KEY=${PUB}|" "$ENV_FILE"
rm -f "$ENV_FILE.bak"

# Also default ENCRYPT_KEY if still placeholder
if grep -q '^ENCRYPT_KEY=change-me' "$ENV_FILE"; then
  RAND="$(openssl rand -hex 16)"
  sed -i.bak "s|^ENCRYPT_KEY=.*|ENCRYPT_KEY=${RAND}|" "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
fi

echo "[OK] JWT keys written to $ENV_FILE"
echo "     Next: docker compose up -d --build"
