## Summary

- Fix `sippy_serve` MCP tool to verify the HTTP API is actually responding before reporting the server as ready, instead of relying solely on process detection
- Apply the same readiness check to `sippy_ng_start` which had the identical bug
- Extract URL polling into a reusable `_poll_url` helper to eliminate duplication between the "already running" and "newly spawned" code paths

## Problem

During local dev startup, `go run ./cmd/sippy serve` takes 30-60+ seconds to compile and initialize. The MCP tool detects the `go run` process and reports "already running" even though the HTTP API isn't serving yet. This causes a cascading failure:

1. `sippy_serve` detects the compiling process and reports ready
2. `sippy_ng_start` starts the frontend on :3000
3. Frontend fetches `/api/releases` against a backend that isn't ready
4. Fetch fails, app enters a degraded state

## Changes

**`mcp/server.py`:**
- Added `_poll_url()` — a general-purpose URL readiness poller that accepts an optional PID-based liveness check
- Refactored `_wait_for_ready()` to delegate to `_poll_url()`, removing duplicated polling logic
- Modified `sippy_serve`'s "already running" path to poll the HTTP endpoint (up to 120s) before reporting ready; returns a clear error if the API doesn't respond
- Applied the same fix to `sippy_ng_start`

**`mcp/test_server.py`:**
- Added `TestPollUrl` with 5 tests covering: immediate success, timeout, process exit during wait, eventual success after retries, and behavior without alive_check

## Test plan

- [x] All new `TestPollUrl` tests pass
- [x] All pre-existing tests continue to pass (2 pre-existing `TestDataMode` failures are unrelated — caused by env file in devcontainer)
- [ ] Manual: start `sippy_serve` when backend is still compiling — tool should wait for HTTP readiness instead of immediately reporting "already running"
- [ ] Manual: call `sippy_serve` when backend is already up — should respond quickly with "already running"
- [ ] Manual: start `sippy_ng_start` when dev server is still starting — tool should wait for HTTP readiness

Always review AI generated responses prior to use.
Generated with [Claude Code](https://claude.com/claude-code) via openshift-developer plugin
