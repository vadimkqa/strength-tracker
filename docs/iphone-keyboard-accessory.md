# iPhone keyboard accessory correction

Reported device: **iPhone 17 Pro, iOS 27.3, Safari Add to Home Screen standalone PWA**. The owner confirmed keyboard dismissal, moving/unresponsive buttons and app/native toolbar overlap on that physical device. Those observations take precedence over the previous desktop-emulation results.

**Physical verification of this fix is still pending.** No attached physical iPhone is available in this environment. Playwright WebKit is a browser-engine regression target, not that iPhone, iOS build or native keyboard.

## What changed

The app now renders one compact 52px-high row in a direct child portal of `document.body`. The four weight adjustments and Previous/Next/Done occupy the same row; there is one app Done control. Reps show navigation only. Arrow/check icons have full accessible names; controls are at least 40px wide and 44px high at a 320px viewport. Precision remains the existing integer-gram arithmetic (0.001 kg), and accessory actions do not invoke set/timer/workout commands.

The old absolute coordinates combined `scrollY`, `scrollX`, `visualViewport.offsetTop`, `offsetLeft` and height, with React position updates on scroll. That was vulnerable to asynchronous native focus scrolling and toolbar movement. The new layer is **fixed**, outside card transforms and drag contexts. Its only vertical model is:

`top = min(visualViewport.offsetTop + visualViewport.height, layoutViewport.height − bottomSafeArea) − measured accessory height`

Document scrolling is never added to this value. Horizontal geometry comes only from CSS left/right safe-area insets; neither `scrollX` nor visual viewport horizontal panning changes its x position. Resize/visual-scroll events are batched into one animation frame reading the latest bounds. The bar is hidden until positioned. Body/main sizing, navigation offsets, controller anchoring and the single document scroller are unchanged.

Visible bounds are intersected with the layout safe edge: when the keyboard reduces the visible area below that edge, safe area is not subtracted a second time. There is no keyboard-open threshold or estimated keyboard height, so crossing a threshold cannot introduce a separate safe-area jump. The existing focused-input reveal hook consumes the accessory's measured top after it moves. This is not a second keyboard-height calculation and does not translate fixed app chrome.

## Touch and focus

Previously actions depended on a later click and React pointer prevention alone. Native listeners now cancel the touch default on **non-passive touchstart** before normal focus transfer, and activate on touchend within the same trusted gesture. Touch movement/cancellation does not adjust the weight. Compatibility clicks after touch are suppressed so an increment cannot apply twice. Mouse and keyboard clicks retain semantic-button behavior.

The currently focused input is retained across a protected accessory touch. If focus is lost during that gesture, adjustment restores it synchronously inside touchend before using the ordinary controlled-input handler; no timeout or asynchronous refocus is the sole recovery mechanism. Previous/Next also focus their target synchronously. Done blurs and removes the app accessory. Cancelled interactions clean up retained touch state rather than leaving an invisible input-blocking layer.

## Native iOS toolbar limitation

Web content cannot reliably detect, hide or replace Safari's native Previous/Next/Done input toolbar. The app creates only one row and one Done button, does not imitate or add a second stacked navigation row, and anchors to the visible viewport boundary. **Whether iOS 27.3 excludes the entire native input-toolbar area from that boundary must be checked on the reported device.** Do not mark native-toolbar overlap or keyboard retention physically resolved from an emulated screenshot.

## Previews

These are Chromium browser previews with standalone flags, not photographs or captures from iOS 27.3:

- [402×874 full iPhone-sized app preview](screenshots/iphone-accessory/pwa-402x874.png)
- [402×540 visible-area preview after simulated keyboard occlusion](screenshots/iphone-accessory/pwa-visible-402x540.png); the crop excludes the region a real OS keyboard would occupy, and does not invent or draw a native keyboard.

## Regression coverage

`accessory-geometry.test.ts` covers panned/fractional viewport bounds and safe-area arithmetic. `iphone-accessory.spec.ts` covers 320/375/402 widths, standalone flags, stable x/y during document scrolling, visual viewport scroll/resize churn, hit testing, repeated fractional changes, focus preservation, cancelled defaults, synchronous recovery after injected focus loss, compatibility-click deduplication, Previous/Next/Done, active timer continuity, sorting guards/reordering and reload persistence. Actual touch dispatch is exercised by browser taps; explicitly injected events additionally test handler edge cases and do not reproduce OS keyboard policy.

The full existing Chromium suite remains enabled. The new suite is added to the existing WebKit job; existing mobile navigation, decimal, reordering, history and backup tests remain in place. No workout data, validation rules, timer calculations, history, plans or backup formats are changed.

## Required physical-device acceptance

Use the reviewed build in a test PWA or the normal deployment after manual merge. This branch is not deployed directly. Do not remove the installed production app, clear its storage or reset an active workout for testing.

On **iPhone 17 Pro / iOS 27.3**, launch from the Home Screen and check:

1. With the native decimal keyboard open, enter `8.125`; repeatedly tap all four changes. Only the focused weight changes, to exact 0.001 kg precision. The keyboard stays open without flicker. Try both normal taps and a touch that moves/cancels.
2. With keyboard and any native input toolbar visible, scroll in both directions and let native panning settle. Confirm the app row stays directly above the available keyboard/native-toolbar boundary, does not drift horizontally, and every control remains tappable. Confirm the active field is revealed when focusing/navigating.
3. Navigate REPS → WEIGHT → next-set REPS → WEIGHT, and back. Reps hide weight changes. At the final field Next is disabled and Done dismisses the keyboard. There is one app accessory and no app-created stacked/duplicate Done row. Inspect native toolbar clearance explicitly.
4. Repeat during a running set, after background/resume, and after portrait/landscape rotation. Confirm phase, elapsed timer and set/exercise states do not change from accessory actions. Test safe areas near the notch and home indicator.
5. After Done, scroll and reorder an exercise; confirm there is no invisible blocker. Reload/reopen and confirm entered values and session/history are preserved. If possible compare regular Safari to standalone to isolate any remaining OS-only behavior.

Record the installed build, iOS version, orientation and a short screen recording for any failure. Until these steps pass on the device, keyboard retention and native-toolbar clearance remain **not physically verified**. The PR stays open for manual review; no failed checks or merge/deployment gates are bypassed.
