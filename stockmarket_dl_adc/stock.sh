#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  stock  —  Ticker-Teller v1.1 launcher
#
#  USAGE
#    ./stock.sh              Start both backend + frontend
#    ./stock.sh restart      Kill and restart both services
#    ./stock.sh stop         Kill all running services
#    ./stock.sh install      Install 'stock' as a global command
#    ./stock.sh uninstall    Remove the global command
#    ./stock.sh backend      Start backend only
#    ./stock.sh frontend     Start frontend only
#    ./stock.sh deps         Install all Python + Node dependencies
#    ./stock.sh --help       Show this help
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
R='\033[0;31m'    # red
G='\033[0;32m'    # green
Y='\033[1;33m'    # yellow
C='\033[0;36m'    # cyan
B='\033[0;34m'    # blue
M='\033[0;35m'    # magenta
W='\033[1;37m'    # white bold
D='\033[2;37m'    # dim
N='\033[0m'       # reset
BOLD='\033[1m'

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-detect project root: look for backend/ and frontend/ siblings
if [[ -d "$SCRIPT_DIR/backend" && -d "$SCRIPT_DIR/frontend" ]]; then
  PROJECT_ROOT="$SCRIPT_DIR"
elif [[ -d "$SCRIPT_DIR/../backend" && -d "$SCRIPT_DIR/../frontend" ]]; then
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  PROJECT_ROOT="$SCRIPT_DIR"
fi

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=5173
VENV_DIR="$BACKEND_DIR/.venv"

# PIDs to track for cleanup
BACKEND_PID=""
FRONTEND_PID=""

# ── Banner ────────────────────────────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${C}  ╔══════════════════════════════════════════════════════════════════════════════════════════╗${N}"
  echo -e "${C}  ║${N}  ${BOLD}${W}📈  TICKER-TELLER  v1.1${N}                                                                 ${C}║${N}"
  echo -e "${C}  ║${N}  ${D}CNN → BiLSTM → Attention  ×  Monte Carlo  ×  ADC Risk  ×  31 Features${N}                   ${C}║${N}"
  echo -e "${C}  ╚══════════════════════════════════════════════════════════════════════════════════════════╝${N}"
  echo ""
}

# ── Helpers ───────────────────────────────────────────────────────────────────
log_info()    { echo -e "  ${C}◈${N}  $*"; }
log_ok()      { echo -e "  ${G}✔${N}  $*"; }
log_warn()    { echo -e "  ${Y}⚠${N}  $*"; }
log_err()     { echo -e "  ${R}✖${N}  $*" >&2; }
log_section() { echo -e "\n  ${M}━━  ${BOLD}$*${N}\n"; }

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    log_err "Required command not found: ${BOLD}$1${N}"
    log_err "Please install it and try again."
    exit 1
  fi
}

port_in_use() { lsof -iTCP:"$1" -sTCP:LISTEN -t &>/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":$1 "; }

wait_for_port() {
  local port=$1 label=$2 attempts=0 max=90
  printf "  ${D}Waiting for %s on :%s " "$label" "$port"
  while ! port_in_use "$port"; do
    printf "."
    sleep 1
    attempts=$((attempts + 1))
    if [[ $attempts -ge $max ]]; then
      echo ""
      log_warn "$label did not start within ${max}s — check logs above."
      return 1
    fi
  done
  echo ""
  return 0
}

# ── Kill ports ────────────────────────────────────────────────────────────────
kill_ports() {
  log_info "Clearing port ${BACKEND_PORT} (backend)…"
  lsof -ti:"$BACKEND_PORT" | xargs kill -9 2>/dev/null || true

  log_info "Clearing port ${FRONTEND_PORT} (frontend)…"
  lsof -ti:"$FRONTEND_PORT" | xargs kill -9 2>/dev/null || true

  # Also clear 5174 in case Vite drifted to it
  lsof -ti:5174 | xargs kill -9 2>/dev/null || true

  sleep 1
  log_ok "All ports cleared."
}

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log_section "Shutting down"

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log_info "Stopping frontend  (PID $FRONTEND_PID)…"
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log_info "Stopping backend   (PID $BACKEND_PID)…"
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  sleep 0.5

  echo ""
  echo -e "  ${D}Goodbye.${N}"
  echo ""
}
trap cleanup EXIT INT TERM

# ── Python venv setup ─────────────────────────────────────────────────────────
setup_venv() {
  if [[ ! -d "$VENV_DIR" ]]; then
    log_info "Creating Python virtual environment…"
    python3 -m venv "$VENV_DIR"
  fi
  # shellcheck source=/dev/null
  source "$VENV_DIR/bin/activate"
}

# ── Install dependencies ──────────────────────────────────────────────────────
install_deps() {
  log_section "Installing Dependencies"
  require_cmd python3
  require_cmd node
  require_cmd npm

  # Python
  setup_venv
  if [[ -f "$BACKEND_DIR/requirements.txt" ]]; then
    log_info "Installing Python packages…"
    pip install --quiet --upgrade pip
    pip install --quiet -r "$BACKEND_DIR/requirements.txt"
    log_ok "Python dependencies installed."
  else
    log_warn "No requirements.txt found at $BACKEND_DIR/requirements.txt"
    log_info "Installing core packages manually…"
    pip install --quiet --upgrade pip
    pip install --quiet \
      fastapi uvicorn[standard] \
      yfinance pandas numpy scikit-learn \
      torch \
      pydantic
    log_ok "Core Python packages installed."
  fi

  # Node
  if [[ -f "$FRONTEND_DIR/package.json" ]]; then
    log_info "Installing Node packages (npm ci / install)…"
    cd "$FRONTEND_DIR"
    if [[ -f "package-lock.json" ]]; then
      npm ci --silent
    else
      npm install --silent
    fi
    cd "$PROJECT_ROOT"
    log_ok "Node dependencies installed."
  else
    log_warn "No package.json found at $FRONTEND_DIR/package.json"
  fi

  echo ""
  log_ok "${BOLD}All dependencies ready.${N}"
}

# ── Start backend ─────────────────────────────────────────────────────────────
start_backend() {
  if [[ ! -d "$BACKEND_DIR" ]]; then
    log_err "Backend directory not found: $BACKEND_DIR"
    exit 1
  fi

  setup_venv

  if port_in_use "$BACKEND_PORT"; then
    log_warn "Port $BACKEND_PORT already in use — assuming backend is running."
    return 0
  fi

  log_info "Starting FastAPI backend on ${BOLD}http://localhost:${BACKEND_PORT}${N}…"
  cd "$BACKEND_DIR"
  uvicorn main:app \
    --host 0.0.0.0 \
    --port "$BACKEND_PORT" \
    --reload \
    --log-level warning \
    >> "$PROJECT_ROOT/.backend.log" 2>&1 &
  BACKEND_PID=$!
  cd "$PROJECT_ROOT"

  if wait_for_port "$BACKEND_PORT" "FastAPI"; then
    log_ok "Backend running  (PID $BACKEND_PID)  →  http://localhost:${BACKEND_PORT}/docs"
  fi
}

# ── Start frontend ────────────────────────────────────────────────────────────
start_frontend() {
  if [[ ! -d "$FRONTEND_DIR" ]]; then
    log_err "Frontend directory not found: $FRONTEND_DIR"
    exit 1
  fi

  # Ensure node_modules exist
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log_warn "node_modules not found. Running npm install…"
    cd "$FRONTEND_DIR" && npm install --silent && cd "$PROJECT_ROOT"
  fi

  if port_in_use "$FRONTEND_PORT"; then
    log_warn "Port $FRONTEND_PORT already in use — assuming frontend is running."
    return 0
  fi

  log_info "Starting Vite dev server on ${BOLD}http://localhost:${FRONTEND_PORT}${N}…"
  cd "$FRONTEND_DIR"
  # --host 0.0.0.0  → binds all interfaces so Codespaces can forward the port
  # tee             → writes to .frontend.log AND stdout so Codespaces
  #                   auto-detects the port from the "Local: http://..." line
  npm run dev -- --port "$FRONTEND_PORT" --host 0.0.0.0 \
    2>&1 | tee -a "$PROJECT_ROOT/.frontend.log" &
  FRONTEND_PID=$!
  cd "$PROJECT_ROOT"

  if wait_for_port "$FRONTEND_PORT" "Vite"; then
    log_ok "Frontend running  (PID $FRONTEND_PID)  →  http://localhost:${FRONTEND_PORT}"
  fi
}

# ── Open browser ──────────────────────────────────────────────────────────────
open_browser() {
  local url="http://localhost:${FRONTEND_PORT}"
  # Only attempt to open a browser in a desktop environment.
  # Codespaces / headless CI have neither xdg-open nor open, so we skip
  # silently — the URL is already printed to the terminal.
  if command -v xdg-open &>/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    sleep 1
    xdg-open "$url" &>/dev/null &
  elif command -v open &>/dev/null && [[ "$(uname)" == "Darwin" ]]; then
    sleep 1
    open "$url" &
  fi
  # No-op in Codespaces / headless — user follows the printed URL
}

# ── Install global command ────────────────────────────────────────────────────
install_cmd() {
  local link_target="/usr/local/bin/stock"

  chmod +x "$SCRIPT_PATH"

  if [[ -f "$link_target" ]] || [[ -L "$link_target" ]]; then
    log_warn "'stock' command already exists at $link_target"
    read -r -p "  Overwrite? [y/N] " ans
    [[ "${ans,,}" == "y" ]] || { log_info "Aborted."; exit 0; }
  fi

  if [[ -w "/usr/local/bin" ]]; then
    ln -sf "$SCRIPT_PATH" "$link_target"
  else
    log_info "Needs sudo to write to /usr/local/bin:"
    sudo ln -sf "$SCRIPT_PATH" "$link_target"
  fi

  log_ok "Installed: type ${BOLD}stock${N} from anywhere to launch Ticker-Teller."

  if ! command -v stock &>/dev/null; then
    local profile="${HOME}/.bashrc"
    [[ -f "${HOME}/.zshrc" ]] && profile="${HOME}/.zshrc"
    echo "" >> "$profile"
    echo "# Ticker-Teller" >> "$profile"
    echo 'export PATH="/usr/local/bin:$PATH"' >> "$profile"
    log_info "Added /usr/local/bin to PATH in $profile — run ${BOLD}source $profile${N} or open a new terminal."
  fi
}

# ── Uninstall global command ──────────────────────────────────────────────────
uninstall_cmd() {
  local link_target="/usr/local/bin/stock"
  if [[ -L "$link_target" ]]; then
    if [[ -w "/usr/local/bin" ]]; then
      rm "$link_target"
    else
      sudo rm "$link_target"
    fi
    log_ok "Removed 'stock' command from /usr/local/bin."
  else
    log_warn "No 'stock' command found at /usr/local/bin/stock"
  fi
}

# ── Help ──────────────────────────────────────────────────────────────────────
show_help() {
  print_banner
  echo -e "  ${BOLD}USAGE${N}"
  echo -e "    ${C}stock${N}                  Start backend + frontend"
  echo -e "    ${C}stock restart${N}          Kill and restart both services"
  echo -e "    ${C}stock stop${N}             Kill all running services"
  echo -e "    ${C}stock install${N}          Install 'stock' as a global command"
  echo -e "    ${C}stock uninstall${N}        Remove the global command"
  echo -e "    ${C}stock deps${N}             Install Python + Node dependencies"
  echo -e "    ${C}stock backend${N}          Start backend only"
  echo -e "    ${C}stock frontend${N}         Start frontend only"
  echo -e "    ${C}stock --help${N}           Show this help"
  echo ""
  echo -e "  ${BOLD}QUICK START${N}"
  echo -e "    ${D}1. Install dependencies (first time only):${N}"
  echo -e "       ${C}./stock.sh deps${N}"
  echo -e "    ${D}2. Install global command:${N}"
  echo -e "       ${C}./stock.sh install${N}"
  echo -e "    ${D}3. Run from anywhere:${N}"
  echo -e "       ${C}stock${N}"
  echo ""
  echo -e "  ${BOLD}PORTS${N}"
  echo -e "    Backend  →  ${C}http://localhost:${BACKEND_PORT}${N}  (FastAPI + SSE)"
  echo -e "    Frontend →  ${C}http://localhost:${FRONTEND_PORT}${N}  (React / Vite)"
  echo -e "    API Docs →  ${C}http://localhost:${BACKEND_PORT}/docs${N}"
  echo ""
  echo -e "  ${BOLD}LOGS${N}"
  echo -e "    ${D}.backend.log   →  $PROJECT_ROOT/.backend.log${N}"
  echo -e "    ${D}.frontend.log  →  $PROJECT_ROOT/.frontend.log${N}"
  echo ""
}

# ── Preflight checks ──────────────────────────────────────────────────────────
preflight() {
  require_cmd python3
  require_cmd node
  require_cmd npm

  if [[ ! -d "$VENV_DIR" ]]; then
    log_warn "Python venv not found. Run '${BOLD}stock deps${N}' first if packages are missing."
  fi
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log_warn "node_modules not found. Will attempt npm install during startup."
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
CMD="${1:-start}"

case "$CMD" in
  start|"")
    print_banner
    preflight
    log_section "Starting Ticker-Teller"
    start_backend
    start_frontend
    open_browser

    echo ""
    echo -e "  ${G}${BOLD}✔  All systems up!${N}"
    echo ""
    echo -e "  ${C}◈${N}  App     →  ${BOLD}http://localhost:${FRONTEND_PORT}${N}"
    echo -e "  ${C}◈${N}  API     →  ${BOLD}http://localhost:${BACKEND_PORT}/docs${N}"
    echo -e "  ${C}◈${N}  Logs    →  ${D}.backend.log  /  .frontend.log${N}"
    echo ""
    echo -e "  ${D}Press Ctrl+C to stop.${N}"
    echo ""

    # Only wait on PIDs that were actually spawned by this invocation.
    # If a service was already running (port in use), its PID is empty
    # and passing it to wait would cause an immediate error-exit.
    WAIT_PIDS=()
    [[ -n "$BACKEND_PID" ]]  && WAIT_PIDS+=("$BACKEND_PID")
    [[ -n "$FRONTEND_PID" ]] && WAIT_PIDS+=("$FRONTEND_PID")

    if [[ ${#WAIT_PIDS[@]} -gt 0 ]]; then
      wait "${WAIT_PIDS[@]}" 2>/dev/null || true
    else
      # Both services were already running — just block until Ctrl+C
      while true; do sleep 60; done
    fi
    ;;

  restart)
    print_banner
    log_section "Restarting Ticker-Teller"
    kill_ports
    preflight
    start_backend
    start_frontend
    open_browser

    echo ""
    echo -e "  ${G}${BOLD}✔  Restarted!${N}"
    echo ""
    echo -e "  ${C}◈${N}  App     →  ${BOLD}http://localhost:${FRONTEND_PORT}${N}"
    echo -e "  ${C}◈${N}  API     →  ${BOLD}http://localhost:${BACKEND_PORT}/docs${N}"
    echo -e "  ${C}◈${N}  Logs    →  ${D}.backend.log  /  .frontend.log${N}"
    echo ""
    echo -e "  ${D}Press Ctrl+C to stop.${N}"
    echo ""

    WAIT_PIDS=()
    [[ -n "$BACKEND_PID" ]]  && WAIT_PIDS+=("$BACKEND_PID")
    [[ -n "$FRONTEND_PID" ]] && WAIT_PIDS+=("$FRONTEND_PID")

    if [[ ${#WAIT_PIDS[@]} -gt 0 ]]; then
      wait "${WAIT_PIDS[@]}" 2>/dev/null || true
    else
      while true; do sleep 60; done
    fi
    ;;

  stop)
    print_banner
    log_section "Stopping Ticker-Teller"
    kill_ports
    trap - EXIT   # Don't double-print "Goodbye."
    echo ""
    echo -e "  ${G}${BOLD}✔  All services stopped.${N}"
    echo ""
    ;;

  backend)
    print_banner
    preflight
    log_section "Starting Backend Only"
    start_backend
    echo ""
    echo -e "  ${D}Press Ctrl+C to stop.${N}"
    wait "$BACKEND_PID" 2>/dev/null || true
    ;;

  frontend)
    print_banner
    log_section "Starting Frontend Only"
    start_frontend
    echo ""
    echo -e "  ${D}Press Ctrl+C to stop.${N}"
    wait "$FRONTEND_PID" 2>/dev/null || true
    ;;

  deps|install-deps|dependencies)
    print_banner
    install_deps
    ;;

  install)
    print_banner
    install_cmd
    ;;

  uninstall)
    print_banner
    uninstall_cmd
    ;;

  --help|-h|help)
    show_help
    trap - EXIT
    ;;

  *)
    log_err "Unknown command: '$CMD'"
    echo -e "  Run ${C}stock --help${N} for usage."
    exit 1
    ;;
esac
