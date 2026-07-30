#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

if [ ! -x "$VENV_DIR/bin/python" ]; then
    rm -rf "$VENV_DIR"
    if command -v uv > /dev/null 2>&1; then
        uv venv "$VENV_DIR"
        uv pip install --python "$VENV_DIR/bin/python" -r "$SCRIPT_DIR/requirements.txt" -q
    else
        python3 -m venv "$VENV_DIR"
        "$VENV_DIR/bin/pip" install --upgrade pip -q
        "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q
    fi
fi

exec "$VENV_DIR/bin/pytest" "$SCRIPT_DIR/test_server.py" "$@"
