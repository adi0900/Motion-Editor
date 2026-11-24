#!/bin/bash
set -euo pipefail
DIR="/Users/shadowslave/.t3/projects/motionviz/2026-11-24-motioncut-editor"
PORT="${PORT:-4321}"
if lsof -i :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "MotionCut Pro already running on http://127.0.0.1:$PORT"
else
  nohup node "$DIR/server.mjs" > "$DIR/server.log" 2>&1 &
  sleep 1
  echo "Started MotionCut Pro at http://127.0.0.1:$PORT (log: $DIR/server.log)"
fi
