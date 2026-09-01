# Issue tracker: Local Markdown

ReproPub issues and its specification live under `.scratch/repropub/`.

GitHub Issues are disabled on this fork. The connected GitHub API can create repository content but cannot change that setting, so local Markdown is the active Matt Pocock-compatible tracker.

## Conventions

- Specification: `.scratch/repropub/spec.md`
- Tickets: one file per vertical slice under `.scratch/repropub/issues/<NN>-<slug>.md`
- `Status:` records `ready-for-agent`, `in-progress`, `blocked`, or `resolved`
- `Blocked by:` lists earlier ticket numbers or `None`
- Work starts at the lowest-numbered ready ticket whose blockers are resolved
- Resolution records the verification evidence in the ticket before its status changes to `resolved`
