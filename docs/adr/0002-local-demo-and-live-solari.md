# ADR 0002: Ship a deterministic demo beside the live Solari path

## Status

Accepted

## Context

Reviewers need a one-command experience, but live cloud execution requires a private Solari key and consumes credits. A simulated dashboard would be easy to run but would not prove the product works. A live-only product would be difficult to evaluate and develop without credentials.

## Decision

ReproPub has two execution modes behind the same witness interface:

- `local`: runs a deterministic synthetic target and produces real artifacts without credentials.
- `solari`: uses a Solari Sandbox for the isolated target and an independent recorded Solari Browser for the witness run.

The local mode is a real execution path, not hard-coded output. The live mode fails closed when credentials are absent. Evidence records the mode used.

## Consequences

Core behavior remains reproducible in CI and by reviewers. Live Solari proof still requires an authorized key and is reported separately. No documentation may imply that a local run used Solari.
