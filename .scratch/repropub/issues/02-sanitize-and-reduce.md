# 02: Sanitize and reduce while preserving the failure

Status: resolved

Blocked by: 01

## What to build

Turn the witnessed publication into synthetic content and remove unnecessary resources and structure. Keep a transformation only when a fresh witness preserves the same navigation failure.

## Acceptance criteria

- [x] Metadata, source prose, identifiers, artwork references, scripts, and remote URLs are removed or replaced.
- [x] Path traversal, oversized archives, and extraction limits fail safely.
- [x] The reducer emits ordered accepted and rejected decisions.
- [x] The final candidate is smaller and still returns `PRESERVED`.
- [x] Leakage and convergence tests pass.

## Resolution evidence

`npm run check:core` passed on 2026-09-02: 6 tests, 0 failures. Sanitization reported 0 remaining sensitive values. Reduction produced a 2,325-byte publication from the 4,862-byte sanitized baseline, with one spine item and one navigation entry. Both failure-removing candidates returned `LOST` and were rejected.
