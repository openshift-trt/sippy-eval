# TRT-2698: Run MCP server tests with make test

## Summary

- Add a standalone `make test-mcp` target and include it in `make test`, so CI
  invoking the standard target also runs the MCP pytest suite.
- Bootstrap and reuse the ignored MCP virtual environment, with test-only
  dependencies in `mcp/requirements-test.txt`. Reinstall dependencies when either
  requirements file changes.
- Write separate MCP JUnit results to `mcp/junit.xml` locally, or
  `junit-mcp.xml` in the configured artifact directory.
- Make data-mode tests independent of whether `.devcontainer/.env` exists. The
  baseline suite had two failures on a clean checkout because mocked dotenv
  contents were ignored when the file was absent.
- Document prerequisites, focused execution, and test reports in `mcp/README.md`.

## Validation

- PASS: complete `make test` with an explicit temporary artifact directory:
  - MCP: 54 passed.
  - Go: 15,024 tests, 25 skipped, no failures or errors.
  - Frontend: 1 Jest suite, 13 tests passed.
- PASS: standalone MCP target, including default and custom JUnit report paths.
- PASS: clean virtual-environment bootstrap in an isolated temporary checkout,
  including dependency installation and all 54 MCP tests.
- PASS: an intentionally failing temporary pytest test makes both `test-mcp`
  and `test` exit nonzero; no failure probe is added to the repository.
- PASS: JUnit contents and Make dry-runs for environment reuse and dependency
  refresh after either requirements file changes; `git diff --check`.
- Initial sandboxed attempts hit read-only npm configuration, blocked dependency
  downloads, and stalled asynchronous tests. The relevant checks passed when
  rerun with approval outside the sandbox.
- Not run: `make lint` or `make e2e`; no Go/JavaScript application code, APIs,
  database behavior, CI configuration, or generated files change.

## Scope And Delivery

Size S: isolated test integration with one test-isolation fixture. Implementation
and validation were performed serially using manual equivalents of
`implement -> check-gates`; the named workflow skills were not installed.
The feature branch is committed locally only. Publishing and PR creation are
left to the pipeline.
