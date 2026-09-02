# ReproPub reproduction aa00cae2f7ed93f5

## Result

**PRESERVED** — the reduced synthetic EPUB still reaches `chapter-2` where the scenario expects `target section`.

## Reproduce

1. Open `repro.epub` in the target reader `fixture-reader@legacy-fragment-resolver`.
2. Select the navigation entry `Synthetic text 4.`.
3. Observe the active target.
4. Expected: `target section`.
5. Observed in the witness run: `chapter-2`.

## Reduction

- Original: 5,629 bytes
- Sanitized: 4,862 bytes
- Reduced: 2,325 bytes
- Reduction: 59%
- Accepted transformations: 6/9

## Trust and privacy

- Verdict source: executed navigation observations
- Sensitive values inspected: 27
- Sensitive values remaining after sanitization: 0
- Original publication prose is not included in this report.
- This bundle lowers sharing risk; it is not a legal opinion or copyright clearance.

## Evidence

- `receipt.json` pins the scenario, target, environment, hashes, verdict, artifacts, and cleanup state.
- `reduction-log.jsonl` records every accepted and rejected candidate.
- `privacy-report.json` records sanitization actions without copying sensitive values.
- `observations/navigation.json` contains the raw oracle input.
- `evidence/navigation-witness.svg` is a rendered summary of the observed mismatch.
- `replay-reference.txt` states whether a cloud recording exists.
