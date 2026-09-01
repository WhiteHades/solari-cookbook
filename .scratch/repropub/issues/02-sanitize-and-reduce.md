# 02: Sanitize and reduce while preserving the failure

Status: ready-for-agent

Blocked by: 01

## What to build

Turn the witnessed publication into synthetic content and remove unnecessary resources and structure. Keep a transformation only when a fresh witness preserves the same navigation failure.

## Acceptance criteria

- [ ] Metadata, source prose, identifiers, artwork references, scripts, and remote URLs are removed or replaced.
- [ ] Path traversal, oversized archives, and extraction limits fail safely.
- [ ] The reducer emits ordered accepted and rejected decisions.
- [ ] The final candidate is smaller and still returns `PRESERVED`.
- [ ] Leakage and convergence tests pass.

## Resolution evidence

Pending.
