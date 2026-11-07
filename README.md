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

The Train carousel centers one large card with both neighbors peeking in. It wraps between the first and last workout and supports native touch swipes, mouse drag, arrow buttons, keyboard left/right arrows, and pagination. EASY/HARD and START WORKOUT stay underneath it.

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

After a confirmed rotation import, Train retains the same four cards and adds a Week 1 / Week 2 selector. Each card uses that week's source session, including **Friday legs**. The Hard/Easy switch selects the corresponding scheduled variant/week; it does not reclassify individual exercises. Earlier templates remain stored, while the imported rotation determines new session selection. Already active sessions continue unchanged. The rotation and prescriptions survive reload and JSON backup restore.

The earlier generic formats (`4 x 6–8`, `3 sets of 12 reps`, `rest 1:30`, aliases, and explicit compound/isolation defaults) remain supported. An illustrative generic example is in `examples/training-plan-format.txt`; it is never applied automatically.

The parser and draft validation live in `src/plan-import.ts`. They are pure functions returning `PlanDraft`; persistence is isolated in `src/plan-storage.ts`, and the editor is in `src/PlanImporter.tsx`. A future AI adapter can return the same draft shape and must pass the same review/confirmation path. No AI API, credentials, paid service, or backend is used.

Use the same hostname and port on your Mac as before to access your existing browser storage. If changing origins, export a JSON backup first and merge it into the new origin. The automated tests use isolated storage and do not apply sample plans to your personal data.

## Phase 2 feature 1: previous performance

New workouts store a separate frozen per-set reference from saved, finished workout history. Only completed sets are eligible. Exercise identity uses exact names (case and whitespace normalized only); equipment, punctuation and variant words are never fuzzy-matched. Renamed/unknown variants receive no comparison, and missing exercise intensity is not inferred from session intensity.

Candidates must match exercise-level intensity. An exact workout template (including rotation week) takes priority, then the same rotation week, then the newest eligible other session. Within each priority, the most recently finished session wins. Only that session supplies comparisons; missing or incomplete sets are not backfilled from older sessions. Source set numbers are respected; ambiguous duplicate historical numbers are not used.

Today’s weight/reps are editable suggestions from the reference, separate from planned targets and actual completion flags. No set is completed automatically. Editing today does not change the reference or history. Adding a set uses the same source snapshot if that set number was completed; removing a set changes only the active session. For numbered prescriptions, added sets follow the highest current source number without duplicating existing numbers.

The references and edited values persist with the active workout in IndexedDB, including reload/reopen. Previous results are inline beside inputs on wider screens and directly above the inputs on phones. Small icon-only set controls remain at the bottom right. Existing importer, rotation, history, PRs and offline behavior are unchanged.
