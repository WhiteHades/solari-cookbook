# 09: Validate ReproPub with maintainers

Status: ready-for-human

Blocked by: None

## Goal

Test whether ReproPub saves real triage time for ebook-reader maintainers and issue reporters. Validation must use authorized, public-domain, permissively licensed, or synthetic EPUBs.

## Target participants

- Readest maintainers and regular contributors.
- Reporters whose issue lacks a shareable reproduction file.
- KOReader, Foliate, Calibre, or other reading-system maintainers.
- EPUB creators, accessibility testers, and publication QA practitioners.

## Interview questions

1. What was the last ebook bug blocked by a missing, private, copyrighted, or oversized file?
2. Why could the original file not be shared?
3. What evidence would make a generated fixture trustworthy?
4. Would the reduced EPUB be useful in the issue, or only after it became a regression test?
5. Which information must be removed before the fixture can be shared?
6. Which execution environment and reader version must be pinned?
7. Would you use a local CLI, a GitHub Action, or a hosted form?
8. Can you provide one authorized case for a supervised run?

## Strong evidence

- A generated fixture is attached to a real issue.
- A maintainer converts the fixture into a regression test.
- A maintainer reports measurable triage time saved.
- The same participant returns with a second case.
- A failure or `INCONCLUSIVE` result exposes a product limitation that is then fixed.

Stars, likes, and compliments do not count as product-market-fit evidence by themselves.

## Acceptance criteria

- [ ] At least five relevant people review a real output bundle.
- [ ] At least three authorized real cases are processed.
- [ ] At least two fixtures are accepted into a real issue or regression suite.
- [ ] At least one participant returns with a second case.
- [ ] The validation log records successful, failed, blocked, and inconclusive runs without hiding negative results.
- [ ] The README and launch post report only measured outcomes.

## Outreach message

> I built ReproPub, an open-source tool that turns a difficult-to-share EPUB bug into a small synthetic fixture and proves in a clean run that the same failure remains. I am looking for an authorized case that was blocked by a missing, private, copyrighted, or oversized publication. I will produce the first bundle with you and ask whether it would have improved triage. The original file will not be published, and the output will be treated as risk-reduced rather than legally cleared.
