# 04: Add the live Solari witness

Status: in-progress

Blocked by: 03

## What to build

Add a production adapter that prepares a target in Solari Sandbox and verifies it in an independent recorded Solari Browser, while preserving the local mode and the same witness interface.

## Acceptance criteria

- [ ] The adapter uses idempotent sandbox creation, explicit command arguments, preview ports, and idempotent deletion.
- [ ] The browser requests recording and releases the session in all paths.
- [ ] Retries are bounded to documented transient statuses; rate limits fail visibly.
- [ ] Missing credentials fail closed before creating resources.
- [ ] Unit tests prove cleanup and redaction with fake adapters.
- [ ] Documentation distinguishes implemented live support from actually executed live proof.

## Resolution evidence

Pending.
