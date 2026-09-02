# 05: Build the ReproPub review dashboard

Status: resolved

Blocked by: 03

## What to build

Create a responsive React dashboard that starts the real local demo, displays its activity, verdict, size reduction, transformation history, privacy findings, evidence, and limitations, and exposes bundle downloads.

## Acceptance criteria

- [x] The interface uses shadcn-style primitives and copied/adapted beUI activity behavior.
- [x] The primary flow is keyboard usable, responsive, and reduced-motion aware.
- [x] Empty, running, preserved, blocked, and inconclusive states are distinct.
- [x] The dashboard reads actual run output rather than hard-coded success data.
- [x] A production build and Chromium flow pass with final screenshots.

## Resolution evidence

GitHub Actions run `33564266507` passed the production Vite build and the complete Playwright smoke journey. The keyboard-activated local run reached `PRESERVED`, displayed 9 reduction decisions and 7 downloadable receipt-listed artifacts, downloaded the real `repro.epub`, and repeated the flow at a 390 × 844 mobile viewport with reduced motion. Desktop initial, desktop result, and mobile screenshots are committed under `examples/repropub-ts/demo/`; the browser summary records zero console errors.
