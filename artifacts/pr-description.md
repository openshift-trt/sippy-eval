## Summary

- **TRT-2678**: Fix `sippy_serve` MCP tool to poll the HTTP endpoint before reporting the backend as ready when a process is already running
- Previously, the "already running" path returned immediately after detecting PIDs without verifying the API was accepting requests, causing cascading failures when downstream tools (e.g. `sippy_ng_start`) assumed the backend was available
- Extend `_wait_for_ready` to accept a PID for liveness checks (via `os.kill(pid, 0)`) alongside the existing `subprocess.Popen` path

## Test plan

- [x] New unit tests for `_wait_for_ready` with PID-based liveness (ready, dead PID, timeout)
- [x] New unit tests for `sippy_serve` "already running" path (ready, not ready, process died)
- [x] Existing `_wait_for_ready` behavior with `subprocess.Popen` is preserved (backward-compatible)
- [ ] Manual: start `sippy serve` via `go run`, call `sippy_serve` MCP tool while compiling, verify it waits for readiness instead of returning immediately

Always review AI generated responses prior to use.
Generated with [Claude Code](https://claude.com/claude-code) via openshift-developer plugin
