# 04: Add the live Solari witness

Status: resolved

Blocked by: 03

## What to build

Add a production adapter that prepares a target in Solari Sandbox and verifies it in an independent recorded Solari Browser, while preserving the local mode and the same witness interface.

## Acceptance criteria

- [x] The adapter uses idempotent sandbox creation, explicit command arguments, preview ports, and idempotent deletion.
- [x] The browser requests recording and releases the session in all paths.
- [x] Retries are bounded to documented transient statuses; rate limits fail visibly.
- [x] Missing credentials fail closed before creating resources.
- [x] Unit tests prove cleanup and redaction with fake adapters.
- [x] Documentation distinguishes implemented live support from actually executed live proof.

## Resolution evidence

`npm run check:core` passed on 2026-09-02: 11 tests, 0 failures. Protocol tests verified one retry-safe 503 create with an unchanged idempotency key, no retry on 429, replay polling only for 404, redacted capability identifiers, and reverse cleanup after browser failure. `npm run solari-demo` failed before provisioning with the expected missing-key error. The exact Python reader harness uploaded by the adapter was compiled, served locally, clicked in Chromium, and visually inspected; it observed `chapter-2` while expecting `target section`. Live Solari proof remains unexecuted because this runtime has no `SOLARI_API_KEY`.
