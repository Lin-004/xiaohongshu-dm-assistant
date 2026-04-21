# Implementation Plan

## Summary
The current Android send flow already isolates text input inside inputReplyWithStrategy() and performs precheck, restore, and send confirmation in src/channels/android.js. This feature should turn that isolated path into a real strategy layer instead of a single hard-coded ADB Keyboard broadcast path.

## Affected Files
- src/channels/android.js
- src/config.js
- 	est/monitor.test.js
- Potentially a new focused test file for Android input strategy behavior
- docs/spec-driven-workflow.md only if usage guidance changes
- Operational docs if setup or recovery instructions need to change

## Design Decisions
- Keep sendReply() orchestration mostly intact and limit the change surface to input strategy selection and failure reporting.
- Preserve ADB Keyboard as the preferred strategy when enabled and installed.
- Separate three concerns clearly:
  - capability detection,
  - text entry execution,
  - input-method restoration.
- Represent unsupported or failed strategies with explicit result codes instead of generic send failure.
- Avoid implicit fallback to db shell input text unless it is explicitly approved as safe for this repo and tested against the target devices.

## Risks
- Real-device behavior may differ from emulator or mocked tests.
- IME switching can succeed while broadcast text entry still fails.
- Restoring the previous IME may fail and leave the device in an unexpected state.
- Adding too many fallback paths can reduce safety and make failures harder to reason about.

## Test Plan
- Keep existing auto-send tests green.
- Add focused tests for:
  - input method available and write succeeds,
  - preferred input method unavailable,
  - input write fails after successful precheck,
  - previous IME restoration is attempted safely.
- Perform one real-device validation run after code changes.

## Rollout and Rollback
- Roll out behind the existing auto-send gate only.
- If real-device validation still fails, keep auto-send off and preserve manual fallback.
- Roll back by reverting to the previous known-safe draft-plus-manual path rather than forcing another input fallback.