Fixes [TRT-2795](https://redhat.atlassian.net/browse/TRT-2795).

Test Analysis discarded the dimension from regression variants before comparing them with filters. A `Platform:gcp` filter therefore compared against `gcp` and hid matching regressions. Compare complete variant entries so matching active regressions remain visible, preserving case-insensitive membership and combined inclusion/exclusion filters.

Add 11 component tests covering the reproducer, distinct variant dimensions, multiple filters, negation, default exclusions, missing variants, closed regressions, empty results, and filter changes without refetching. Seven cases fail against the original implementation; all 11 pass with the fix.

Validation:

- `make test ARTIFACT_DIR=/tmp/TRT-2795-test-artifacts`: passed, Go reports 13,940 tests with 27 skipped, all 30 Jest tests pass, and all 53 Python tests pass.
- `go vet ./pkg/...`, `make verify-migrations`, modified-file ESLint/Prettier, and `git diff --check`: passed.
- `npm run build`: passed.
- Playwright with Chromium against the production bundle and controlled API fixtures: five scenarios passed (default, GCP inclusion, combined GCP/arm64, GCP exclusion, and no matches), with no browser runtime errors. Playwright MCP was unavailable, so the installed Playwright package was used directly.
- `make lint`: failed at `npm audit --omit=dev`, reporting five vulnerabilities in unchanged dependencies (two moderate, one high, two critical). Go lint reported zero issues and repository ESLint passed.
- `make e2e`: failed with shared test database and port conflicts. The complete E2E suite then passed using a temporary copy of the same script with a unique database, API/metrics ports, Redis database, and log filename: 120 tests, one skipped. The repository script is unchanged. The isolated run's log was read at `/tmp/TRT-2795-e2e-isolated.log`.

A screenshot was captured at `/tmp/TRT-2795-platform-gcp.png`. Screenshot upload was not performed under the restrictions on external writes and `gh`, so no hosted image link is available. PR publication is left to the pipeline.
