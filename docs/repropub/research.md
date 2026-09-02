# ReproPub research basis

## Human problem signals

Current ebook-reader issue trackers repeatedly show an artifact bottleneck: the reporter can describe a failure but cannot supply a small shareable EPUB.

- Readest issue 5941 reports a Windows OneDrive failure with a screenshot but no reproduction steps or file: <https://github.com/readest/readest/issues/5941>
- Readest issue 5980 documents a KOReader locator failure in unusual detail, but the copyrighted EPUB cannot be attached: <https://github.com/readest/readest/issues/5980>
- Readest issue 5955 supplies a large external archive because six PDFs are needed to demonstrate duplicate detection: <https://github.com/readest/readest/issues/5955>
- Readest issue 5924 includes an EPUB only after a user isolated a pagination symptom around specific pages: <https://github.com/readest/readest/issues/5924>
- Readest issue 5649 provides a hand-built minimal fixed-layout EPUB because the original publication could not safely serve as a regression fixture: <https://github.com/readest/readest/issues/5649>

The useful product is therefore not another issue summarizer. It is a tool that converts the unavailable or unwieldy artifact into a trusted reproduction.

## Technical basis

- EPUB is a structured publication format with linked package, manifest, spine, navigation, content, style, and media resources: <https://www.w3.org/TR/epub-33/>
- The W3C maintains reading-system tests because interoperable EPUB behavior requires executable fixtures, not prose alone: <https://w3c.github.io/epub-tests/>
- Delta debugging establishes the general method of repeatedly simplifying a failure-inducing input while retaining the failure: <https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/delta-debugging.pdf>
- EPUBCheck validates conformance but does not minimize a valid failure-inducing publication or prove behavior in a target reader: <https://www.w3.org/publishing/epubcheck/>

## Solari fit

Solari supplies the two independent execution surfaces the product needs:

- Sandbox API for isolated commands, files, Git operations, preview ports, idempotent creation, and explicit destruction: <https://docs.getsolari.com/api-reference/sandboxes>
- Browser API for Playwright-compatible cloud Chrome, recordings, and session lifecycle: <https://docs.getsolari.com/browsers>

The sandbox prepares and hosts the pinned reader. The browser acts as the witness. Neither is decorative.

## Challenge differentiation

Existing Solari challenge submissions already cover generic AI repairs, plain-English Playwright generation, and self-healing selectors:

- <https://github.com/solari-sdk/solari-cookbook/pull/16>
- <https://github.com/solari-sdk/solari-cookbook/pull/9>
- <https://github.com/solari-sdk/solari-cookbook/pull/12>

ReproPub keeps the valuable verified-execution pattern but applies it to the underserved EPUB artifact bottleneck, where the author has direct maintainer and reader-domain experience.

## Product assumptions to validate

- Maintainers will trust a generated fixture when the target commit, transformation history, final fresh rerun, and evidence are explicit.
- Reporters value local sanitization enough to provide authorized fixtures.
- Navigation and geometry failures cover enough early cases to justify a broader reducer.

These remain assumptions until real maintainers accept bundles or convert them into regression tests.
