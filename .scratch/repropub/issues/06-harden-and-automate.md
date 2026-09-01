# 06: Harden the runnable product and automate verification

Status: in-progress

Blocked by: 04, 05

## What to build

Add focused CI, archive abuse limits, cancellation and timeout behavior, redaction checks, production server health, and a browser smoke journey that preserves evidence as workflow artifacts.

## Acceptance criteria

- [ ] CI runs type checks, core tests, demo bundle generation, production build, and Chromium smoke flow.
- [ ] Archive boundary and cleanup failures are covered without a sprawling test suite.
- [ ] Generated output and temporary files are isolated and ignored.
- [ ] The production server exposes health, run, status, and safe artifact endpoints.
- [ ] Workflow artifacts include the demo bundle and dashboard screenshot.

## Resolution evidence

Pending.
