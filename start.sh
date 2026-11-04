#!/usr/bin/env bash
# Starts the check-in app (macOS and Linux). Run from a terminal:
#   ./start.sh                         start with the last saved password ("admin" the first time)
#   ./start.sh --password hunter2      set a new admin password (saved; logs everyone out)
#   ./start.sh --port 8081             use another port (default 8080)
#   ./start.sh --no-open               don't open the scanner page in a browser
set -uo pipefail
cd "$(dirname "$0")"

PORT=8080
PASSWORD=""
OPEN=1
NAME=scanner
VOLUME=scanner-data

usage() { sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; }
fail()  { echo; echo "ERROR: $*" >&2; echo; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--password) [ $# -ge 2 ] && [ -n "$2" ] || fail "--password needs a value, e.g. --password hunter2"; PASSWORD="$2"; shift 2 ;;
    --password=*)  PASSWORD="${1#*=}"; [ -n "$PASSWORD" ] || fail "--password needs a value"; shift ;;
    --port)        [ $# -ge 2 ] || fail "--port needs a value, e.g. --port 8081"; PORT="$2"; shift 2 ;;
    --port=*)      PORT="${1#*=}"; shift ;;
    --no-open)     OPEN=0; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             echo "Unknown option: $1"; echo; usage; exit 1 ;;
  esac
done
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || fail "--port must be a number from 1 to 65535"

OS="$(uname)"
echo "=== Check-in ==="

command -v docker >/dev/null 2>&1 || fail "Docker isn't installed.
Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again."

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if [ "$OS" = "Darwin" ]; then
    echo "Starting Docker Desktop (this can take a minute)..."
    open -a Docker 2>/dev/null || fail "Couldn't open Docker Desktop. Open it manually and run this again."
  elif docker info 2>&1 | grep -qi "permission denied"; then
    echo "Docker needs admin rights on this machine - you may be asked for your password."
    DOCKER="sudo docker"
  else
    echo "Starting Docker..."
    sudo systemctl start docker 2>/dev/null || systemctl --user start docker-desktop 2>/dev/null || true
  fi
  for _ in $(seq 60); do $DOCKER info >/dev/null 2>&1 && break; sleep 2; done
  $DOCKER info >/dev/null 2>&1 || fail "Docker isn't running. Start Docker, wait for it to finish loading, then run this again."
fi

echo "Building app..."
$DOCKER build -q -t "$NAME" . >/dev/null || fail "Build failed (see messages above)."

echo "Starting app..."
$DOCKER rm -f "$NAME" >/dev/null 2>&1 || true
ENVARGS=(-e TZ="${TZ:-America/New_York}")
[ -n "$PASSWORD" ] && ENVARGS+=(-e "ADMIN_PASSWORD=$PASSWORD")
$DOCKER run -d --name "$NAME" --restart unless-stopped -p "$PORT:8080" -v "$VOLUME:/data" "${ENVARGS[@]}" "$NAME" >/dev/null \
  || fail "Couldn't start the app. Is port $PORT already in use? If the old checkin or id-scanner app is running, stop it first, or try: ./start.sh --port 8081"

# Wait until the server answers.
if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 30); do curl -fs "http://localhost:$PORT/api/status" >/dev/null 2>&1 && break; sleep 1; done
else
  sleep 3
fi

# This computer's address on the local network, for links from other devices.
if [ "$OS" = "Darwin" ]; then
  IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$IP" ] || IP="$(ip route get 1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src") print $(i+1)}')"
fi

SCANNER="http://localhost:$PORT/"
echo
echo "Running!"
echo "  Scanner screen (this computer): $SCANNER"
echo "  Admin (this computer):          http://localhost:$PORT/admin"
if [ -n "${IP:-}" ]; then
  echo "  Admin (other devices on WiFi):  http://$IP:$PORT/admin"
  echo "  Exit door / public count:       http://$IP:$PORT/checkout   http://$IP:$PORT/count"
fi
if [ -n "$PASSWORD" ]; then echo "  Admin password: set to the one you passed with --password"
else echo "  Admin password: unchanged (\"admin\" unless you've set one with --password)"; fi
echo
echo "The app keeps running in the background and starts again whenever Docker starts."
echo "Run ./stop.sh to turn it off. Your data is kept."

if [ "$OPEN" = 1 ]; then
  if [ "$OS" = "Darwin" ]; then open "$SCANNER"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$SCANNER" >/dev/null 2>&1 &
  fi
fi
