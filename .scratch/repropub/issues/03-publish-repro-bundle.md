# 03: Publish a verifiable repro bundle

Status: resolved

Blocked by: 02

## What to build

Expose the local pipeline through a CLI and publish the reduced EPUB, human report, receipt, reduction log, privacy report, and evidence files as one deterministic bundle.

## Acceptance criteria

- [x] One command produces a complete bundle from the synthetic fixture.
- [x] The receipt pins hashes, target, environment, mode, verdict, artifacts, duration, and cleanup.
- [x] The bundle contains no secret-shaped values, original prose, signed URLs, or absolute host paths.
- [x] A repeated run produces stable publication and scenario hashes.
- [x] The highest-seam end-to-end test passes.

## Resolution evidence

`npm run check:core`, `npm run demo`, and `npm run verify:demo` passed on 2026-09-02. The bundle contains 7 hashed artifacts plus `receipt.json`; verification checked all 7. Repeated runs produced the same reduced-publication and scenario hashes. A source/secret/path scan was clean.
