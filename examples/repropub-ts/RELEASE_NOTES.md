# ReproPub v0.1.0-rc.1

ReproPub turns a hard-to-share EPUB navigation bug into a smaller synthetic fixture and a verifiable evidence bundle.

## Included

- Safe EPUB ZIP and package inspection with archive limits and path validation.
- Deterministic metadata, prose, script, event-handler, remote-reference, and SVG-artwork sanitization.
- Structure-aware reduction that keeps a transformation only when the candidate is smaller and an executed oracle still returns `PRESERVED`.
- Explicit `PRESERVED`, `LOST`, `BLOCKED`, and `INCONCLUSIVE` verdicts.
- A command-line workflow and a responsive review dashboard.
- A hashed bundle containing the reduced EPUB, maintainer instructions, receipt, privacy report, reduction log, raw observation, and visual evidence.
- A Solari Sandbox plus recorded Browser adapter with bounded retries, credential redaction, and reverse-order cleanup.
- Focused tests and GitHub Actions verification.

## Verified release candidate

The release workflow regenerates the synthetic demonstration from source and verifies it before publishing assets. The expected result is:

- 11 focused tests pass.
- The deterministic navigation case returns `PRESERVED`.
- The original 5,629-byte fixture reduces to 2,325 bytes, a 59% reduction.
- Seven receipt-listed artifacts pass SHA-256 verification.
- The production dashboard builds.
- Desktop and 390 px mobile Chromium journeys pass without console errors.

## Current boundary

This release candidate proves one objective EPUB 3 navigation failure. It does not yet promise general visual-bug diagnosis, Android or iOS execution, DRM support, legal clearance, automatic reader repair, PDF or CBZ reduction, hosted multi-user accounts, or billing.

The Solari production path is implemented and protocol-tested. A real recorded Solari run is not included in this release because the build environment has no authorized `SOLARI_API_KEY`. Local evidence is marked as local and cannot impersonate an independent Solari witness.

Real product-market-fit evidence must come from maintainers and reporters using authorized cases. No adoption claim is included in this release.
