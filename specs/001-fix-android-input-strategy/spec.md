# Feature Spec

## Title
Fix Android input strategy for controlled auto-send

## Goal
Define a stable Android text-entry capability for controlled auto-send so the MVP device path can either complete reply input on supported real devices or stop with an explicit manual handoff.

## In Scope
- Controlled auto-send text entry on the Android production path.
- A defined preferred text-input path for reply content entry.
- Explicit handling for text-entry precheck, execution result, and post-entry confirmation.
- Clear manual handoff when text entry cannot be completed safely.
- Product-visible failure outcomes that distinguish unsupported, unavailable, and failed input attempts.

## Out of Scope
- Expanding auto-send beyond the existing controlled low-risk path.
- Web-channel message handling.
- Multi-device or multi-account behavior.
- Redesign of conversation discovery, AI draft generation, or send-confirm policy.
- General notification redesign outside the minimum needed to communicate manual handoff.

## Acceptance Criteria
- On supported real Android devices, controlled auto-send can enter the drafted reply text and proceed to the existing send-confirm stage.
- If the preferred input path is unavailable, unsupported, or fails during execution, the run stops auto-send for that conversation and produces an explicit manual handoff outcome.
- The product distinguishes at least three states in a testable way: input path ready, input path unavailable or unsupported, and input attempt failed after starting.
- Failure handling preserves enough context for operators or developers to understand why text entry did not complete.
- Existing controlled auto-send behavior outside text entry does not regress.

## Constraints
- Auto-send remains disabled by default.
- High-risk conversations must still route to manual review.
- Android is the only production delivery path for this feature.
- The feature must preserve recoverability and explicit failure reporting over silent fallback.
- Manual send remains the default operator control point outside the explicitly enabled controlled auto-send path.
- Resolution claims require validation on a real device, not simulator-only confidence.
