#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required but is not available." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for service health monitoring." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg and FFprobe are required for local video development." >&2
  exit 1
fi

if [ ! -d "$BACKEND_DIR/node_modules" ] || [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Dependencies are missing. Run npm install in backend/ and frontend/ first." >&2
  exit 1
fi

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

FRONTEND_PORT="${FRONTEND_PORT:-15766}"
BACKEND_PORT=15765
MONITOR_INTERVAL_SECONDS="${DEV_MONITOR_INTERVAL_SECONDS:-2}"
LOG_DIR="$ROOT_DIR/.dev/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
backend_pid=""
frontend_pid=""
docker_services=()
started_at="$(date '+%s')"
tui_enabled=false

GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
GRAY=$'\033[90m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

if [ ! -t 1 ]; then
  GREEN=""
  YELLOW=""
  RED=""
  GRAY=""
  BOLD=""
  RESET=""
fi

mkdir -p "$LOG_DIR"
: > "$BACKEND_LOG"
: > "$FRONTEND_LOG"

# Invoked indirectly by the traps below.
# shellcheck disable=SC2329
terminate_process_group() {
  local leader_pid="$1"
  if [ -n "$leader_pid" ] && kill -0 -- "-$leader_pid" 2>/dev/null; then
    kill -TERM -- "-$leader_pid" 2>/dev/null || true
  fi
}

# Invoked indirectly by the traps below.
# shellcheck disable=SC2329
cleanup() {
  trap - EXIT INT TERM

  if declare -F leave_tui >/dev/null 2>&1; then
    leave_tui
  fi

  echo
  echo "Stopping local development services..."

  terminate_process_group "$frontend_pid"
  terminate_process_group "$backend_pid"

  [ -z "$frontend_pid" ] || wait "$frontend_pid" 2>/dev/null || true
  [ -z "$backend_pid" ] || wait "$backend_pid" 2>/dev/null || true
}

on_signal() {
  exit 0
}

trap cleanup EXIT
trap on_signal INT TERM

cd "$ROOT_DIR"

port_is_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
  else
    return 1
  fi
}

require_free_port() {
  local service="$1"
  local port="$2"
  if ! port_is_in_use "$port"; then
    return
  fi
  echo "Cannot start $service: port $port is already in use." >&2
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
  fi
  exit 1
}

# A previously-running application container would occupy the same host
# ports as the local dev servers. Dependency containers are left untouched.
docker compose stop backend frontend >/dev/null

while IFS= read -r service; do
  case "$service" in
    backend|frontend) ;;
    *) docker_services+=("$service") ;;
  esac
done < <(docker compose config --services)

if [ "${#docker_services[@]}" -gt 0 ]; then
  echo "Starting Docker services: ${docker_services[*]}"
  docker compose up -d --no-deps "${docker_services[@]}"
else
  echo "No Docker dependency services are currently declared."
fi

require_free_port "backend" "$BACKEND_PORT"
require_free_port "frontend" "$FRONTEND_PORT"

echo "Starting backend locally on http://localhost:$BACKEND_PORT"
set -m
(
  cd "$BACKEND_DIR"
  exec env PORT="$BACKEND_PORT" FRONTEND_PORT="$FRONTEND_PORT" npm run start:dev
) >"$BACKEND_LOG" 2>&1 &
backend_pid=$!

echo "Starting frontend locally on http://localhost:$FRONTEND_PORT"
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
) >"$FRONTEND_LOG" 2>&1 &
frontend_pid=$!
set +m

local_service_state() {
  local pid="$1"
  local url="$2"

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "stopped"
  elif curl --fail --silent --show-error --max-time 2 "$url" >/dev/null 2>&1; then
    echo "healthy"
  elif [ $(( $(date '+%s') - started_at )) -lt 30 ]; then
    echo "starting"
  else
    echo "unhealthy"
  fi
}

docker_service_state() {
  local service="$1"
  local container_id
  container_id="$(docker compose ps -q "$service" 2>/dev/null | sed -n '1p')"
  if [ -z "$container_id" ]; then
    echo "stopped"
    return
  fi
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo "unknown"
}

docker_service_ports() {
  local service="$1"
  local ports
  ports="$(docker compose ps "$service" --format '{{.Ports}}' 2>/dev/null | sed -n '1p')"
  if [ -n "$ports" ]; then
    echo "$ports"
  else
    echo "no published ports"
  fi
}

enter_tui() {
  if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
    tui_enabled=true
    tput smcup
    tput civis
  fi
}

leave_tui() {
  if [ "$tui_enabled" = true ]; then
    tput cnorm 2>/dev/null || true
    tput rmcup 2>/dev/null || true
    tui_enabled=false
  fi
}

format_state() {
  local state="$1"
  local color="$GRAY"
  case "$state" in
    healthy|running) color="$GREEN" ;;
    starting|created|restarting|paused) color="$YELLOW" ;;
    unhealthy|stopped|exited|dead) color="$RED" ;;
  esac
  printf '%b●%b %s' "$color" "$RESET" "$state"
}

format_uptime() {
  local total_seconds="$1"
  local hours=$((total_seconds / 3600))
  local minutes=$(((total_seconds % 3600) / 60))
  local seconds=$((total_seconds % 60))
  printf '%02d:%02d:%02d' "$hours" "$minutes" "$seconds"
}

render_dashboard() {
  local backend_state="$1"
  local frontend_state="$2"
  local now
  local service
  now="$(date '+%s')"

  if [ "$tui_enabled" = true ]; then
    tput cup 0 0
    tput ed
  else
    echo
  fi

  printf '%bFotify Development%b  %s  Uptime %s\n' "$BOLD" "$RESET" "$(date '+%Y-%m-%d %H:%M:%S')" "$(format_uptime $((now - started_at)))"
  printf '%s\n\n' "────────────────────────────────────────────────────────────────────────────────"
  printf '%-16s %-10s %-26s %s\n' "SERVICE" "RUNTIME" "PORT / URL" "STATUS"
  printf '%-16s %-10s %-26s %b\n' "backend" "local" "http://localhost:$BACKEND_PORT" "$(format_state "$backend_state")"
  printf '%-16s %-10s %-26s %b\n' "frontend" "local" "http://localhost:$FRONTEND_PORT" "$(format_state "$frontend_state")"
  for service in "${docker_services[@]}"; do
    printf '%-16s %-10s %-26s %b\n' "$service" "docker" "$(docker_service_ports "$service")" "$(format_state "$(docker_service_state "$service")")"
  done

  printf '\n%bLogs%b\n' "$BOLD" "$RESET"
  printf '  Backend   %s\n' "$BACKEND_LOG"
  printf '  Frontend  %s\n' "$FRONTEND_LOG"
  for service in "${docker_services[@]}"; do
    printf '  %-9s docker compose logs %s\n' "$service" "$service"
  done
  printf '\n%bControls%b\n' "$BOLD" "$RESET"
  printf '  Ctrl+C    Stop local services and exit\n'
}

print_failure_log() {
  local service="$1"
  local log_file="$2"
  leave_tui
  echo
  echo "$service stopped. Last 30 log lines from $log_file:"
  tail -n 30 "$log_file" || true
}

enter_tui

# Bash 3.2 (still shipped by macOS) has no `wait -n`, so poll both children
# and stop the other local process as soon as either dev server exits.
last_snapshot=""
while true; do
  backend_state="$(local_service_state "$backend_pid" "http://localhost:$BACKEND_PORT/settings")"
  frontend_state="$(local_service_state "$frontend_pid" "http://localhost:$FRONTEND_PORT/")"
  docker_snapshot=""
  for service in "${docker_services[@]}"; do
    docker_snapshot="$docker_snapshot|$service:$(docker_service_state "$service")"
  done
  snapshot="$backend_state|$frontend_state$docker_snapshot"

  if [ "$tui_enabled" = true ] || [ "$snapshot" != "$last_snapshot" ]; then
    render_dashboard "$backend_state" "$frontend_state"
    last_snapshot="$snapshot"
  fi

  if [ "$backend_state" = "stopped" ]; then
    print_failure_log "backend" "$BACKEND_LOG"
    exit 1
  fi
  if [ "$frontend_state" = "stopped" ]; then
    print_failure_log "frontend" "$FRONTEND_LOG"
    exit 1
  fi

  sleep "$MONITOR_INTERVAL_SECONDS"
done
