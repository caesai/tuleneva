#!/usr/bin/env bash
# Устанавливает релиз на VPS: распаковка, npm ci, symlink current,
# restart systemd, healthcheck, rollback при сбое, prune старых релизов.
#
# Вызывается по SSH из GitHub Actions от пользователя deploy.
# Аргументы:
#   $1 — Git SHA релиза
#   $2 — путь к tar.gz (внутри: dist/ и server/ без node_modules)

set -euo pipefail

# Неинтерактивный SSH часто без nvm/профиля — ищем системный node/npm.
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

RELEASE_SHA="${1:?usage: remote-release.sh <git-sha> <archive.tar.gz>}"
ARCHIVE="${2:?usage: remote-release.sh <git-sha> <archive.tar.gz>}"

APP_ROOT="${APP_ROOT:-/var/www/tuleneva}"
RELEASES_DIR="${APP_ROOT}/releases"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_SHA}"
CURRENT_LINK="${APP_ROOT}/current"
SERVICE_NAME="${SERVICE_NAME:-tuleneva-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"
HEALTH_SLEEP_SEC="${HEALTH_SLEEP_SEC:-1}"

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ -f "${ARCHIVE}" ]] || fail "archive not found: ${ARCHIVE}"
[[ -d "${RELEASES_DIR}" ]] || fail "releases dir missing: ${RELEASES_DIR}"

PREVIOUS_TARGET=""
if [[ -L "${CURRENT_LINK}" ]]; then
  PREVIOUS_TARGET="$(readlink -f "${CURRENT_LINK}" || true)"
fi

# Идемпотентность: тот же SHA уже активен — ничего не делаем.
if [[ -n "${PREVIOUS_TARGET}" && "${PREVIOUS_TARGET}" == "$(readlink -f "${RELEASE_DIR}" 2>/dev/null || true)" ]]; then
  log "release ${RELEASE_SHA} already current; skipping"
  rm -f "${ARCHIVE}"
  exit 0
fi

if [[ -d "${RELEASE_DIR}" ]]; then
  log "release dir already exists: ${RELEASE_DIR}; reusing after fresh extract"
  rm -rf "${RELEASE_DIR}"
fi

mkdir -p "${RELEASE_DIR}"
log "extracting ${ARCHIVE} -> ${RELEASE_DIR}"
tar -xzf "${ARCHIVE}" -C "${RELEASE_DIR}"
rm -f "${ARCHIVE}"

[[ -d "${RELEASE_DIR}/dist" ]] || fail "missing dist/ in release"
[[ -f "${RELEASE_DIR}/server/dist/index.cjs" ]] || fail "missing server/dist/index.cjs"
[[ -f "${RELEASE_DIR}/server/package-lock.json" ]] || fail "missing server/package-lock.json"

NPM_BIN="$(command -v npm || true)"
[[ -n "${NPM_BIN}" ]] || fail "npm not found in PATH=${PATH} (install Node 20 system-wide for user deploy)"
log "npm ci --omit=dev in server/ (${NPM_BIN})"
(
  cd "${RELEASE_DIR}/server"
  "${NPM_BIN}" ci --omit=dev
)

# Группа tuleneva + setgid на каталоге релизов — www-data читает статику и бандл.
if command -v chgrp >/dev/null 2>&1; then
  chgrp -R tuleneva "${RELEASE_DIR}" 2>/dev/null || true
  chmod -R g+rX "${RELEASE_DIR}" 2>/dev/null || true
fi

switch_to() {
  local target="$1"
  ln -sfn "${target}" "${CURRENT_LINK}.tmp"
  mv -Tf "${CURRENT_LINK}.tmp" "${CURRENT_LINK}"
}

restart_service() {
  sudo systemctl restart "${SERVICE_NAME}"
}

healthcheck() {
  local i
  for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      log "healthcheck ok (${HEALTH_URL})"
      return 0
    fi
    sleep "${HEALTH_SLEEP_SEC}"
  done
  return 1
}

rollback() {
  if [[ -z "${PREVIOUS_TARGET}" || ! -d "${PREVIOUS_TARGET}" ]]; then
    log "no previous release to roll back to"
    return 1
  fi
  log "rolling back to ${PREVIOUS_TARGET}"
  switch_to "${PREVIOUS_TARGET}"
  restart_service || true
  healthcheck || log "healthcheck still failing after rollback"
  return 0
}

log "switching current -> ${RELEASE_DIR}"
switch_to "${RELEASE_DIR}"

log "restarting ${SERVICE_NAME}"
if ! restart_service; then
  log "systemctl restart failed"
  rollback || true
  fail "restart failed"
fi

if ! healthcheck; then
  log "healthcheck failed"
  rollback || true
  fail "healthcheck failed for ${HEALTH_URL}"
fi

# Оставляем KEEP_RELEASES новейших каталогов (по mtime).
log "pruning old releases (keep ${KEEP_RELEASES})"
mapfile -t OLD_RELEASES < <(
  find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -nr \
    | awk 'NR > '"${KEEP_RELEASES}"' { print $2 }'
)
for old in "${OLD_RELEASES[@]}"; do
  [[ -z "${old}" ]] && continue
  if [[ "$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)" == "$(readlink -f "${old}")" ]]; then
    continue
  fi
  log "removing ${old}"
  rm -rf "${old}"
done

log "deploy ${RELEASE_SHA} complete"
sudo systemctl is-active --quiet "${SERVICE_NAME}"
exit 0
