# ReproPub launch copy

Do not publish the final challenge post until the credentialed Solari proof exists. Replace bracketed fields only with measured evidence.

## X draft

Ebook-reader bugs often stall because the triggering EPUB is private, copyrighted, or too large to share.

I built ReproPub: it sanitizes the publication, removes structure that does not matter, and keeps each reduction only when an executed oracle proves the failure still occurs.

Verified local release candidate:
- 5,629 B → 2,325 B
- 59% smaller
- 0 inspected sensitive values remaining
- 11 focused tests
- hashed repro bundle + desktop/mobile proof

The Solari path runs the target in an isolated Sandbox and witnesses it in a separately recorded Browser. [Add the real replay and live-run result here after ticket 08 is complete.]

Repo: https://github.com/WhiteHades/solari-cookbook/tree/main/examples/repropub-ts
Release: https://github.com/WhiteHades/solari-cookbook/releases/tag/repropub-v0.1.0-rc.1

Built in public for the Pinetree Research SWE internship challenge.

@harrychow_ @getsolari

## LinkedIn draft

A detailed bug report is not always reproducible. In ebook-reader projects, the failure may depend on the exact internal structure of an EPUB that the reporter cannot share because it is private, copyrighted, commercially sensitive, or simply too large.

I built **ReproPub** to close that gap.

ReproPub inspects an EPUB, executes a precise reader scenario, replaces sensitive content, and reduces the package one structure-aware transformation at a time. It keeps a change only when a fresh execution proves that the same failure remains. The output is a small synthetic EPUB plus a receipt, privacy report, reduction log, raw observations, hashes, and visual evidence.

The first release candidate proves an encoded-fragment navigation failure:

- Original fixture: 5,629 bytes
- Reduced fixture: 2,325 bytes
- Reduction: 59%
- Focused tests: 11 passed
- Receipt-listed artifacts: 7, all verified
- Desktop and 390 px mobile browser journeys: passed
- Browser console errors: 0

The key design rule is simple: AI may propose work, but execution decides the verdict. ReproPub reports `PRESERVED`, `LOST`, `BLOCKED`, or `INCONCLUSIVE`; it does not force every run into a success state.

The production path uses a Solari Sandbox to host the target and a separate recorded Solari Browser to witness the result. [Insert the measured live Solari result and replay after ticket 08 is complete. Do not imply that the local proof is a live run.]

Source and documentation:
https://github.com/WhiteHades/solari-cookbook/tree/main/examples/repropub-ts

Verified prerelease and checksummed assets:
https://github.com/WhiteHades/solari-cookbook/releases/tag/repropub-v0.1.0-rc.1

I am now looking for ebook-reader maintainers and issue reporters with authorized cases that were blocked by a missing or hard-to-share publication. The useful signal is not likes. It is whether a maintainer attaches the reduced fixture to a real issue, turns it into a regression test, or comes back with a second case.

Built in public for the Pinetree Research SWE internship challenge. Tag Harry Chow and Solari in the published post.

## Publication gate

Before posting:

- [ ] Complete `.scratch/repropub/issues/08-run-credentialed-solari-proof.md`.
- [ ] Add the real replay or a short video.
- [ ] Verify every link in a signed-out browser.
- [ ] State local and live evidence separately.
- [ ] Remove all bracketed instructions.
- [ ] Use only measured product-market-fit claims.
- [ ] Tag the exact current accounts requested by the challenge post.
