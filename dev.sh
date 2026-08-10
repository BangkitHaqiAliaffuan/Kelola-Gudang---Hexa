#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$ROOT/.dev/logs"
mkdir -p "$LOGDIR"
BACKEND_LOG="$LOGDIR/backend.log"
FRONTEND_LOG="$LOGDIR/frontend.log"
NGROK_LOG="$LOGDIR/ngrok.log"
NGROK_URL_FILE="$LOGDIR/ngrok-url.txt"
BACKEND_URL="http://127.0.0.1:8000/api/master/categories"
FRONTEND_URL="http://localhost:8080/@vite/client"
NGROK_DOMAIN="${NGROK_DOMAIN:-}"
SKIP_TUNNEL="${SKIP_TUNNEL:-}"

is_windows() {
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

port_in_use() {
  netstat -ano 2>/dev/null | grep -i listening | grep -E "[:.]$1( |\$)" >/dev/null
}

win_pid() {
  ps -W 2>/dev/null | awk -v p="$1" '$1 == p { print $4 }'
}

kill_port_tree() {
  local port="$1" pids pid
  pids="$(netstat -ano 2>/dev/null | grep -i listening | grep -E "[:.]$port( |\$)" | awk '{print $NF}' | sort -u)"
  [ -z "$pids" ] && return 0
  for pid in $pids; do
    if [ "$pid" -eq 0 ] 2>/dev/null; then continue; fi
    taskkill //T //F //PID "$pid" >/dev/null 2>&1 || true
  done
}

# --- Tunnel ngrok (opsional, untuk akses backend dari frontend produksi Vercel) ---
start_tunnel() {
  [ "$SKIP_TUNNEL" = "1" ] && { echo "⏭ Tunnel ngrok dilewati (SKIP_TUNNEL=1)."; return; }
  if ! command -v ngrok >/dev/null 2>&1; then
    echo "⚠ ngrok tidak ditemukan — tunnel dilewati (frontend produksi tidak dapat mencapai backend)."
    return
  fi
  local extra=()
  [ -n "$NGROK_DOMAIN" ] && extra=(--url="$NGROK_DOMAIN")
  echo "▶ Tunnel (ngrok)      → http://127.0.0.1:8000 | log: $NGROK_LOG"
  (exec ngrok http 8000 --log=stdout --log-format=json "${extra[@]}") >"$NGROK_LOG" 2>&1 &
  NGROK_PID=$!
}

wait_for_tunnel() {
  local tries=0 url=""
  until url="$(curl -sf --max-time 3 "http://127.0.0.1:4040/api/tunnels" | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)" && [ -n "$url" ]; do
    tries=$((tries + 1))
    if [ "$tries" -ge 15 ]; then
      echo "⚠ Tunnel ngrok tidak kunjung siap — lihat $NGROK_LOG."
      return 1
    fi
    sleep 1
  done
  NGROK_PUBLIC_URL="$url"
  NGROK_API_URL="${url%/}/api"
  printf '%s\n' "$NGROK_PUBLIC_URL" >"$NGROK_URL_FILE"
  echo "✓ Tunnel ngrok siap → $NGROK_PUBLIC_URL"
  echo ""
  echo "⚠ Koneksi produksi (Vercel):"
  echo "   Set VITE_API_URL=\"$NGROK_API_URL\" → Project Settings → Environment Variables → Redeploy."
  echo "   (URL ngrok berubah tiap restart — update env & redeploy tiap kali.)"
  if is_windows && command -v clip >/dev/null 2>&1; then
    printf '%s' "$NGROK_API_URL" | clip && echo "   ✓ VITE_API_URL disalin ke clipboard."
  fi
  echo ""
  echo "▶ Clearing Laravel config cache agar SANCTUM_STATEFUL_DOMAINS fresh..."
  (cd "$ROOT/Backend" && php artisan config:clear) \
    && echo "   ✓ Config cache cleared." \
    || echo "   ⚠ Gagal clear config cache — jalankan manual: php artisan config:clear"
}

BACKEND_PID=""
FRONTEND_PID=""
NGROK_PID=""
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Menghentikan server..."
  if is_windows; then
    for pid in "$BACKEND_PID" "$FRONTEND_PID" "$NGROK_PID"; do
      [ -n "$pid" ] || continue
      wp="$(win_pid "$pid")"
      if [ -n "$wp" ]; then
        taskkill //T //F //PID "$wp" >/dev/null 2>&1 || true
      else
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done
    kill_port_tree 8000
    kill_port_tree 8080
    kill_port_tree 4040
  else
    set -m
    [ -n "$BACKEND_PID" ] && { kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" || true; }
    [ -n "$FRONTEND_PID" ] && { kill -- -"$FRONTEND_PID" 2>/dev/null || kill "$FRONTEND_PID" || true; }
    [ -n "$NGROK_PID" ] && { kill -- -"$NGROK_PID" 2>/dev/null || kill "$NGROK_PID" || true; }
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Memeriksa port..."
port_in_use 8000 && {
  echo "✗ Port 8000 sudah terpakai (backend berjalan?). Matikan dulu: taskkill //PID <pid> //F"
  exit 1
}
port_in_use 8080 && {
  echo "✗ Port 8080 sudah terpakai (frontend berjalan?). Matikan dulu."
  exit 1
}
port_in_use 4040 && {
  echo "⚠ Port 4040 terpakai (ngrok lain berjalan?). Tunnel dilewati."
  SKIP_TUNNEL=1
}

echo "▶ Backend (Laravel)   → $BACKEND_URL   | log: $BACKEND_LOG"
(cd "$ROOT/Backend" && exec php artisan serve) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "▶ Frontend (Vite)     → http://localhost:8080  | log: $FRONTEND_LOG"
(cd "$ROOT/Frontend" && exec npm run dev) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

start_tunnel

wait_for() {
  local url="$1" name="$2" tries=0 timeout="${4:-5}"
  until curl -sf -o /dev/null --max-time "$timeout" "$url"; do
    tries=$((tries + 1))
    if [ "$tries" -ge "$3" ]; then
      echo "⚠ $name tidak kunjung siap — lihat log."
      return 1
    fi
    sleep 1
  done
  echo "✓ $name siap."
}
wait_for "$BACKEND_URL" "Backend" 60 || true
wait_for "$FRONTEND_URL" "Frontend" 30 3 || true
[ -n "$NGROK_PID" ] && wait_for_tunnel || true

echo "Ctrl+C untuk menghentikan kedua server."
tail -n +1 -F "$BACKEND_LOG" "$FRONTEND_LOG"
