# 03: Publish a verifiable repro bundle

Status: ready-for-agent

Blocked by: 02

## What to build

Expose the local pipeline through a CLI and publish the reduced EPUB, human report, receipt, reduction log, privacy report, and evidence files as one deterministic bundle.

## Acceptance criteria

- [ ] One command produces a complete bundle from the synthetic fixture.
- [ ] The receipt pins hashes, target, environment, mode, verdict, artifacts, duration, and cleanup.
- [ ] The bundle contains no secret-shaped values, original prose, signed URLs, or absolute host paths.
- [ ] A repeated run produces stable publication and scenario hashes.
- [ ] The highest-seam end-to-end test passes.

## Resolution evidence

Pending.
