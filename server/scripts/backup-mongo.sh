#!/usr/bin/env bash
# Ежедневный дамп MongoDB на другой диск или каталог.
# Использование:
#   MONGO_URI='mongodb://user:pass@127.0.0.1:27017/test' BACKUP_DIR=/var/backups/tuleneva ./backup-mongo.sh
set -euo pipefail

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/test}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tuleneva}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/${STAMP}"

mkdir -p "${TARGET}"
mongodump --uri="${MONGO_URI}" --out="${TARGET}"

# Хранить последние 14 дампов
ls -1dt "${BACKUP_DIR}"/*/ 2>/dev/null | tail -n +15 | xargs -r rm -rf

echo "Backup written to ${TARGET}"
