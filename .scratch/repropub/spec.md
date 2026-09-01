# ReproPub specification

Status: ready-for-agent

## Problem statement

Ebook-reader maintainers often receive EPUB failures that cannot be reproduced because the original publication is private, copyrighted, large, or structurally complex. The reporter needs a way to produce a small synthetic fixture without losing the failure.

## Solution

ReproPub inspects an EPUB, executes a scenario against a pinned target reader, sanitizes sensitive content, removes unnecessary structure, and emits a repro bundle. Every retained transformation is verified by the same oracle. A final independent witness run records the result.

The product lives entirely under `examples/repropub-ts/` in this fork. It includes a CLI, a polished dashboard, a deterministic local witness, and a live Solari Sandbox plus Browser witness.

## User stories

1. As a maintainer, I can reproduce a reported EPUB failure without receiving the original commercial publication.
2. As a reporter, I can remove prose, metadata, identifiers, artwork, fonts, and remote links while retaining the failure.
3. As a maintainer, I can see the exact target, scenario, oracle, viewport, locale, and hashes used in the run.
4. As a reviewer, I can distinguish observed execution from AI-generated interpretation.
5. As a user, I receive `PRESERVED`, `LOST`, `BLOCKED`, or `INCONCLUSIVE` instead of a forced success state.
6. As a user, I can limit candidates, wall time, archive size, file count, and extracted bytes.
7. As a user, I can cancel a run and trust that resources are cleaned up.
8. As a contributor, I can run the full synthetic demonstration without cloud credentials.
9. As a Solari user, I can run the same witness through isolated Sandbox and recorded Browser adapters.
10. As a reviewer, I can understand a run from a responsive dashboard and download its artifacts.
11. As a maintainer, I can inspect an ordered reduction log explaining every accepted and rejected change.
12. As a security reviewer, I can confirm that secrets, signed URLs, source paths, and original prose are absent from the bundle.

## Implementation decisions

- TypeScript with strict type checking.
- Deep public seams: `inspectPublication`, `sanitizePublication`, `reducePublication`, `runWitness`, `judgeObservation`, `publishBundle`, and `withRunResources`.
- A small safe ZIP implementation supports stored and deflated EPUB entries with archive limits and path validation.
- The first oracle compares the selected navigation target with the expected target. The second detects element overlap from captured geometry.
- Reduction is deterministic and structure-aware. It removes unused resources, unrelated spine items, metadata, text blocks, navigation entries, and CSS rules.
- Local and Solari modes satisfy the same witness interface. Evidence identifies the mode.
- The web dashboard uses React, shadcn-style primitives, and a copied/adapted beUI activity timeline. The CLI and engine do not depend on the UI.
- Original input is temporary. Demo fixtures are synthetic and permissively shareable.

## Testing decisions

- Test public behavior rather than private helper calls.
- Core tests cover hostile archive paths and limits, sanitization leakage, deterministic oracles, reducer convergence, evidence hashes, and resource cleanup.
- One end-to-end test creates the synthetic failing EPUB, runs the full local reduction, and verifies the repro bundle.
- CI builds the dashboard, runs the core suite, executes the demo, starts the production server, and performs a Chromium smoke flow with screenshots.

## Out of scope

DRM, legal guarantees, private repositories, automatic code fixes, mobile or proprietary desktop device emulation, PDF/CBZ reduction, hosted accounts, and billing.

## Completion criteria

- The local demo reduces a synthetic EPUB and preserves a known navigation failure.
- The output bundle contains a valid `repro.epub`, report, receipt, reduction log, privacy report, and visual evidence.
- Core checks and Chromium smoke flow pass.
- Live Solari adapters are implemented against official interfaces and fail safely without credentials.
- The product README states exactly which paths were and were not executed.
