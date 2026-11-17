# In-page workout editing: replacement for the floating keyboard toolbar

Target report: iPhone 17 Pro, iOS 27.3, Safari Add to Home Screen PWA. The owner reports that a field containing **25.5 kg** loses its native keyboard when tapping weight changes or Previous/Next, while the toolbar moves.

**The new recording was not exposed in this conversation's available attachments or workspace. It has not been inspected.** Source-level findings and browser reproductions below do not establish the exact native iOS event sequence in that recording. Physical verification of this replacement remains pending; do not auto-merge until that check passes.

## Source-level failure paths

The previous component depended on a global focused-input record, blur guards, floating viewport placement, and release-time activation:

- `focusout` could clear the current input and unmount the accessory unless a touch guard had already been armed. An early native focus change therefore could destroy both the action target and the control before the later action ran.
- Touchend checked the button's **current** rectangle. Viewport changes between initial contact and release could reject a press that began on the correct button.
- Adjustment wrote a DOM value through a prototype setter, dispatched an artificial input event, and refocused even an already-focused input. The write path depended on that same DOM target surviving the focus/render lifecycle.
- Accessory placement and input-reveal scrolling both reacted to viewport changes and emitted custom events. Even with earlier fixes, this was unnecessary machinery competing with Safari's own focus/panning behavior.

These are identifiable code-level dependencies, not a claim to know which native event caused the owner's video. The new regression specifically reproduces early blur **before** action handling and verifies that the 25.5 target remains available and becomes 25.75 on the initial press.

## Deliberately simpler layout

The floating strategy is retired, not given another offset:

- One persistent, ordinary **in-page strip** sits below Exercises/Timer tabs, above the exercise cards. It exists before focus and remains mounted after blur, with a constant footprint. A label and live value identify its editing target even if that input has scrolled out of view.
- No portal, fixed/sticky positioning, z-index overlay, safe-area arithmetic, `visualViewport` subscription, scroll coordinates, `scrollBy`, `scrollTo`, or programmatic scroll-into-view is used to place the editing strip.
- Scrolling moves the strip together with the page. **It intentionally does not follow the keyboard.** If it is offscreen, scroll to it normally or use native keyboard navigation/Enter. This is the requested usability fallback, not a keyboard-edge positioning claim.
- Weight focus shows four changes; reps hide those changes without changing the strip's height. Previous and Next stay available. At the final field, Next becomes Done. The always-duplicated custom keyboard Done button is removed; native Done, existing in-card Done editing, and final-field Done remain available.
- The remaining editing-state hook only hides/restores existing fixed app chrome and preserves the drag guard. Its 250ms dismissal debounce does not move or refocus anything. A one-way notification lets the existing timer bubble remeasure after chrome restoration; the editing strip never subscribes to it.

Safari's own keyboard toolbar is OS-managed. This layout does not stack another app toolbar against it or attempt to hide/control it. Native focus scrolling is left to Safari; no second JavaScript viewport/reveal calculation competes with it.

## Input ownership and action timing

A focus-in listener remembers a numeric input by stable exercise/set identity. **Blur does not discard that target or remove the controls.** Removed/hidden inputs cannot receive adjustments.

A local non-passive native **touchstart** handler prevents default focus transfer and commits the action immediately, rather than waiting for touchend/click or hit-testing a later moving rectangle. Mouse/pen actions likewise run on the initial pointer press; keyboard activation uses its normal semantic click. A press activates immediately; moving away after initial contact does not undo that explicit adjustment. Later pointer compatibility clicks do not run the action again. There are no touchend action handlers, delayed refocusing, click timestamps, or gesture-owned floating DOM nodes.

For weight adjustment, the already-focused input is not refocused. If an earlier blur occurred, the same first trusted press restores focus synchronously. The weight changes directly through the existing cloned-workout state transaction, using stable IDs and the existing integer-gram arithmetic; there is no artificial input event or React value-tracker workaround. Previous/Next call `focus()` synchronously on the live adjacent field, in REPS → WEIGHT → next-set REPS → WEIGHT order. Safari owns the resulting native field scroll.

No input/timer/set command is started or completed by navigation. History, entered values, reps validation, fractional parsing, plans, PRs, achievements and backup formats are unchanged. The small new `adjustWorkoutInput` helper is covered for exact target isolation and unchanged controller/state.

## Honest previews

Chromium previews, **not native iOS captures**:

- [402×874 in-page strip at 25.5 kg](screenshots/inline-editing/iphone-402x874.png)
- [402×540 ordinary available-area layout](screenshots/inline-editing/available-area-402x540.png)

No native keyboard is drawn or inferred in these images.

## Regression and acceptance boundaries

The obsolete floating-geometry implementation and its geometry-only unit tests were removed. Their replacement browser assertions check persistent normal flow, stable control identity through blur, constant height, no generated scroll commands under viewport-event churn, and direct state updates before touch release. Existing value/history/timer/reload checks remain. Tests that formerly asserted a floating bar's location now assert its deliberate absence. The compact logging test resizes the actual browser viewport instead of merely replacing visualViewport.height, so native focus scrolling is exercised; its column, touch-size, timer and persistence checks remain. No CI job is disabled.

Unit tests cover exact fractional adjustments, zero boundaries, removed/invalid targets and unchanged surrounding workout state. Browser regressions cover 25.5 → 25.75 on initial contact, synchronous Next, ignored later clicks, repeated real browser taps with no input blur, 320/375/402 widths, standalone flags, native Enter ordering, timer continuity, reordering after editing, viewport event churn, persistent values and layout previews. The existing full Chromium and configured WebKit CI jobs run normally.

**Still required on the physical iPhone 17 Pro / iOS 27.3 installed PWA:**

1. Open the reviewed build without clearing production app data. At 25.5 kg, tap each change repeatedly; confirm exact values and that the native keyboard remains open without flicker. Repeat with 0.125 and 8.125 kg.
2. Use Previous/Next from both reps and weight. Confirm the next field takes focus with the keyboard retained. Compare native Next/Previous; use native Done and final-field Done to dismiss.
3. Scroll with the keyboard open. The strip should move only with the page, never chase the keyboard or appear as an overlay. Native controls remain usable when the strip is offscreen. Check portrait/landscape, background/resume and ordinary Safari as well as Home Screen mode.
4. Repeat during a running set; confirm timer phase and exercise/set states stay unchanged, then dismiss and reorder. Reload/reopen and confirm values persist.
5. Reattach the recording for frame-level review of the original failure. If this replacement fails on-device, record the new build and exact event sequence; do not declare the issue physically fixed based on these browser tests.

PR #36 was already merged, so this is a focused follow-up PR. It remains unmerged with auto-merge disabled pending physical acceptance. No feature-branch production deployment or check bypass is requested.
