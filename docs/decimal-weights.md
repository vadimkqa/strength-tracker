# Decimal weight entry and quick adjustments

Active workout weight fields use a text control with `inputmode="decimal"`. This avoids native number-input sanitization of comma separators and partial values such as `7.`. Reps remain number inputs with whole-number validation.

- Nonnegative kilograms accept up to three decimal places: `0.125`, `7.5`, `7.75`, `8.125`, or any other valid three-place value. Manually entered values need not be quarter-kg multiples.
- Commas normalize to periods during editing. Drafts retain a trailing period while focused and through active-workout saves/reloads. On blur, valid values become canonical decimal strings; invalid drafts stay visible with an error rather than being silently rounded or cleared.
- Zero remains valid logged load. Negative, nonnumeric, mixed-separator and over-precision entries cannot complete a valid logged set. Reps must remain positive whole numbers.
- The four weight buttons change only the current weight input by −0.5, −0.25, +0.25 or +0.5 kg. Empty input starts from zero, decreases clamp at zero, and invalid drafts are not replaced with guessed values. Arithmetic uses integer grams with `BigInt`; these transient values never enter storage or JSON.
- Previous, Next and Done work within the current exercise. Weight buttons are hidden for reps. Pointer presses preserve input focus, and keyboard users can activate the semantic controls. Actual keyboard retention remains subject to iOS.

## Calculations and data safety

The shared weight parser feeds live-set validation, previous performance, workout statistics, PRs and exercise charts. Volume products/sums use gram precision, avoiding binary accumulation drift (for example, `0.1 kg × 3` is `0.3 kg·reps`). Actual weight and volume displays retain up to three decimal places. Estimated strength is still an explicitly labeled estimate.

There is no schema migration, history rewrite, active-session reset, backup-format change or new dependency. Existing integer snapshots remain unchanged. Canonicalization applies to fields the user edits or explicitly completes, not stored history. Existing backup/restore paths carry original strings/numbers and draft active values without rewriting them. The legacy `completeSet` helper keeps its pre-existing empty-load behavior; the live controller continues to require an explicit load.

The original accessory positioning and touch handling described by this decimal-entry change have been superseded by the [iPhone keyboard accessory correction](iphone-keyboard-accessory.md). The current accessory is one fixed body-level row positioned from visual viewport bounds, with protected native touch handling. See that document for current previews and required physical-device acceptance; the original decimal-entry screenshots below show the earlier implementation.

## iPhone-sized screenshots

Chromium mobile-emulation captures with a focused weight field and all four controls. These show the app accessory, not a captured native iOS keyboard.

- [390 × 844](screenshots/decimal-weights/accessory-390.png)
- [375 × 667](screenshots/decimal-weights/accessory-375.png)

## Validation

`weight.test.ts` covers decimal/comma parsing, partial drafts, invalid values, exact repeated changes, zero boundaries, integer reps, and fractional previous performance, PRs, charts, summaries, IndexedDB reload and full-database backup/restore. `decimal-weights.spec.ts` exercises live input and reload, repeated touch adjustments, navigation, unchanged controller/history, short visual viewports and standalone-mode flags at 320, 375 and 390 pixels, plus fractional completion receipts and chart values.

Existing browser assertions now target the weight textbox while retaining their data, focus and navigation checks. The new decimal suite is included in the existing WebKit regression job. Workflow safeguards and the production build remain required. Physical iPhone Safari/PWA keyboard behavior should also be checked on device; emulation does not supply the native keyboard.

This update is left for manual review under `AGENTS.md` because it touches logging validation/calculations. No auto-merge, bypass or production deployment is requested.
