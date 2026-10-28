---
description: Start the sippy-ng React dev server via the sippy-dev MCP tool
---

# Sippy dev — frontend (sippy-ng)

Use the **`sippy_ng_start`** MCP tool (server: **`sippy-dev`**). Do not run `npm start` in `sippy-ng` manually — the MCP tool handles background process management, log routing, and duplicate detection.

**`open_browser`** defaults to **`false`**. Typical URL: **`http://127.0.0.1:3000`**. Log: **`sippy-dev-logs/sippy_ng_start.log`**.

The frontend calls the backend API as soon as it loads, so make sure **`sippy_serve`** has reported *ready* (not just started) before starting it.

The tool reports success only after the dev server URL answers; it polls on the already-running path too. If it reports that the process is running but the URL is not responding, check `sippy-dev-logs/sippy_ng_start.log` before sending the user to the app. Raise **`ready_timeout_seconds`** (default 180) if the initial build is slow.

If the dev server is already running, the tool will report it. Ask the user if they want to restart, and if so call again with **`restart=True`**.

See **`mcp/server.py`** for all parameters.