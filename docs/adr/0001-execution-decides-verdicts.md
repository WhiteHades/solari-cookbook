# ADR 0001: Executed observations decide verdicts

## Status

Accepted

## Context

AI can propose scenarios, candidate transformations, or explanations, but a plausible narrative is not evidence that an EPUB failure still occurs. A false `PRESERVED` result would waste maintainer time and undermine the product.

## Decision

Only an oracle operating on observations from an executed witness run may produce a verdict. AI output may guide work but cannot directly set `PRESERVED`, `LOST`, `BLOCKED`, or `INCONCLUSIVE`.

Ambiguous observations produce `INCONCLUSIVE`. A failed setup produces `BLOCKED`.

## Consequences

Every supported failure class needs an explicit oracle. Subjective visual failures require a human-confirmation oracle until a dependable machine rule exists. The product may refuse cases rather than guess.
