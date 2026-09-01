# 01: Witness one EPUB navigation failure

Status: resolved

Blocked by: None

## What to build

Create a strict TypeScript core that generates a synthetic EPUB, runs it through a deterministic target reader, executes one navigation scenario, and returns a `PRESERVED` verdict with raw observations.

## Acceptance criteria

- [x] The generated EPUB is structurally readable by ReproPub.
- [x] The target, scenario, oracle, and environment are explicit inputs.
- [x] A known wrong-target failure produces `PRESERVED` from executed observations.
- [x] A corrected candidate produces `LOST`.
- [x] Focused core tests and type checking pass.

## Resolution evidence

`npm run check:core` passed on 2026-09-02: 2 tests, 0 failures. The legacy target observed `chapter-2` and returned `PRESERVED`; the decoded target observed `target section` and returned `LOST`.
