# 06: Harden the runnable product and automate verification

Status: resolved

Blocked by: 04, 05

## What to build

Add focused CI, archive abuse limits, cancellation and timeout behavior, redaction checks, production server health, and a browser smoke journey that preserves evidence as workflow artifacts.

## Acceptance criteria

- [x] CI runs type checks, core tests, demo bundle generation, production build, and Chromium smoke flow.
- [x] Archive boundary and cleanup failures are covered without a sprawling test suite.
- [x] Generated output and temporary files are isolated and ignored.
- [x] The production server exposes health, run, status, and safe artifact endpoints.
- [x] Workflow artifacts include the demo bundle and dashboard screenshot.

## Resolution evidence

The permanent `.github/workflows/repropub.yml` workflow passed in GitHub Actions run `33564266507` on Node.js 24. It installed Chromium, passed strict core and web type checking, ran all 11 focused tests, generated and verified the demo bundle, built the dashboard, completed desktop and mobile browser journeys, and uploaded both the bundle and screenshots. Archive traversal/limit tests and Solari failure-path cleanup tests passed. The production server exposes health, latest-run, start-run, run-status, and receipt-allowlisted artifact endpoints; it limits request bodies, permits one active run, bounds live execution, and stores generated output only below `.tmp/repropub/`.
