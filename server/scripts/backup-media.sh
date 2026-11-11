#!/usr/bin/env bash
# Архив локального каталога медиа (OBJECT_STORAGE_LOCAL_DIR).
# S3 этим скриптом не копируется: для бакета — версионирование или отдельный sync.
# Использование:
#   MEDIA_DIR=/var/lib/tuleneva/media MEDIA_BACKUP_DIR=/var/backups/tuleneva-media ./backup-media.sh
set -euo pipefail

MEDIA_DIR="${MEDIA_DIR:-/var/lib/tuleneva/media}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-/var/backups/tuleneva-media}"
RETAIN="${RETAIN:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${MEDIA_BACKUP_DIR}/media-${STAMP}.tar.gz"

if [[ ! -d "${MEDIA_DIR}" ]]; then
  echo "Media directory not found: ${MEDIA_DIR}" >&2
  exit 1
fi

mkdir -p "${MEDIA_BACKUP_DIR}"
# В архиве один верхний каталог с тем же именем, что у MEDIA_DIR.
tar -C "$(dirname "${MEDIA_DIR}")" -czf "${TARGET}" "$(basename "${MEDIA_DIR}")"

# Хранить последние RETAIN архивов (свежий уже лежит в каталоге).
ls -1t "${MEDIA_BACKUP_DIR}"/media-*.tar.gz | tail -n +"$((RETAIN + 1))" | xargs -r rm -f

echo "Media backup written to ${TARGET}"
