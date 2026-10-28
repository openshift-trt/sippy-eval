#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/setup-venv.sh"

exec "$SCRIPT_DIR/.venv/bin/python" "$SCRIPT_DIR/server.py" "$@"
