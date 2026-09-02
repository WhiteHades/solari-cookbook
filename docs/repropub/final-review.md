# ReproPub final review

Date: 2026-09-02

Scope: `feat/repropub` into `main` through pull request #1.

## Evidence reviewed

- Repository instructions, domain glossary, specification, delivery tickets, and ADRs.
- Archive parser and writer, EPUB inspection, sanitization, reducer, oracle, witness, evidence publisher, resource lifecycle, Solari adapter, server, CLI, dashboard, and focused tests.
- Pull-request workflow run `33581065283` and its complete job log.
- Generated demo bundle and its receipt, privacy report, reduction log, raw observation, reduced EPUB, and visual witness.
- Desktop result screenshot at 1440 px and mobile result screenshot at 390 px.

## Standards review

Result: **pass**. No unresolved high-severity finding.

- The implementation follows the repository instructions and keeps ReproPub under one canonical example directory.
- Verdicts are derived from executed observations. The interface keeps `PRESERVED`, `LOST`, `BLOCKED`, and `INCONCLUSIVE` distinct.
- EPUB input is bounded before extraction. The parser rejects traversal, duplicate entries, symlinks, encryption, unsupported methods, ZIP64, CRC mismatches, excessive entry counts, excessive expanded size, and extreme compression ratios.
- Sanitization removes or replaces metadata, prose, scripts, event handlers, remote references, and SVG artwork, then reruns the witness before accepting the result.
- The reducer retains only candidates that are both smaller and still produce `PRESERVED`; candidates that remove the failure are recorded and rejected.
- Shareable evidence is hashed and scanned for source prose, Solari key shapes, signed-token parameters, bearer credentials, and absolute home paths.
- Browser, browser client, and sandbox cleanup paths are covered by focused tests. Cleanup outcomes remain visible in the receipt.
- The server binds to loopback by default, limits request bodies, permits one active run, normalizes artifact paths, and serves only receipt-listed artifacts.
- The dashboard uses visible focus, keyboard activation, reduced-motion handling, responsive layout, shadcn-style primitives, and attributed beUI source patterns.
- Third-party source attribution is preserved in `THIRD_PARTY_NOTICES.md`.

## Specification review

Result: **pass for the stated first-release scope**. No unresolved high-severity finding.

The implementation satisfies the completion criteria in `.scratch/repropub/spec.md`:

- The synthetic EPUB reproduces a deterministic encoded-fragment navigation failure.
- A corrected fragment-resolution control returns `LOST`.
- Sanitization preserves the failure while removing the inspected sensitive values.
- Structure-aware reduction produces a smaller valid EPUB and records every accepted and rejected transformation.
- The bundle contains the reduced EPUB, maintainer report, receipt, privacy report, reduction log, raw observation, and visual evidence.
- Repeated runs produce stable publication and scenario hashes.
- The local CLI, production dashboard, strict type checks, focused core tests, bundle verification, production build, and Chromium smoke journey pass in CI.
- Solari support is implemented behind the same witness model and fails before provisioning when no authorized key exists.

## Executed verification

Pull-request workflow run `33581065283` completed successfully on the merge ref. It recorded:

- 11 focused tests passed, 0 failed.
- Demo verdict `PRESERVED`.
- 5,629-byte source reduced to 2,325 bytes, 59% smaller.
- Seven hashed artifacts verified with no receipt errors.
- Production Vite build completed.
- Desktop and 390 px mobile Chromium journeys completed.
- Nine reduction decisions and seven downloadable artifacts were displayed.
- Browser console error list was empty.
- The workflow uploaded the complete proof artifact with SHA-256 `c93c7d62637d75268189aff6e9dcedbeb04fa83eb8a9ee3cdef1428549a2b575`.

The downloaded workflow screenshots were inspected after that run. The desktop and mobile layouts showed no visible clipping, horizontal overflow, missing controls, or broken content hierarchy.

## Known boundaries

These are explicit product boundaries, not hidden passes:

- The first release proves one objective EPUB 3 navigation failure. It is not yet a general visual-bug reducer.
- The Solari protocol path is implemented and tested with controlled adapters, but a real Solari session has not been executed because no authorized `SOLARI_API_KEY` was available in the build environment.
- The local dashboard is safe for loopback use. A public hosted deployment would need authentication, per-user quotas, durable job storage, and spending controls.
- Sanitization reduces privacy and copyright risk. It is not legal clearance.
- Product-market-fit evidence must come from real maintainers and reporters; it is not part of the technical merge gate and must not be fabricated.

## Merge recommendation

Merge pull request #1 after its required workflow is green. Preserve the two external validation gates as openly documented follow-up work rather than representing them as completed evidence.
