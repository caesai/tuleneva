#!/usr/bin/env bash
# Архив локального каталога медиа (OBJECT_STORAGE_LOCAL_DIR).
# S3 этим скриптом не копируется: для бакета — версионирование или отдельный sync.
# Если MEDIA_DIR — символическая ссылка, в архив попадает каталог, на который
# она указывает, под именем самой ссылки. Ссылки внутри каталога не разыменовываются:
# их цель в архив не копируется.
# Использование:
#   MEDIA_DIR=/var/lib/tuleneva/media MEDIA_BACKUP_DIR=/var/backups/tuleneva-media ./backup-media.sh
set -euo pipefail

MEDIA_DIR="${MEDIA_DIR:-/var/lib/tuleneva/media}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-/var/backups/tuleneva-media}"
RETAIN="${RETAIN:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# Один хвостовой слэш не меняет имя верхнего каталога в архиве.
logical_dir="${MEDIA_DIR%/}"
[[ -n "${logical_dir}" ]] || logical_dir="/"

if [[ ! -d "${logical_dir}" ]]; then
  echo "Media directory not found: ${MEDIA_DIR}" >&2
  exit 1
fi

resolved="$(readlink -f -- "${logical_dir}")"
if [[ ! -d "${resolved}" ]]; then
  echo "Media directory not found: ${MEDIA_DIR}" >&2
  exit 1
fi

logical_name="$(basename -- "${logical_dir}")"
case "${logical_name}" in
  ''|'.'|'..'|'/'|*[[:cntrl:]]*)
    echo "Refusing unsafe MEDIA_DIR name: ${MEDIA_DIR}" >&2
    exit 1
    ;;
esac

mkdir -p "${MEDIA_BACKUP_DIR}"
TARGET="${MEDIA_BACKUP_DIR}/media-${STAMP}.tar.gz"
partial="${TARGET}.partial"
rm -f "${partial}"

cleanup_partial() {
  rm -f "${partial}"
}
trap cleanup_partial ERR

# Имя ссылки подставляется в замену sed. `\` и `&` иначе ломают выражение.
prefix="$(printf '%s' "${logical_name}" | sed -e 's/[\\&]/\\&/g')"
delim=$'\037'
tar -C "${resolved}" -czf "${partial}" \
  --transform "s${delim}^\\./${delim}${prefix}/${delim}" \
  --transform "s${delim}^\\.${delim}${prefix}${delim}" \
  .

gzip -t "${partial}"
mv -f "${partial}" "${TARGET}"
trap - ERR

# Хранить последние RETAIN архивов (свежий уже лежит в каталоге).
# Порядок — mtime, не имя файла.
ls -1t "${MEDIA_BACKUP_DIR}"/media-*.tar.gz | tail -n +"$((RETAIN + 1))" | xargs -r rm -f

echo "Media backup written to ${TARGET}"
