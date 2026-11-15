# Sequential set entry

Within each expanded exercise, numeric entry follows the rendered order: set 1 reps → weight → set 2 reps → weight, ending at that exercise's last weight field. Added/removed sets automatically change both navigation targets and the last field's hint. Navigation never advances to another exercise.

Inputs retain `type=number`, numeric/decimal input modes and a minimum 16px font. `enterkeyhint=next` requests the native Next action; the last weight field requests Done. Where the browser delivers Enter, its default action is prevented and focus moves synchronously within the same user gesture, without blurring first. Final Done blurs the input.

**iOS number pads often omit a usable return key.** A compact 44px-high accessible Next/Done button is therefore available whenever a set field is focused. Pointer-down preserves input focus; activation focuses the next input immediately. Keyboard and assistive-technology activation use the same semantic button and helper. The existing Done editing control remains available for closing entry early.

The accessory is a document-layer portal positioned from the visual viewport's actual bounds, with safe-area padding. It does not move fixed navigation, set keyboard-height CSS variables, change document padding or create a nested scroller. The existing input-reveal hook reserves the accessory's measured bounds when revealing a focused input. Manual page scrolling only repositions the accessory; it does not snap back to the input. The accessory hides on screen change, blur, backgrounding or pinch zoom. Returning with input focus restores it. Normal input font sizing, page zoom and vertical scrolling are retained.

This is focus-only UI: no storage schema, workout-controller action, imported plan, history, timer or completed-set record changes. Input value edits continue using the existing logging and persistence code. DOM navigation is scoped to one card and uses its current connected fields, so reordering cards cannot redirect focus into a different exercise.

## Verification

Run `npm run test:workflow`, `npm test`, `npm run build` and `npm run test:e2e`. The mobile reliability CI matrix also runs `set-input-navigation.spec.ts` in WebKit. Regressions cover 375×667, 390×844 and 393×852, Enter/Next/Done, touch fallback, dynamically added/removed sets, Easy/Hard imports with different set counts, keyboard occlusion, running timers, app return, reordering and reload persistence.

Headless Chromium and WebKit do not reproduce the physical iPhone keyboard or installed-PWA compositor. Before approval, verify in Safari and the installed iPhone PWA:

1. Tap set 1 REPS and enter values using Next → WEIGHT → next REPS through all sets. Use the accessory when the number pad lacks Next. The keyboard should stay open where iOS permits.
2. Verify every newly focused input appears above the keyboard/accessory, with no navigation/FAB overlap or horizontal zoom. Scroll manually while editing; repeat after switching apps and after rotating the phone.
3. Add/remove a set and confirm the final weight field now says Done. Done closes entry and restores normal navigation after dismissal. No set should start, stop or complete from Next/Done.
4. During a running set, enter values, navigate and reopen/reload the app; confirm values, timer, active set and exercise order remain intact. Test an unclassified imported plan and Easy/Hard sessions.

Do not clear production browser storage for verification. This logging-related update requires manual review and must not be auto-merged.
