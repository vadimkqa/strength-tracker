# Strength Tracker 2.0 — Phase 1

A local-first React + TypeScript PWA with a matte purple/black interface. Built with Vite. No backend, login, API keys, or runtime image requests are required.

## Run and preview

Use Node.js 22.12+ (Node 24 is available in this cloud environment).

```sh
npm ci
npm run dev
```

For the production build, including service-worker/offline behavior:

```sh
npm run build
npm run preview -- --port 4173
```

Open the address printed by Vite in a browser on the same machine, or use your platform's port-forwarding controls for port 4173. A cloud machine's localhost address is not your computer's localhost. The current onboarding UI does not expose a forwarded preview link or browser-control tool; screenshots from browser validation are in `test-results/`. For local development on your computer, the printed address works directly. PWA installation requires HTTPS or localhost. Service workers are enabled in production previews, not the Vite development server.

To test on an iPhone, deploy the `dist/` directory to an HTTPS static host and use Safari → Share → Add to Home Screen. Use the same origin and deployment path as v1 for automatic data migration. Do not clear website storage or uninstall the old PWA before exporting a backup.

## Checks

```sh
npm test
npm run build
npm run preview -- --port 4173
# In a second terminal, with the preview server running:
npm run test:e2e
```

Playwright uses the environment's `/usr/bin/chromium`. On another machine, install a Playwright Chromium browser (`npx playwright install chromium`) and set `CHROMIUM_PATH` to its executable or adjust `playwright.config.ts`. Unit tests use fake IndexedDB. Browser tests use isolated browser contexts, including a v1-to-v2 service-worker upgrade test on port 4175. No personal browser storage is used.

## Data safety

- Existing data under `strength-tracker-v1` is read only. The original localStorage record is never removed or overwritten by v2.
- First use validates and copies the entire legacy state into `strength-tracker-v2` IndexedDB, including history, active workout, timestamps, rest timer, custom templates, and preferences. A verbatim legacy snapshot is saved in the `backups` object store in the same transaction.
- Migration rechecks state in its write transaction and does not replace an existing v2 database. Invalid legacy data blocks startup rather than silently starting over.
- Backup restore merges history, preserves existing sessions and conflicting IDs, restores the imported plan/preferences, and saves a snapshot before import. Importing the same history repeatedly does not duplicate it. The current active workout takes precedence; a different imported active session is retained as an unfinished history entry.
- Exports contain the full current state and remain compatible with the v1 shape. Keep external backups: browser storage can be cleared or evicted. Photos and app assets are precached; saved workouts remain device-local.
- Browsers with Web Locks allow only one editing tab at a time to avoid stale-tab writes. A failed save remains visible, with retry and export controls.
- Storage is scoped to the origin. A new preview URL cannot access data from your old site. Export from the old site and merge the backup into Settings if changing origins.

## Existing behavior and new presentation

The four cards map to the original templates in order: Bench Day → Tuesday Bench focus; DB Press Day → Thursday Back focus; Hammer Press Day → Saturday Chest focus; Leg Day → Sunday Legs. Existing exercise choices and customized plans are preserved rather than silently replaced to match the new names. HARD maps to the original heavy week; EASY uses a separately imported Easy template when available. Without an imported variant, the original behavior is preserved: the alternate Sunday plan and the existing base templates for other days.

Train contains the swipeable carousel, visible intensity selector, active workouts, set logging, timestamp-based timers, rest presets, exercise edits/additions, and set adjustment. Progress contains saved history and session details. PRs shows highest completed weight per exercise, with reps as the tiebreaker. Settings edits template set counts, default rest, imports TXT training plans, and exports/merges backups. No Phase 2 analytics or programming features are included.

The original app is retained in `legacy/` for upgrade tests and reference; it is not part of the deployed build. Workout photographs are bundled from the public-domain `yuhonas/free-exercise-db` dataset; source paths are in `public/photos/README.md`. The four-screen mockup image was not attached; the implementation follows the supplied colors, structure, and visual requirements.

## Centered workout carousel and TXT plan importing

The Train carousel centers one large card with both neighbors peeking in. It keeps four positions (Bench, DB Press, Leg, Hammer Press) and supports native touch swipes, mouse drag, side-card taps, keyboard left/right arrows, and four pagination dots. EASY/HARD and START WORKOUT stay underneath it.

To review a TXT program:

1. Open **Settings → Import Training Plan**, choose your TXT, and click **Parse TXT**. Source text and aliases are available in a collapsed panel. Files stay on-device (UTF-8 or BOM-marked UTF-16; maximum 1 MB / 2,000 lines).
2. Review the compact summary, choose **Week** and **Workout**, and check exercises in their original order. Individual intensity, optional/core status, source set numbers, rep ranges and effort are shown without opening editing forms.
3. Expand only exercises you want to inspect or correct. The source-warning index jumps to the affected session. Details support name/session/intensity edits and per-set number, min/max reps and effort edits. Add/remove/move a prescription entry explicitly; the parser never renumbers automatically.
4. Resolve source errors or explicitly acknowledge keeping the original ambiguous values. Missing rest durations stay `null`; core exercises without a set count stay unspecified. No automatic countdown starts for an exercise with unknown rest. Core sets can be added explicitly during a workout.
5. Check the final template list, tick **I confirm applying these templates…**, then click **Apply imported plan**. Parsing, previewing, cancelling and acknowledging a warning do not write templates. A pre-import snapshot and the new state are saved in one transaction. History (and its PR source data), active sessions and existing preferences are retained.

### GYM.txt rotation

The uploaded real program is retained verbatim as `tests/fixtures/GYM.txt` for regression coverage. Its first week is implicit, with an explicit `Week 2` boundary. The parser recognizes **2 weeks, 8 sessions and 58 exercises**:

| Week | Tuesday      | Thursday        | Friday      | Saturday            |
| ---- | ------------ | --------------- | ----------- | ------------------- |
| 1    | Bench · Hard | DB Press · Easy | Legs · Easy | Hammer Press · Hard |
| 2    | Bench · Easy | DB Press · Hard | Legs · Hard | Hammer Press · Easy |

Day-qualified headers such as `Tuesday; Bench (Heavy):` define sessions. Exercise `HARD`, `EASY` and `MID` labels remain independent of session intensity. `Optional:` is an optional exercise prefix, and `Core:` creates a core exercise with all `or` alternatives preserved. Blank lines and harmless Unicode whitespace do not create exercises.

A block such as `(1:6 no fail; 2:4 no fail; 3:3-6 fail; 4:3-6 fail)` attaches to the preceding exercise and stores each original set number, minimum reps, maximum reps and exact effort instruction. It never becomes an exercise name. The regression snapshot records every exercise and prescription across the whole file, not just the first workout.

Two source ambiguities are intentionally reported: Week 1 Bench pull-ups contains `half fail fail`, and Week 2 DB Press shrugs lists set numbers `1, 3, 4` (missing `2`). Neither is corrected or hidden automatically. A user can edit the prescription or explicitly keep its original wording/numbering. No rest durations are present in GYM.txt, and none are inferred.

After a confirmed rotation import, Train retains the same four cards and the Week 1 / Week 2 dropdown. Cards sort by the selected week's imported weekday metadata: Tuesday Bench, Thursday DB Press, Friday Legs, Saturday Hammer Press in GYM.txt. Swiping forward from Saturday Hammer Press to Tuesday Bench advances to the next week; swiping backward from Bench to Hammer Press goes to the previous week. Both weeks wrap in either direction. Tapping a neighboring card or using the arrow keys follows the same rule. Selecting a pagination dot keeps the current week. Manually changing the week keeps the selected workout day. Each card uses that week's source session, including **Friday legs**. EASY/HARD starts at the selected session's default and allows a manual session-level override without switching weeks, templates or individual exercise prescriptions. Changing the day or week resets the override to the new session's default. The selected day, week and override persist on the device. Earlier templates remain stored, while the imported rotation determines new session selection. Already active sessions continue unchanged. The rotation and prescriptions survive reload and JSON backup restore.

The earlier generic formats (`4 x 6–8`, `3 sets of 12 reps`, `rest 1:30`, aliases, and explicit compound/isolation defaults) remain supported. An illustrative generic example is in `examples/training-plan-format.txt`; it is never applied automatically.

The parser and draft validation live in `src/plan-import.ts`. They are pure functions returning `PlanDraft`; persistence is isolated in `src/plan-storage.ts`, and the editor is in `src/PlanImporter.tsx`. A future AI adapter can return the same draft shape and must pass the same review/confirmation path. No AI API, credentials, paid service, or backend is used.

Use the same hostname and port on your Mac as before to access your existing browser storage. If changing origins, export a JSON backup first and merge it into the new origin. The automated tests use isolated storage and do not apply sample plans to your personal data.

## Phase 2 feature 1: previous performance

New workouts store a separate frozen per-set reference from saved, finished workout history. Only completed sets are eligible. Exercise identity uses exact names (case and whitespace normalized only); equipment, punctuation and variant words are never fuzzy-matched. Renamed/unknown variants receive no comparison, and missing exercise intensity is not inferred from session intensity.

Candidates must match exercise-level intensity. An exact workout template (including rotation week) takes priority, then the same rotation week, then the newest eligible other session. Within each priority, the most recently finished session wins. Only that session supplies comparisons; missing or incomplete sets are not backfilled from older sessions. Source set numbers are respected; ambiguous duplicate historical numbers are not used.

Today’s weight/reps are editable suggestions from the reference, separate from planned targets and actual completion flags. No set is completed automatically. Editing today does not change the reference or history. Adding a set uses the same source snapshot if that set number was completed; removing a set changes only the active session. For numbered prescriptions, added sets follow the highest current source number without duplicating existing numbers.

The references and edited values persist with the active workout in IndexedDB, including reload/reopen. Previous results are inline beside inputs on wider screens and directly above the inputs on phones. Small icon-only set controls remain at the bottom right. Existing importer, rotation, history, PRs and offline behavior are unchanged.

## Layered Train selector

Train uses a playing-card stack: one centered active card, rotated/dimmed previous and next cards, and a hidden fourth card. Only transforms and opacity animate. Touch swipes and mouse drags select the next/previous workout; tapping an exposed side card brings it forward. Arrow buttons, keyboard arrows and pagination provide equivalent accessible controls. Reduced-motion preferences disable transitions, and vertical touch scrolling stays native.

Cards show the existing imported session's day, rotation week, intensity, photo and exercise/core/optional counts. Week selection, Hard/Easy variant routing and Start Workout use the same saved templates as before. Pagination sits below the stack; no training data or storage schema changes are made by this redesign.

## GitHub Pages and iPhone installation

Production assets and the PWA are scoped to `/strength-tracker/`. The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` checks pull requests and publishes `dist/` after a push to `main`.

See [GitHub Pages deployment and iPhone setup](docs/GITHUB_PAGES.md) for enabling Pages, deploying, installing through Safari, and safely transferring your existing JSON backup. A new host/device cannot automatically access your Mac's browser storage; no storage keys or training logic are changed by deployment.

## Compact iPhone Train home

On phones, Train hides the motivational intro, keeps a compact logo/rotation header and reduces the layered card stack by approximately 20%. Visible carousel arrows/counter are removed; swipe, side-card taps, keyboard selection and pagination remain available. Dots sit directly beneath the cards, followed by intensity and Start Workout.

Home spacing uses dynamic viewport units and safe-area padding. The page reserves space for the fixed bottom navigation and remains vertically scrollable on short viewports. `tests/mobile-home-layout.spec.ts` checks initial Start-button bounds and hit testing at 375×667, 390×844 and 393×852, plus scroll recovery at 320×480 with extra bottom padding. Playwright starts the production preview automatically if it is not already running; build before running browser tests. Phone-sized Chromium tests are not a physical Safari/device test.

## Active workout controller: Exercises and Timer

New workouts start an overall duration timer and a separate upward-counting warm-up stopwatch. The active workout has two horizontally swipeable panels, EXERCISES and TIMER, with accessible tab buttons. Vertical scrolling remains native; gestures originating in inputs or other interactive controls never switch panels. The existing home screen, imported rotation, previous-performance references, PRs and saved history are unchanged.

The shared floating action follows Warm-up → START SET → Set → STOP SET → Rest → START NEXT SET. All stopwatches count up using wall-clock timestamps, with no countdown, timeout, automatic next-set start or alarm. Each set stores its start/end/duration, and the controller stores completed rest intervals and warm-up end time. Screen changes do not create a second timer. The floating control reserves space above the fixed navigation and safe-area inset.

STOP SET always preserves the end time and starts rest immediately. Valid weight (explicit zero for bodyweight) and positive whole-number reps complete the set. Missing data leaves a persistent “timing saved” logging prompt; correcting that set's inputs completes it without altering its timing. Start/stop double-taps are guarded. Final completion offers Finish Workout, which confirms before writing one history record; a running set or unresolved timed logging prevents finish.

Sets and exercises can be selected manually. Running-set identity remains independent of browsing selection, so selecting another row does not move an active timer. Completed sets stay editable. Skip/include controls preserve entered values and allow optional work to be skipped. Added sets get stable IDs and retain previous-performance suggestions; removing a running set is rejected. Unknown-count core work is never assigned invented sets: explicitly add sets if performing it. Forward progression never wraps automatically after the final set.

The controller, selected/running position, panel, weights/reps, completion flags, pending logging, set timing and completed rests persist together in IndexedDB and JSON backups. Legacy active sessions retain their existing fields and receive a controller once on load; no historical set timing is fabricated. Elapsed time after locking/background suspension/reload comes from timestamps, not accumulated interval ticks. Unsaved-state errors retain the existing retry/export path.

`src/controller.ts` owns pure state transitions; `src/WorkoutScreens.tsx` renders the shared panels/action. Unit tests cover exact durations, long elapsed intervals without ticks, reload, double actions, missing logging, manual selection, skipping and stable IDs. Mobile Chromium tests cover the complete flow, persisted set timing, a simulated clock jump, screen switching/input exclusion and floating-button bounds. Physical iPhone background/lock behavior still requires device verification; changing the device clock also changes wall-clock elapsed calculations.

### Active-set spinner and floating Exercises timer

The currently running set's DONE control displays an animated purple spinner. Browsing/selecting another row does not move the spinner away from the running set. STOP SET removes the spinner; valid logging becomes a checkmark, while missing data retains the existing pending-logging behavior. Reduced-motion preferences use a static progress arc.

EXERCISES also shows a draggable circular timer with the current Warm-up / Set / Rest phase and its elapsed time, using the same persisted phase timestamp as TIMER. The bubble is absent on TIMER and returns on EXERCISES. Dragging uses pointer capture and does not trigger screen swiping; keyboard arrow keys provide an accessible move alternative. Its viewport-relative position is saved only when a drag ends (or an arrow key moves it), and survives screen changes and reload for that active workout. Position is clamped to the visible viewport and above the floating action; viewport/keyboard changes recompute bounds without changing workout timing.

Mobile browser tests verify spinner uniqueness/checkmark transition, live phase timing, drag/swipe isolation, fixed position while scrolling, screen changes, reload and resize bounds. Screenshots are generated at `test-results/active-set-spinner-and-bubble.png` and `test-results/floating-timer-bubble-mobile.png`.

### iPhone focus and keyboard viewport

Mobile/touch and iOS form controls use at least 16px computed font size to prevent Safari's small-input focus zoom. Standard controls use `touch-action: manipulation`; workout/card swipe regions explicitly allow vertical pan and pinch zoom. Only the draggable timer handle uses `touch-action: none`. The viewport meta keeps normal user scaling enabled, with no maximum-scale or user-scalable restriction.

A focused form control's visual viewport updates the fixed navigation/action offset and the scroll reserve when the keyboard reduces usable height. The bubble recomputes its bounds after that update. Pinch zoom is intentionally excluded from keyboard-offset compensation. No workout or stored data changes are made by this fix.

`tests/iphone-focus.spec.ts` verifies all form font sizes, weight/reps focus geometry, scale/width and overflow at 375×667, 390×844 and 393×852, plus simulated keyboard viewport offsets and pinch-scale exclusion. These are Chromium mobile tests; native Safari auto-zoom and physical keyboard behavior still require an on-device check.

### Compact active workout logging

Exercises uses a single sticky column header beneath the Exercises/Timer tabs, shared across the entire exercise list. Input rows keep 44px touch targets and 16px numeric text, with previous performance and set targets on a compact detail line underneath. The row-level skip icon has an exercise/set-specific accessible name. Active highlighting, the spinner, draggable live timer, keyboard positioning and horizontal screen navigation remain available. Mobile regressions cover long scrolling through imported exercises at 375×667, 390×844 and 393×852.
