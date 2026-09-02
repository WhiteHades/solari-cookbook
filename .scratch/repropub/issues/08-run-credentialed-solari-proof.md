# 08: Run the credentialed Solari proof

Status: blocked

Blocked by: None

## Goal

Run the completed ReproPub Solari adapter against the real service and publish a recorded, independently witnessed evidence bundle.

## Required input

An authorized `SOLARI_API_KEY` supplied through a local environment variable or GitHub Actions secret. The key must never be committed, copied into an issue, or written into an artifact.

## Procedure

1. Redeem the challenge credit in the Solari account.
2. Create a challenge-specific Solari API key.
3. From `examples/repropub-ts/`, run `npm run solari-demo` with the key in the environment.
4. Verify the resulting bundle with the CLI.
5. Confirm the receipt identifies Solari mode and successful cleanup.
6. Inspect the screenshot and replay.
7. Publish only the reduced synthetic EPUB and redacted evidence.
8. Revoke the challenge key after final submission if it is no longer needed.

## Acceptance criteria

- [ ] A real Solari Sandbox is created and destroyed.
- [ ] A separate recorded Solari Browser executes the navigation action.
- [ ] The live oracle returns `PRESERVED` from captured browser observations.
- [ ] Screenshot, replay, infrastructure fingerprints, receipt, and reduced EPUB are present.
- [ ] No API key, signed capability, raw sandbox identifier, or absolute host path appears in shareable output.
- [ ] Cleanup reports zero failures and no active challenge resources remain.

## Blocker

No authorized Solari API key is available to the current build environment. The implementation and controlled protocol tests are complete; this ticket must remain open until a real credential can be used without exposing it.
