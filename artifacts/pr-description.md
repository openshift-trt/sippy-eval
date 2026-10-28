Fixes [TRT-2660](https://redhat.atlassian.net/browse/TRT-2660).

Opening the component readiness regressed tests modal can crash when a test comparison serializes `explanations` as `null`. Initialize the slice in both the component report and test details constructors so comparisons without explanations serialize it as `[]`.

Also make `CompSeverityIcon` accept both `null` and `undefined`, retaining the status tooltip when explanations are absent. The defensive guard described in Jira was missing from this checkout. Document the corrected response shape in the API README.

Validation:

- Passed: focused component readiness tests, including provider and middleware packages (`go test -p 2 ./pkg/api/componentreadiness/...`).
- Passed: full Go package suite (`go test -p 2 ./pkg/...`, 31 test-bearing packages). The first run failed because the sandbox prohibited the websocket test's local listener; the retry with local socket access passed.
- Passed: `go vet -p 2 ./pkg/...`, `gofmt` on both modified Go files, Prettier on the modified frontend file, and `git diff --check`.
- Failed before tests/lint ran: `make test` and `make lint`. Their npm bootstrap could not write the read-only npm user configuration.
- Blocked: scoped frontend ESLint could not load the missing `eslint-plugin-babel` dependency.
- Blocked: direct frontend `npm test` failed because `jest-worker/build/base/BaseWorkerPool.js` is missing. `react-scripts` is also absent, so frontend tests did not run.
- Not run: E2E; this XS initialization/guard fix was validated with existing unit tests and static checks, with no test files changed.

Scope: XS, an isolated initialization and null-guard correction. Followed the supplied `jira-solve --ci` workflow through direct implementation and validation because the referenced `implement` skill is unavailable. No delegation, CI configuration changes, generated-file changes in the commit, push, or PR creation. Publication is left to the pipeline.
