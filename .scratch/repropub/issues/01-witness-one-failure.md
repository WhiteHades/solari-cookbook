# 01: Witness one EPUB navigation failure

Status: ready-for-agent

Blocked by: None

## What to build

Create a strict TypeScript core that generates a synthetic EPUB, runs it through a deterministic target reader, executes one navigation scenario, and returns a `PRESERVED` verdict with raw observations.

## Acceptance criteria

- [ ] The generated EPUB is structurally readable by ReproPub.
- [ ] The target, scenario, oracle, and environment are explicit inputs.
- [ ] A known wrong-target failure produces `PRESERVED` from executed observations.
- [ ] A corrected candidate produces `LOST`.
- [ ] Focused core tests and type checking pass.

## Resolution evidence

Pending.
