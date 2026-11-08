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

The Train carousel centers one large card with both neighbors peeking in. It keeps four positions (Bench, DB Press, Leg, Hammer Press) and supports native touch swipes, mouse drag, side-card taps, keyboard left/right arrows, and four pagination dots. EASY/HARD and pagination sit inside the active card; START WORKOUT remains immediately above bottom navigation.

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

After a confirmed rotation import, Train retains the same four cards and the Week 1 / Week 2 segmented switch. Cards sort by the selected week's imported weekday metadata: Tuesday Bench, Thursday DB Press, Friday Legs, Saturday Hammer Press in GYM.txt. Swiping forward from Saturday Hammer Press to Tuesday Bench advances to the next week; swiping backward from Bench to Hammer Press goes to the previous week. Both weeks wrap in either direction. Tapping a neighboring card or using the arrow keys follows the same rule. Selecting a pagination dot keeps the current week. Manually changing the week keeps the selected workout day. Each card uses that week's source session, including **Friday legs**. EASY/HARD starts at the selected session's default and allows a manual session-level override without switching weeks, templates or individual exercise prescriptions. Changing the day or week resets the override to the new session's default. The selected day, week and override persist on the device. Earlier templates remain stored, while the imported rotation determines new session selection. Already active sessions continue unchanged. The rotation and prescriptions survive reload and JSON backup restore.

The earlier generic formats (`4 x 6–8`, `3 sets of 12 reps`, `rest 1:30`, aliases, and explicit compound/isolation defaults) remain supported. An illustrative generic example is in `examples/training-plan-format.txt`; it is never applied automatically.

The parser and draft validation live in `src/plan-import.ts`. They are pure functions returning `PlanDraft`; persistence is isolated in `src/plan-storage.ts`, and the editor is in `src/PlanImporter.tsx`. A future AI adapter can return the same draft shape and must pass the same review/confirmation path. No AI API, credentials, paid service, or backend is used.

Use the same hostname and port on your Mac as before to access your existing browser storage. If changing origins, export a JSON backup first and merge it into the new origin. The automated tests use isolated storage and do not apply sample plans to your personal data.

## Phase 2 feature 1: previous performance

New workouts store a separate frozen per-set reference from saved, finished workout history. Only completed sets are eligible. Exercise identity uses exact names (case and whitespace normalized only); equipment, punctuation and variant words are never fuzzy-matched. Renamed/unknown variants receive no comparison, and missing exercise intensity is not inferred from session intensity.

Candidates must match exercise-level intensity. An exact workout template (including rotation week) takes priority, then the same rotation week, then the newest eligible other session. Within each priority, the most recently finished session wins. Only that session supplies comparisons; missing or incomplete sets are not backfilled from older sessions. Source set numbers are respected; ambiguous duplicate historical numbers are not used.

Today’s weight/reps are editable suggestions from the reference, separate from planned targets and actual completion flags. No set is completed automatically. Editing today does not change the reference or history. Adding a set uses the same source snapshot if that set number was completed; removing a set changes only the active session. For numbered prescriptions, added sets follow the highest current source number without duplicating existing numbers.

The references and edited values persist with the active workout in IndexedDB, including reload/reopen. Previous results are inline beside inputs on wider screens and directly above the inputs on phones. Small icon-only set controls remain at the bottom right. Existing importer, rotation, history, PRs and offline behavior are unchanged.

## Layered Train selector

Train uses a playing-card stack: one centered active card, rotated/dimmed previous and next cards, with additional cards hidden behind them. Card transforms, dimming and opacity animate. Touch swipes and mouse drags select the next/previous workout; tapping an exposed side card brings it forward. Keyboard arrows and pagination provide equivalent accessible controls; visible carousel arrows are omitted. Reduced-motion preferences disable transitions, and vertical touch scrolling stays native.

Cards show the existing imported session's day, rotation week, intensity, photo and exercise/core/optional counts. Week selection, Hard/Easy variant routing and Start Workout use the same saved templates as before. Pagination sits inside the active card; no training data or storage schema changes are made by this redesign.

## GitHub Pages and iPhone installation

Production assets and the PWA are scoped to `/strength-tracker/`. The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` checks pull requests and publishes `dist/` after a push to `main`.

See [GitHub Pages deployment and iPhone setup](docs/GITHUB_PAGES.md) for enabling Pages, deploying, installing through Safari, and safely transferring your existing JSON backup. A new host/device cannot automatically access your Mac's browser storage; no storage keys or training logic are changed by deployment.

## Portrait iPhone Train home

Train keeps the approved branding and uses a portrait card at 78% of the available screen width, with full-size tilted/dimmed neighbors and readable vertical edge names. A flex/grid layout gives the photograph the remaining vertical space instead of fixing the card to a short image rail. The active card contains metadata, EASY/HARD and dynamic pagination; controls are excluded from drag and arrow-key carousel handling. The segmented week control displays only supplied multi-week rotations and calls the existing week-selection handler.

Start Workout stays below the stack, above the safe-area-padded fixed navigation, with save status underneath. The layout grows naturally for long titles, many indicators or short viewports and permits normal vertical scrolling. No workout selection, template, storage, timer, branding or keyboard logic is changed. Mobile regressions cover 375×667, 390×844, 393×852 and 430×932, including portrait proportions, neighboring card geometry, embedded controls, both week boundaries, all eight GYM sessions, reload/offline behavior, and native vertical scrolling on a shorter screen.

Home spacing uses dynamic viewport units and safe-area padding. The page reserves space for the fixed bottom navigation and remains vertically scrollable on short viewports. `tests/mobile-home-layout.spec.ts` checks initial Start-button bounds and hit testing at 375×667, 390×844, 393×852 and 430×932, plus scroll recovery at 320×480 with extra bottom padding. Playwright starts the production preview automatically if it is not already running; build before running browser tests. Phone-sized Chromium tests are not a physical Safari/device test.

## Active workout controller: Exercises and Timer

New workouts start an overall duration timer and a separate upward-counting warm-up stopwatch. The active workout has two horizontally swipeable panels, EXERCISES and TIMER, with accessible tab buttons. Vertical scrolling remains native; gestures originating in inputs or other interactive controls never switch panels. The existing home screen, imported rotation, previous-performance references, PRs and saved history are unchanged.

The shared floating action follows Warm-up → START SET → Set → STOP SET → Rest → START NEXT SET. All stopwatches count up using wall-clock timestamps, with no countdown, timeout, automatic next-set start or alarm. Each set stores its start/end/duration, and the controller stores completed rest intervals and warm-up end time. Screen changes do not create a second timer. The floating control reserves space above the fixed navigation and safe-area inset.

STOP SET always preserves the end time and starts rest immediately. Valid weight (explicit zero for bodyweight) and positive whole-number reps complete the set. Missing data leaves a persistent “timing saved” logging prompt; correcting that set's inputs completes it without altering its timing. Start/stop double-taps are guarded. Final completion offers Finish Workout, which confirms before writing one history record; a running set or unresolved timed logging prevents finish.

Sets and exercises can be selected manually. Running-set identity remains independent of browsing selection, so selecting another row does not move an active timer. Completed sets stay editable. Skip/include controls preserve entered values and allow optional work to be skipped. Added sets get stable IDs and retain previous-performance suggestions; removing a running set is rejected. Unknown-count core work is never assigned invented sets: explicitly add sets if performing it. Forward progression never wraps automatically after the final set.

The controller, selected/running position, panel, weights/reps, completion flags, pending logging, set timing and completed rests persist together in IndexedDB and JSON backups. Legacy active sessions retain their existing fields and receive a controller once on load; no historical set timing is fabricated. Elapsed time after locking/background suspension/reload comes from timestamps, not accumulated interval ticks. Unsaved-state errors retain the existing retry/export path.

`src/controller.ts` owns pure state transitions; `src/WorkoutScreens.tsx` renders the shared panels/action. Unit tests cover exact durations, long elapsed intervals without ticks, reload, double actions, missing logging, manual selection, skipping and stable IDs. Mobile Chromium tests cover the complete flow, persisted set timing, a simulated clock jump, screen switching/input exclusion and floating-button bounds. Physical iPhone background/lock behavior still requires device verification; changing the device clock also changes wall-clock elapsed calculations.

### Active-set spinner and floating Exercises timer

The currently running set's row action displays an animated purple spinner. Browsing/selecting another row does not move the spinner away from the running set. STOP SET removes the spinner; valid logging becomes a checkmark, while missing data retains the existing pending-logging behavior. Reduced-motion preferences use a static progress arc.

EXERCISES also shows a draggable circular timer with the current Warm-up / Set / Rest phase and its elapsed time, using the same persisted phase timestamp as TIMER. The bubble is absent on TIMER and returns on EXERCISES. Dragging uses pointer capture and does not trigger screen swiping; keyboard arrow keys provide an accessible move alternative. Its viewport-relative position is saved only when a drag ends (or an arrow key moves it), and survives screen changes and reload for that active workout. Position is clamped to the visible viewport and above the floating action; viewport/keyboard changes recompute bounds without changing workout timing.

Mobile browser tests verify spinner uniqueness/checkmark transition, live phase timing, drag/swipe isolation, fixed position while scrolling, screen changes, reload and resize bounds. Screenshots are generated at `test-results/active-set-spinner-and-bubble.png` and `test-results/floating-timer-bubble-mobile.png`.

### iPhone focus and keyboard viewport

Mobile/touch and iOS form controls use at least 16px computed font size to prevent Safari's small-input focus zoom. Standard controls use `touch-action: manipulation`; workout/card swipe regions explicitly allow vertical pan and pinch zoom. Only the draggable timer handle uses `touch-action: none`. The viewport meta keeps normal user scaling enabled, with no maximum-scale or user-scalable restriction.

A focused form control's visual viewport updates the fixed navigation/action offset and the scroll reserve when the keyboard reduces usable height. The bubble recomputes its bounds after that update. Pinch zoom is intentionally excluded from keyboard-offset compensation. No workout or stored data changes are made by this fix.

`tests/iphone-focus.spec.ts` verifies all form font sizes, weight/reps focus geometry, scale/width and overflow at 375×667, 390×844 and 393×852, plus simulated keyboard viewport offsets and pinch-scale exclusion. These are Chromium mobile tests; native Safari auto-zoom and physical keyboard behavior still require an on-device check.

### Compact active workout logging

Exercises uses individually collapsible cards. Each expanded card has its own non-sticky SET / REPS / WEIGHT (KG) / ACTION labels, sharing the exact grid with its rows. Inputs and actions retain 44px touch targets and 16px numeric text. Previous performance, targets, effort and rest prescriptions remain directly under each row; notes and set options are expandable. Play selects a pending set; only the shared Start/Stop controller starts its timing. Completed sets show purple checks, while skipped sets remain distinct.

An exercise receives a green check and collapses only when all its sets have valid completed logs, with no running set or unresolved logging. Skipped sets do not qualify. The next active exercise opens automatically. Manual expansion choices, including reopened completed exercises, persist in the active session by exercise ID. Set edits and row keys also use stable IDs. Completing missing logging while typing defers collapse until focus leaves the exercise. No historical records or plan templates are changed.

The numeric-keyboard layout uses visual viewport measurements only to avoid occlusion, never to resize the table. While the keyboard is open, bottom navigation is temporarily hidden and the smaller shared controller docks above the keyboard; it returns on dismissal. The draggable bubble moves away from the focused field without replacing its saved position. Focus correction scrolls only enough to reveal an obscured input. Pinch zoom remains available. Mobile Chromium regressions cover all three sizes (375×667, 390×844 and 393×852), simulated keyboard resize/offset, scrolling, header swipes, bubble dragging and persisted sessions. A physical iPhone Safari/PWA check is still needed for the native keyboard and OS lock/resume behavior.

## Universal, local training-plan importing

Settings accepts **TXT, pasted text, text-based PDF, DOCX, CSV and XLSX**. Extraction runs in the browser with bundled libraries; no API key, server or paid service is used. The installed PWA precaches the extraction chunks and PDF worker so imports also work offline.

The importer separates four stages:

- `src/importing/extraction.ts` reads document text, paragraphs and tables, with page/sheet references. It never inserts document HTML into the app or executes spreadsheet formulas.
- `src/importing/parser.ts` parses supported headings, exercise prescriptions and table columns into the versioned model in `model.ts`.
- `ProgramReview.tsx` edits program, week, workout, exercise and per-set details. Missing/ambiguous information and unsupported sections need explicit review. Unknown values can remain unset. Saving also requires a separate replacement confirmation.
- `saving.ts` validates and compiles templates; `plan-storage.ts` writes a pre-import snapshot and the new plan in one IndexedDB transaction. History, records and already active sessions are preserved.

Schema version 1 contains program and template identifiers, source text/references, workout order, optional weekdays and multi-week rotation, exact exercise identities/order, per-set reps/weight/RPE/RIR/effort/rest, optional exercises, alternatives, superset/circuit memberships, and review warnings. Explicit targets with an unknown set count are retained as unallocated/default targets; the importer does not create sets to accommodate them. Planned targets never become logged performance automatically. A future parser can produce the same model and reuse validation, preview and storage.

### Supported source structures

Use weekday headings (`Monday – Chest + Triceps`), `Workout A`, `Session B`, `Day 1: Upper`, `Day A`, `Upper/Lower`, `Push/Pull/Legs`, `Full Body A`, or another explicit heading ending in a colon. Optional numeric week headings can include titles (`Week 3 – Build`). Without weekdays, source workout order is retained. Example:

```text
Program: Alternating strength
Week 1
Workout A
- Squat 3 x 5 @ 80 kg RPE 8 rest 2 min
Superset B:
B1. Row 3 x 10 rest 90s
Optional: Curl 2 x 12 rest 60s
End superset
Workout B
- Deadlift 2 x 5 RIR 2
Optional: Plank or Dead Bug
```

`Optional:` is supported as a line prefix. Group headings (`Superset A:`, `Circuit 3 rounds:`) retain relationships and explicitly supplied rounds; rounds are not silently converted into exercise set counts. Indexed prescription continuations retain source set numbering. Multiple/ranged prescriptions that cannot be represented reliably are flagged, with the full source retained for correction.

CSV/XLSX and DOCX tables recognize an **Exercise** column plus **Workout** (or a preceding document workout heading). Optional columns include Week, Day, Sets, Set/Set number, Reps, Weight, Unit, RPE, RIR, Effort, Rest seconds, Optional, Alternatives, Superset, Circuit, Group and Notes. A Rest column needs units, e.g. `90s`; `Rest seconds` explicitly supplies the unit. Unknown nonempty columns are reported. Quoted CSV cells and all XLSX sheets are extracted. Unsupported tables remain source material for manual correction instead of creating guessed exercises.

### Carousel and compatibility

The home deck uses the imported number of workout templates for the selected week, including weeks with different counts. Weekday metadata controls chronological ordering; unscheduled programs retain source order. Swiping across an end advances/reverses the supplied rotation and updates the week segmented switch. One- and two-card decks avoid duplicated side cards and accidental week changes on a front-card tap. The selected template ID determines what Start Workout loads.

The established GYM.txt parser remains a compatibility adapter: its two weeks, eight templates, Friday legs, exact set numbering and exercise-level intensities are preserved, and confirmed imports also gain a normalized program representation. Classic Hard/Easy variants remain accessible. Existing JSON backups and legacy IndexedDB/localStorage data remain readable; versioned program backups are structurally validated before restore.

### Limits and review

This is a rule-based importer, not an interpreter for arbitrary training prose. Unsupported sections, ambiguous prescriptions and missing fields are visible in review. PDF reading order is explicitly flagged for comparison with the original; image-only/scanned PDFs require OCR outside this importer. Password-protected, corrupt or unsupported documents report extraction errors without changing saved templates. Limits are 10 MB per file, 32 MB expanded archives, 100 PDF pages, and 2 MB / 10,000 extracted lines.

The actual uploaded `basic_gym_workout_plan.txt` is a regression fixture: **five weekday sessions and 29 exercises**. Its source note that the remainder was cut off is preserved and flagged; no additional exercises/days or rest durations are invented. Other regressions cover full-body, Upper/Lower, Push/Pull/Legs, A/B, six-day splits, three-week rotations, varying weekly card counts, supersets, optional alternatives, table targets, GYM.txt, all extraction formats, offline extraction and backup/history protection. Browser tests generate review/home screenshots under `test-results/`.

To review locally: `npm ci`, `npm run dev`, then open `http://localhost:5173/strength-tracker/` and use **Settings → Import Training Plan**. Run `npm test`, `npm run build`, and `npm run test:e2e` for validation.

## Save Data on iPhone / iCloud Drive

**Settings → Save Data** prepares a complete, versioned JSON database backup on the device. The file is always suggested as **`strength-tracker-backup.json`**.

On an installed iPhone PWA with file sharing support:

1. Tap **Save Data**.
2. Choose **Save to Files** in the native Share sheet.
3. Choose your iCloud Drive folder, keep the suggested filename, and choose **Replace** if iOS offers it for the existing file.

The backup is prepared before the tap so native sharing is called while the user gesture remains active. It first tries a JSON file; a plain-text MIME fallback retains the same `.json` name and exact JSON contents when needed. If file sharing is unavailable, the app uses a supported save picker or browser download. A failed share offers an explicit **Download JSON instead** action; cancelling does not trigger another download. Closing a Share sheet is not reported as proof that a file reached iCloud.

Safari/iOS controls destination selection and replacement. The app cannot silently overwrite an iCloud file, retain Safari folder permissions or promise that a particular system interface will offer Replace. You select the destination each time; the app does not store file/directory handles. Desktop save pickers similarly open afresh for each save.

The file includes the `state` and `backups` IndexedDB stores: all history/completed sets, active workout and timestamp-based timers, previous-performance references, imported/legacy plans and custom exercises, PR-related records, settings, extra stored state, original migration data and safety snapshots. Snapshot reads are transactional and include the newest in-memory data after queued saves. Preparing or cancelling a backup changes no training data. The existing emergency recovery download remains available when normal saving fails.

**Restore Data** opens the native file chooser. JSON is validated before a restore review appears. Review shows its recorded backup date, workout/set/template counts, program, active session, default rest and safety snapshot count. Older JSON backups are still accepted and honestly show **Not recorded (older backup)** rather than inventing a creation date. Backups are limited to 100 MB.

Restore requires a separate checkbox and **Confirm Restore Data** action. It merges history, updates matching plans/settings, keeps the currently running workout, preserves incoming conflicting sessions, and never clears the database first. Source archives are imported without overwriting existing archive IDs, identical archives are deduplicated, and conflicts in extra state records are retained in safety archives. A pre-restore snapshot, imported archives and the resulting state commit in one transaction; failed writes roll the transaction back.

`src/backup.ts` implements format/validation, full database snapshots, delivery and restoration; `src/BackupPanel.tsx` provides the themed Settings controls. Tests cover backup round trips, cancellation, native share activation, MIME fallback, picker/download fallback, validation, confirmation, older JSON, archive collisions, active-session/PR preservation, latest edits, failed-write rollback and offline standalone mobile simulations. Native iOS Share/Files UI is OS-controlled and still needs an on-device smoke test; automated browser coverage uses Chromium mobile emulation with native APIs simulated.

### Training program library

Settings → Workout plan now selects a complete **Training program → Week (only for multi-week programs) → Workout day / session**. Selecting a program makes it active on Train; each program remembers its own carousel position, rotation week and intensity override. Programs without weekdays keep their source order and have no assigned dates. Rename a program with **Rename program**. Edit exercise names, order and set counts within the selected session; edits affect future workouts only. Programs with no sessions have a notes/source editor and do not create carousel cards.

Every confirmed TXT or universal import adds an independent program, including repeated documents with matching workout names or IDs. Library version 1 (`programs`, `activeProgramId`, `programLibraryVersion`) stores separate template dictionaries and optional normalized source/schedule metadata. The flat `plan` lookup remains a compatibility cache with the active program overlaid; `trainingProgram` and rotation fields project the active program. Selectors use library membership, never the flat cache keys. The database version, history, exercise performance identities and active session are unchanged. Switching programs never replaces an in-progress workout. JSON database backups include all programs; restoring unions libraries and keeps conflicting program versions separately.

On first load, migration groups known built-in templates separately, retains the current normalized import and recovers earlier complete programs from explicit pre-import snapshots. It never groups unrelated templates by similar names. Orphaned templates remain independent **Needs review** entries, with original tuples intact; review their ownership and rename them in Settings before starting them. A `before-program-library` snapshot and the migration commit together; failed writes abort both. Existing localStorage and archived snapshots remain intact.

Expanded live exercise cards have **− Remove set** on the left and **+ Add set** on the right. Their text is deliberately small while touch targets remain at least 44px high. Removal targets the last set. Removing a completed, unresolved or running set asks for confirmation; a running set is stopped first and rest begins. Removed records and timestamps remain in `controller.removedSets` in the saved session/backup payload, while the remaining set IDs, logs and timer state stay intact.
