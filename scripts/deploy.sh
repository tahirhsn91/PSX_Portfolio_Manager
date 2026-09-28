#!/usr/bin/env bash
# =============================================================================
# Production deploy for PSX Portfolio Manager.
#
# Deploys THE CURRENT CHECKOUT — syncing a ref first is the caller's job:
#   * CI (.github/workflows/deploy.yml) → /home/deploy/bin/psx-pm-ci-deploy, which resets the
#     checkout to origin/main and then execs this script.
#   * by hand:  git fetch origin && git checkout -B main origin/main && git reset --hard origin/main
#               bash scripts/deploy.sh
#   * check only, touch nothing:  bash scripts/deploy.sh --check
#
# Services: `--profile prod` deploys every production service the compose file defines — nothing
# here names a service, so a new prod service needs no change to this script.
#
# Idempotent: safe to re-run. It gates on the published ports it reads back from compose, on the
# proxy's /health, on the frontend answering 200, and on container state, and exits non-zero on
# any problem — so a failed deploy fails the workflow instead of leaving something broken live.
#
# Two properties keep a broken deploy from taking production down with it:
#
#   1. PREFLIGHT, before anything is touched. The resolved project (`docker compose config
#      --format json`, which inlines every env_file value) is inspected: a variable a service
#      needs at container *start* must be present and non-empty — the ones an image refuses to
#      initialise without (POSTGRES_PASSWORD for a postgres service) and the ones a healthcheck
#      expands inside the container (`$$VAR`). Missing names abort the deploy with the exact list,
#      instead of surfacing minutes later as
#      "dependency failed to start: container … is unhealthy".
#   2. DEPENDENCIES FIRST. Services are started in dependency order, computed from the same config,
#      and each level must be healthy before the next level is created. A datastore that cannot
#      start therefore fails the deploy while the previously running app containers keep serving —
#      they are never recreated into a half-started state. Only the last level is built.
#
# Deliberately NOT done: rollback, blue/green, or restarting app containers to "recover". A failed
# deploy stops at the failing level and says so.
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

PROFILE="prod"
COMPOSE=(docker compose --profile "$PROFILE")
HEALTH_TIMEOUT=150
SETTLE_TIMEOUT=150
DEP_TIMEOUT=120     # per dependency level (a datastore initialising a fresh volume)
FRONTEND_GRACE=30   # nginx has no /health endpoint; give it a moment before the first probe

COMMIT="$(git rev-parse --short HEAD)"

if command -v python3 >/dev/null 2>&1; then HAVE_PY=true; else HAVE_PY=false; fi

# ── Arguments ─────────────────────────────────────────────────────────────────
# `--check` answers "would this deploy work, and where would it publish?" without building,
# creating or restarting anything: same preconditions, same config preflight, then it prints
# the resolved services by dependency level and the ports the override publishes, and exits 0.
# It exists because the preflight itself has to be testable — and because a host's wiring
# (missing override, empty POSTGRES_PASSWORD) should be checkable before a merge deploys it.
CHECK_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    -h|--help)
      sed -n '2,35p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "[deploy] ERROR: unknown argument: $arg (try --help)" >&2
      exit 64
      ;;
  esac
done

echo "==============================================================="
echo "[deploy] repo    : $REPO_DIR"
echo "[deploy] commit  : $COMMIT — $(git log -1 --format=%s)"
echo "[deploy] branch  : $(git rev-parse --abbrev-ref HEAD)"
echo "[deploy] dirty   : $(git status --porcelain | wc -l) changed path(s)"
echo "[deploy] mode    : $([ "$CHECK_ONLY" = true ] && echo 'CHECK ONLY — nothing will be built, created or restarted' || echo deploy)"
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

# Serialise deploys. The workflow's `concurrency` group only orders GitHub-triggered runs —
# it cannot stop a hand-run deploy colliding with a CI one, which is how two concurrent
# `compose up` calls once raced into "container name ... is already in use".
#
# Not taken in --check mode: a check mutates nothing, so it must never block (or be blocked by)
# a real deploy.
if [ "$CHECK_ONLY" = false ]; then
  LOCK_FILE="/tmp/psx-pm-deploy.lock"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[deploy] another deploy is already running (lock $LOCK_FILE) — refusing to run concurrently" >&2
    exit 4
  fi
  echo "[deploy] lock acquired ($LOCK_FILE)"
fi

# ── Preflight: the project's own shape, read from compose ─────────────────────
CFG_JSON="$(mktemp -t psx-pm-prod-cfg.XXXXXX.json)"
trap 'rm -f "$CFG_JSON"' EXIT

if ! "${COMPOSE[@]}" config --format json >"$CFG_JSON" 2>/dev/null; then
  echo "[deploy] ERROR: 'docker compose … config' failed — the compose files do not resolve:" >&2
  "${COMPOSE[@]}" config >&2 || true
  echo "[deploy] NOTHING WAS TOUCHED." >&2
  exit 2
fi

# Services grouped by dependency depth, printed as "LEVEL<TAB>service", shallowest first.
levels_from_cfg() {
  python3 - "$CFG_JSON" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
services = cfg.get('services') or {}
deps = {n: list((s.get('depends_on') or {}).keys()) for n, s in services.items()}
level = {}
def depth(n, seen=()):
    if n in level:
        return level[n]
    d = 0
    for p in deps.get(n, []):
        if p in services and p not in seen:
            d = max(d, depth(p, seen + (n,)) + 1)
    level[n] = d
    return d
for n in services:
    depth(n)
for n in sorted(services, key=lambda s: (level[s], s)):
    print("%d\t%s" % (level[n], n))
PY
}

# Variables a service needs at container start that the resolved environment does not provide.
# Prints "MISSING<TAB>service<TAB>VAR<TAB>why"; never prints a value.
missing_from_cfg() {
  python3 - "$CFG_JSON" <<'PY'
import json, re, sys
cfg = json.load(open(sys.argv[1]))
services = cfg.get('services') or {}
for name, s in sorted(services.items()):
    env = {k: ('' if v is None else str(v)) for k, v in (s.get('environment') or {}).items()}
    image = str(s.get('image') or '')
    # postgres runs initdb on first start and refuses to do so without a superuser password: the
    # container exits 1, its healthcheck never passes, and compose aborts the whole run — that is
    # how a deploy used to leave the app containers created-but-never-started, i.e. an outage.
    if image.split(':')[0].rsplit('/', 1)[-1] == 'postgres' and not env.get('POSTGRES_PASSWORD'):
        print("MISSING\t%s\tPOSTGRES_PASSWORD\t%s refuses to initialise without it" % (name, image))
    # `$$VAR` in a healthcheck is expanded INSIDE the container, so the variable must reach it.
    test = (s.get('healthcheck') or {}).get('test') or []
    text = ' '.join(test) if isinstance(test, list) else str(test)
    for var in sorted(set(re.findall(r'\$\$([A-Za-z_][A-Za-z0-9_]*)', text))):
        if not env.get(var):
            print("MISSING\t%s\t%s\tread by that service's healthcheck but never set" % (name, var))
    # An explicit marker for what compose cannot check: a value that arrives from an env_file
    # (compose validates that the file exists, never its contents), where an empty value is a
    # boot failure the image only reports at run time — after the app containers have been
    # recreated. Any service can name its own: `labels: {deploy.require: "A,B"}`.
    labels = s.get('labels') or {}
    if isinstance(labels, list):
        labels = dict(x.split('=', 1) for x in labels if '=' in x)
    required = str(labels.get('deploy.require') or '')
    for var in [v.strip() for v in required.split(',') if v.strip()]:
        if not env.get(var):
            print("MISSING\t%s\t%s\tnamed by this service's deploy.require label but never set" % (name, var))
PY
}

# The port mapping the resolved project would publish, as "[deploy]   <service>  <host> -> <container>".
# Used by --check: nothing is running yet, so `compose port` has nothing to report — and the
# *configured* mapping is what a host gets wrong (a missing override publishes 3000/4000 and
# collides with the scraper's API).
configured_ports_from_cfg() {
  python3 - "$CFG_JSON" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
for name, s in sorted((cfg.get('services') or {}).items()):
    for p in (s.get('ports') or []):
        host, target = p.get('published'), p.get('target')
        if host and target:
            print("[deploy]   %-10s %s -> %s/%s" % (name, host, target, p.get('protocol') or 'tcp'))
PY
}

if [ "$HAVE_PY" = true ]; then
  MISSING="$(missing_from_cfg || true)"
  if [ -n "$MISSING" ]; then
    echo "[deploy] ERROR: the '$PROFILE' profile needs variables this host does not provide:" >&2
    while IFS=$'\t' read -r _ svc var why; do
      [ -z "${svc:-}" ] && continue
      echo "[deploy]   - $svc: $var — $why" >&2
    done <<<"$MISSING"
    echo "[deploy] Add them to this checkout's gitignored env file (.env.local) and re-run." >&2
    echo "[deploy] NOTHING WAS TOUCHED — no container was built, recreated or restarted." >&2
    exit 2
  fi
  echo "[deploy] preflight: every variable the prod services need at start is present and non-empty"
else
  echo "[deploy] WARNING: python3 not found — skipping the env preflight and the dependency-ordered start" >&2
  if [ "$CHECK_ONLY" = true ]; then
    echo "[deploy] ERROR: --check needs python3 to read the resolved project" >&2
    exit 2
  fi
fi

# ── Check mode stops here ─────────────────────────────────────────────────────
# Everything above is read-only: the files exist, the project resolves, and no variable a service
# needs at start is missing. Report the shape of what would be deployed, then touch nothing.
if [ "$CHECK_ONLY" = true ]; then
  echo "[deploy] services, by dependency level:"
  while IFS=$'\t' read -r lvl svc; do
    [ -z "${svc:-}" ] && continue
    echo "[deploy]   level $lvl: $svc"
  done < <(levels_from_cfg || true)
  echo "[deploy] configured ports:"
  configured_ports_from_cfg
  echo "[deploy] CHECK ONLY — nothing was built, created or restarted."
  exit 0
fi

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

# ── Container-state helper ────────────────────────────────────────────────────
# A freshly recreated container reports health "starting" for its start_period, so a check that
# demands "healthy" immediately would fail every good deploy. Wait for the set to settle instead,
# and fail fast on anything genuinely wrong.
#
# `{{else}}none{{end}}` matters: a service without a healthcheck would otherwise emit an empty
# field, shifting OOMKilled/RestartCount into the wrong variables.
#
# wait_well <timeout-seconds> <service>...  →  0 well, 1 problems (reported in $PROBLEMS), 2 timeout
PROBLEMS=""
wait_well() {
  local timeout="$1"; shift
  local deadline=$((SECONDS + timeout)) ids
  while [ "$SECONDS" -lt "$deadline" ]; do
    PROBLEMS=""
    local pending=0 notrunning=0
    ids="$("${COMPOSE[@]}" ps -q "$@" 2>/dev/null || true)"
    if [ -n "$ids" ]; then
      # shellcheck disable=SC2086  # $ids is deliberately word-split: one arg per container id
      while read -r name state health oom restarts; do
        [ -z "$name" ] && continue
        name="${name#/}"
        notrunning=1
        case "$state" in running) ;; *) PROBLEMS="$PROBLEMS $name(state=$state)";; esac
        case "$health" in
          healthy|none) ;;
          starting) pending=$((pending + 1)) ;;
          *) PROBLEMS="$PROBLEMS $name(health=$health)" ;;
        esac
        [ "$oom" = "true" ] && PROBLEMS="$PROBLEMS $name(OOMKilled)"
        [ "${restarts:-0}" -gt 0 ] 2>/dev/null && PROBLEMS="$PROBLEMS $name(restarts=$restarts)"
      done < <(docker inspect $ids --format '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.OOMKilled}} {{.RestartCount}}' 2>/dev/null)
    else
      pending=1
    fi
    [ -n "$PROBLEMS" ] && return 1
    [ "$pending" -eq 0 ] && [ "$notrunning" = 1 ] && return 0
    sleep 1
  done
  return 2
}

dump_logs() {
  local svc
  for svc in "$@"; do
    echo "[deploy] --- last 30 log lines of $svc ---" >&2
    "${COMPOSE[@]}" logs --tail=30 "$svc" >&2 || true
  done
}

# ── Build + start, dependencies first ─────────────────────────────────────────
if [ "$HAVE_PY" = true ]; then
  PLAN="$(levels_from_cfg)"
  MAX_LEVEL="$(printf '%s\n' "$PLAN" | cut -f1 | sort -n | tail -1)"
  echo "[deploy] start plan (dependency depth):"
  while IFS=$'\t' read -r lvl svc; do
    [ -n "${svc:-}" ] && echo "[deploy]   level $lvl: $svc"
  done <<<"$PLAN"

  lvl=0
  while [ "$lvl" -le "$MAX_LEVEL" ]; do
    LVL_SVCS="$(printf '%s\n' "$PLAN" | awk -F'\t' -v l="$lvl" '$1 == l {print $2}' | tr '\n' ' ')"
    if [ -n "${LVL_SVCS// /}" ]; then
      if [ "$lvl" -lt "$MAX_LEVEL" ]; then
        echo "[deploy] dependency level $lvl: build + start $LVL_SVCS — the app services are not touched until these are healthy"
        # shellcheck disable=SC2086  # deliberate word-split: one arg per service
        "${COMPOSE[@]}" up -d --build $LVL_SVCS
        # shellcheck disable=SC2086
        if wait_well "$DEP_TIMEOUT" $LVL_SVCS; then
          echo "[deploy] dependency level $lvl healthy"
        else
          echo "[deploy] ERROR: dependency level $lvl did not come up well:$PROBLEMS" >&2
          # shellcheck disable=SC2086
          dump_logs $LVL_SVCS
          echo "[deploy] The deploy stopped here. The app containers were NOT recreated, so whatever was serving keeps serving." >&2
          exit 1
        fi
      else
        echo "[deploy] app level $lvl: build + start $LVL_SVCS (recreates changed services; the proxy blips for ~20s)"
        # shellcheck disable=SC2086
        "${COMPOSE[@]}" up -d --build $LVL_SVCS
      fi
    fi
    lvl=$((lvl + 1))
  done
else
  echo "[deploy] build + start (this recreates changed services; the proxy blips for ~20s)"
  "${COMPOSE[@]}" up -d --build
fi

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
  echo "[deploy] ERROR: proxy did not become healthy within ${HEALTH_TIMEOUT}s" >&2
  dump_logs proxy-prod
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
  echo "[deploy] ERROR: frontend did not return 200" >&2
  dump_logs app-prod
  exit 1
fi

# ── Gate 3: every service settled ─────────────────────────────────────────────
ids="$("${COMPOSE[@]}" ps -q)"
if [ -z "$ids" ]; then
  echo "[deploy] ERROR: no containers are running after up — refusing to report success" >&2
  exit 1
fi

ALL_SVCS="$("${COMPOSE[@]}" config --services | tr '\n' ' ')"
echo "[deploy] waiting up to ${SETTLE_TIMEOUT}s for containers to settle"
# shellcheck disable=SC2086
if wait_well "$SETTLE_TIMEOUT" $ALL_SVCS; then
  echo "[deploy] all containers settled"
else
  rc=$?
  if [ "$rc" = 1 ]; then
    echo "[deploy] ERROR: containers are not well after deploy:$PROBLEMS" >&2
  else
    echo "[deploy] ERROR: containers still not settled after ${SETTLE_TIMEOUT}s" >&2
  fi
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
