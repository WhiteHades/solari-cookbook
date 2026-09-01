# 07: Publish the cookbook submission

Status: in-progress

Blocked by: 06

## What to build

Finish the product README, add a concise featured entry to the cookbook root, publish verified sample evidence, review the complete diff against standards and specification, and prepare the challenge submission surface.

## Acceptance criteria

- [x] The example README explains the problem, use, architecture, security, limits, local proof, and live Solari status.
- [x] The root README links to ReproPub without duplicating its documentation.
- [x] Claims are backed by executed checks or explicitly marked unverified.
- [x] The branch passes CI and a manual final browser inspection.
- [ ] Standards and specification reviews have no unresolved high-severity finding.

## Resolution evidence

The canonical product README and concise root feature entry are published. Executed sample evidence is committed under `examples/repropub-ts/demo/`. GitHub Actions run `33564266507` passed the full workflow, and the desktop, completed desktop, and 390 px reduced-motion mobile screenshots were manually inspected without visible clipping, overflow, broken controls, or console errors. Final standards/spec review is in progress.
