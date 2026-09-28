#!/usr/bin/env bash
# =============================================================================
# Production deploy for PSX Portfolio Manager.
#
# Deploys THE CURRENT CHECKOUT — syncing a ref first is the caller's job:
#   * CI (.github/workflows/deploy.yml) → /home/deploy/bin/psx-pm-ci-deploy, which resets the
#     checkout to origin/main and then execs this script.
#   * by hand:  git fetch origin && git checkout -B main origin/main && git reset --hard origin/main
#               bash scripts/deploy.sh
#
# Services: `--profile prod` deploys every production service the compose file defines —
# app-prod (nginx :6100) and proxy-prod (express :6101) today; db-prod joins automatically once
# the compose file on main carries it. Nothing here names a service, so a new prod service needs
# no change to this script.
#
# Idempotent: safe to re-run. It gates on the published ports it reads back from compose, on the
# proxy's /health, on the frontend answering 200, and on container state, and exits non-zero on
# any problem — so a failed deploy fails the workflow instead of leaving something broken live.
#
# Partial failure is safe by construction: `compose up -d --build` builds every image BEFORE it
# recreates anything, so a commit that does not compile aborts the deploy while the previously
# running containers keep serving.
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

PROFILE="prod"
COMPOSE=(docker compose --profile "$PROFILE")
HEALTH_TIMEOUT=150
SETTLE_TIMEOUT=150
FRONTEND_GRACE=30   # nginx has no /health endpoint; give it a moment before the first probe

COMMIT="$(git rev-parse --short HEAD)"

echo "==============================================================="
echo "[deploy] repo    : $REPO_DIR"
echo "[deploy] commit  : $COMMIT — $(git log -1 --format=%s)"
echo "[deploy] branch  : $(git rev-parse --abbrev-ref HEAD)"
echo "[deploy] dirty   : $(git status --porcelain | wc -l) changed path(s)"
echo "[deploy] started : $(date -u '+%F %T UTC')"
echo "==============================================================="

# ── Preconditions ─────────────────────────────────────────────────────────────
# The production wiring is host-local by design (both files are gitignored): without the override
# the compose project is named `psx-portfolio-manager` and publishes 3000/4000 — colliding with
# the other checkouts on this box and, for :4000, with the scraper's production API. Without
# .env.local the proxy has no configuration (the base file marks it required). Refuse rather than
# deploy something that would bind the wrong ports.
if [ ! -f docker-compose.override.yml ]; then
  echo "[deploy] ERROR: docker-compose.override.yml is missing — refusing to deploy the bare compose project" >&2
  exit 2
fi
if [ ! -f .env.local ]; then
  echo "[deploy] ERROR: .env.local is missing — the proxy has no configuration without it" >&2
  exit 2
fi

# Serialise deploys. The workflow's `concurrency` group only orders GitHub-triggered runs — it
# cannot stop a hand-run deploy colliding with a CI one, which is how two concurrent `compose up`
# calls once raced into "container name ... is already in use".
LOCK_FILE="/tmp/psx-pm-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[deploy] another deploy is already running (lock $LOCK_FILE) — refusing to run concurrently" >&2
  exit 4
fi
echo "[deploy] lock acquired ($LOCK_FILE)"

# ── Build + start ─────────────────────────────────────────────────────────────
echo "[deploy] build + start (recreates changed services; the proxy blips for ~20s)"
"${COMPOSE[@]}" up -d --build

# ── Read the published ports back from compose ────────────────────────────────
# Never hardcode 6100/6101: they are configured in the gitignored override, and a probe against a
# stale port would pass while the real entry point is down, or fail while the site is fine.
port_of() { # port_of <service> <container-port>
  "${COMPOSE[@]}" port "$1" "$2" 2>/dev/null | head -1 | awk -F: '{print $NF}' | tr -d '[:space:]'
}
PROXY_PORT="$(port_of proxy-prod 4000 || true)"
FRONTEND_PORT="$(port_of app-prod 80 || true)"
if [ -z "$PROXY_PORT" ] || [ -z "$FRONTEND_PORT" ]; then
  echo "[deploy] ERROR: could not read the published ports from compose (proxy='$PROXY_PORT' frontend='$FRONTEND_PORT')" >&2
  "${COMPOSE[@]}" ps >&2
  exit 1
fi
PROXY_URL="http://127.0.0.1:${PROXY_PORT}/health"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}/"
echo "[deploy] targets : proxy $PROXY_URL | frontend $FRONTEND_URL"

# ── Gate 1: the proxy answers ─────────────────────────────────────────────────
echo "[deploy] waiting up to ${HEALTH_TIMEOUT}s for $PROXY_URL"
healthy=false
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -fsS -m 3 "$PROXY_URL" >/dev/null 2>&1; then
    echo "[deploy] proxy healthy after ${i}s: $(curl -fsS -m 3 "$PROXY_URL")"
    healthy=true
    break
  fi
  sleep 1
done
if [ "$healthy" != true ]; then
  echo "[deploy] ERROR: proxy did not become healthy within ${HEALTH_TIMEOUT}s — last 40 proxy log lines:" >&2
  "${COMPOSE[@]}" logs --tail=40 proxy-prod >&2 || true
  exit 1
fi

# ── Gate 2: the frontend serves ───────────────────────────────────────────────
echo "[deploy] waiting up to ${FRONTEND_GRACE}s for $FRONTEND_URL"
frontend_code=""
for i in $(seq 1 "$FRONTEND_GRACE"); do
  frontend_code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$FRONTEND_URL" || echo 000)"
  [ "$frontend_code" = "200" ] && break
  sleep 1
done
echo "[deploy] frontend: HTTP ${frontend_code} ($FRONTEND_URL)"
if [ "$frontend_code" != "200" ]; then
  echo "[deploy] ERROR: frontend did not return 200 — last 40 app log lines:" >&2
  "${COMPOSE[@]}" logs --tail=40 app-prod >&2 || true
  exit 1
fi

# ── Gate 3: every service settled ─────────────────────────────────────────────
ids="$("${COMPOSE[@]}" ps -q)"
if [ -z "$ids" ]; then
  echo "[deploy] ERROR: no containers are running after up — refusing to report success" >&2
  exit 1
fi

# A freshly recreated container reports health "starting" for its start_period, so a check that
# demands "healthy" immediately would fail every good deploy. Wait for the set to settle instead,
# and fail fast on anything genuinely wrong.
#
# `{{else}}none{{end}}` matters: a service without a healthcheck would otherwise emit an empty
# field, shifting OOMKilled/RestartCount into the wrong variables.
echo "[deploy] waiting up to ${SETTLE_TIMEOUT}s for containers to settle"
settled=false
for i in $(seq 1 "$SETTLE_TIMEOUT"); do
  pending=0
  problems=""
  # shellcheck disable=SC2086  # $ids is deliberately word-split: one arg per container id
  while read -r name state health oom restarts; do
    [ -z "$name" ] && continue
    name="${name#/}"
    case "$state" in running) ;; *) problems="$problems $name(state=$state)";; esac
    case "$health" in
      healthy|none) ;;
      starting) pending=$((pending + 1)) ;;
      *) problems="$problems $name(health=$health)" ;;
    esac
    [ "$oom" = "true" ] && problems="$problems $name(OOMKilled)"
    [ "${restarts:-0}" -gt 0 ] 2>/dev/null && problems="$problems $name(restarts=$restarts)"
  done < <(docker inspect $ids --format '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.OOMKilled}} {{.RestartCount}}' 2>/dev/null)

  if [ -n "$problems" ]; then
    echo "[deploy] ERROR: containers are not well after deploy:$problems" >&2
    "${COMPOSE[@]}" ps >&2
    exit 1
  fi
  if [ "$pending" -eq 0 ]; then
    settled=true
    echo "[deploy] all containers settled after ${i}s"
    break
  fi
  sleep 1
done

if [ "$settled" != true ]; then
  echo "[deploy] ERROR: containers still reporting 'starting' after ${SETTLE_TIMEOUT}s" >&2
  "${COMPOSE[@]}" ps >&2
  exit 1
fi

echo "[deploy] container state:"
# shellcheck disable=SC2086
docker inspect $ids --format '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.OOMKilled}} {{.RestartCount}}' 2>/dev/null | while read -r name state health oom restarts; do
  echo "[deploy]   ${name#/}: state=$state health=$health oom=$oom restarts=$restarts"
done

echo "[deploy] services (compose project $(basename "$REPO_DIR"), profile $PROFILE):"
"${COMPOSE[@]}" ps

echo "[deploy] pruning dangling images"
docker image prune -f >/dev/null 2>&1 || true

echo "==============================================================="
echo "[deploy] DONE — $COMMIT live at $(date -u '+%F %T UTC')"
echo "==============================================================="
