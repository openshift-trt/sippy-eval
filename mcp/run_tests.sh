#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv-test"

if [ ! -x "$VENV_DIR/bin/python" ]; then
    rm -rf "$VENV_DIR"
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip -q
fi

"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q
exec "$VENV_DIR/bin/python" -m pytest "$SCRIPT_DIR/test_server.py" "$@"
