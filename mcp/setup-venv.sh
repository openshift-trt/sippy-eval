#!/bin/sh
# Creates mcp/.venv and installs the MCP server's runtime and test dependencies.
# Shared by run.sh (editor entry point) and the `test-mcp` make target so the
# bootstrap logic lives in one place.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
REQUIREMENTS="$SCRIPT_DIR/requirements-dev.txt"
STAMP="$VENV_DIR/.requirements-stamp"

# cksum is POSIX and avoids the sha256sum/shasum split between Linux and macOS.
want_stamp="$(cat "$SCRIPT_DIR/requirements.txt" "$REQUIREMENTS" | cksum)"

# Nothing to do when the venv was built from the current requirements. Keeps
# repeated `make test-mcp` and MCP server starts fast and offline-friendly.
if [ -x "$VENV_PYTHON" ] && [ "$(cat "$STAMP" 2>/dev/null || true)" = "$want_stamp" ]; then
    exit 0
fi

PYTHON="${PYTHON:-}"
if [ -z "$PYTHON" ]; then
    for candidate in python3.12 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            PYTHON="$candidate"
            break
        fi
    done
fi

if [ -z "$PYTHON" ]; then
    echo "mcp/setup-venv.sh: no python3 interpreter found in PATH (Python 3.12 or newer required)" >&2
    exit 1
fi

if [ ! -x "$VENV_PYTHON" ]; then
    rm -rf "$VENV_DIR"
    "$PYTHON" -m venv "$VENV_DIR"
fi

# uv is what the devcontainer uses and is considerably faster; fall back to pip
# so a plain `python -m venv` checkout still works.
if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$VENV_PYTHON" -q -r "$REQUIREMENTS"
else
    "$VENV_PYTHON" -m pip install --upgrade pip -q
    "$VENV_PYTHON" -m pip install -q -r "$REQUIREMENTS"
fi

printf '%s\n' "$want_stamp" > "$STAMP"
