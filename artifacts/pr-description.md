Fixes [TRT-2678](https://redhat.atlassian.net/browse/TRT-2678).

`sippy_serve` could report an existing `go run` process as running while the backend was still compiling or initializing. Both existing and newly spawned backends now wait for a successful `GET /api/releases` before reporting readiness, using the existing 120-second polling window. This prevents clients from starting the frontend against an unavailable API.

Timeouts report the checked endpoint, process ID(s), log path, and log tail while leaving the detached process available for inspection or a later readiness check. Listen addresses are normalized to HTTP URLs, including wildcard and IPv6 addresses. Successful probe responses are closed, duplicate detection and restart behavior are preserved, and the MCP README documents startup and recovery.

Validation:

- MCP suite: **65 passed**, including 16 new regression cases covering delayed readiness, connection and HTTP errors, timeout, early exit, existing/new/restarted processes, and listen addresses. The initial run had two pre-existing data-mode test failures because `.devcontainer/.env` was absent; the complete passing run used a temporary empty file, removed afterward.
- Local HTTP smoke test: passed; an existing backend returned HTTP 503 first and was reported ready only after `/api/releases` returned HTTP 200, without spawning another process.
- `make test`: passed; Go reported 15,021 tests with 26 skipped, and Jest passed all 13 tests.
- `go build -o /tmp/TRT-2678-sippy ./cmd/sippy`: passed.
- `make lint`: **failed** at the existing production dependency audit with 8 vulnerabilities (3 low, 2 moderate, 1 high, 2 critical). Go lint reported zero issues and ESLint passed. Dependency upgrades are outside this ticket.
- Python compilation and `git diff --check`: passed.
- E2E tests were not run for this Python MCP change. `make verify-apm` was not run because it regenerates files; no APM sources, generated files, or CI configuration were changed.

Size S: localized MCP readiness behavior using the existing polling helper. Workflow: `jira-solve --ci` → `implement` → `check-gates`. Implementation acceptance criteria are satisfied; the full lint gate remains blocked by existing dependency vulnerabilities. Delivery is a local commit; the pipeline publishes the branch and creates the PR.
