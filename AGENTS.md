# AGENTS.md

## Agent skills

### Issue tracker

ReproPub work is tracked as local Markdown under `.scratch/repropub/` because GitHub Issues are disabled on this fork. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Read `CONTEXT.md` and relevant records under `docs/adr/` before changing ReproPub. See `docs/agents/domain.md`.

## ReproPub

Work from the first unblocked ticket in `.scratch/repropub/issues/`. Keep each ticket runnable and verified before resolving it.

The canonical product lives under `examples/repropub-ts/`. Its README is the product source of truth. Do not duplicate it at the repository root.

Test through the public seams named in the current ticket. A verdict must come from executed observations, never from an AI assertion.

Treat EPUB input as hostile. Keep Solari credentials and signed URLs out of source, fixtures, logs, screenshots, receipts, and model prompts.

For UI work, prefer shadcn primitives and copied beUI source over custom interaction widgets. Preserve keyboard use, visible focus, reduced motion, and responsive layout.
