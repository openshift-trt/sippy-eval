---
description: "Start both Sippy backend and frontend dev servers"
---

# Sippy dev — backend + frontend

Start the full local Sippy stack using two MCP tool calls (server: **`sippy-dev`**). Run them in order — backend first, then frontend.

1. **`sippy_serve`** — defaults are derived from `SIPPY_DATA_MODE` (`seed` or `prod-like`). In `prod-like` mode, pass **`bigquery_credentials_file`** when `SIPPY_BIGQUERY_CREDENTIALS_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` are not set.
2. **`sippy_ng_start`**

Each tool returns listen hints (typically **8080** / **3000**) and log paths, and only reports ready after its HTTP endpoint answers. **Do not call `sippy_ng_start` until `sippy_serve` reports ready** — the frontend fetches `/api/releases` on load, and against a backend that is still compiling it degrades and component readiness fails.

If `sippy_serve` reports that the process is running but the API is not responding, fix that before starting the frontend: read `sippy-dev-logs/sippy_serve.log`, then retry or restart.

If a tool reports already running, ask the user if they want to restart it. If yes, call the tool again with **`restart=True`**.
