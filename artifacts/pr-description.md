Fixes [TRT-2753](https://redhat.atlassian.net/browse/TRT-2753).

A first visit to `/sippy-ng` now redirects to `/sippy-ng/` before React loads. Registering the exact canonical route enables Gorilla mux's slash normalization while preserving query parameters. The shared SPA handler also trims trailing slashes from filesystem lookups so deep links with either slash form reach the application.

Adds routing regression tests and documents the embedded frontend URL.

Validation:

- Playwright passed five fresh Chromium contexts against the production server and embedded React build, with API fixtures: bare and canonical roots, query/fragment preservation, both deep-link slash forms, reloads, asset loading, and no JavaScript errors. Neighboring paths still return 404.
- Regression tests reproduce the original failures with the fixes removed and pass with the final implementation.
- `make test` passed: 14,971 Go tests (27 skipped), 13 Jest tests, and 54 MCP tests.
- `go vet ./pkg/...`, `go build -mod=vendor ./cmd/...`, `GENERATE_SOURCEMAP=false make frontend`, Go lint, ESLint, gofmt, and `git diff --check` passed.
- The full e2e suite passed with a temporary copy of `scripts/e2e.sh` using an isolated database, Redis logical database, ports, and log path: 108 tests, one skipped. Read results in `/tmp/trt-2753/e2e-test.log`.

Gate limitations: `make lint` fails at `npm audit --omit=dev` with eight findings in the unchanged lockfile (three low, two moderate, one high, two critical). A final default `make e2e` rerun failed because other connections prevented resetting its shared test database; the isolated final run above passed. No repository test tooling, CI configuration, generated tracked files, or dependencies were changed.
