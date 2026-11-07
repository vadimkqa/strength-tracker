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

1. Open **Settings → Import Training Plan** and choose your TXT file, or paste its contents. Files are decoded locally (UTF-8 or UTF-16 with a BOM); maximum 1 MB and 2,000 lines. Nothing is uploaded.
2. Optionally enter aliases, one per line, such as `Push A = Bench Day`. The four destination names are Bench Day, DB Press Day, Hammer Press Day and Leg Day. The original v1 template names are recognized too. An inline heading such as `Bench Day (aka Push A)` also defines an alias for later headings.
3. Click **Parse TXT**. Review each exercise name, workout assignment, Hard/Easy variant, set count, rep target, rest in seconds, and notes. Source lines remain available. Use move controls to change order, exclude non-exercise lines explicitly, or add missing exercises.
4. Fix missing values and acknowledge ambiguity warnings. Exercise categories are never guessed. If the file specifies category defaults (`Compounds: 4 sets; Isolation: 3 sets`), apply them using explicit category labels or manual category selection. Defaults before any workout heading are global; defaults within a workout apply only until the next workout/intensity heading. Missing reps must be supplied or explicitly left unspecified.
5. Inspect **Templates to replace**, check the explicit confirmation box, then click **Apply imported plan**. Cancelling or leaving a preview unapplied has no effect on saved templates. Editing the source/aliases requires reparsing; editing any preview detail resets confirmation.

Supported examples include `4 x 6–8`, `3 sets of 12 reps`, `sets: 4, reps: 8, rest: 90s`, `rest 1:30`, and `rest 2m 30s`. Exercise continuation lines such as `Sets:`, `Reps:`, `Rest:`, `Tempo:`, `RIR:` and `Notes:` are retained. The full source prescription stays in notes, including details not interpreted by the parser. Ranged or conflicting set/rest prescriptions require review; the parser never invents a single set count or rest duration.

The format example in [examples/training-plan-format.txt](examples/training-plan-format.txt) is illustrative, not a recommendation or a replacement for your own program. It is never applied automatically.

Only the explicitly listed workout/intensity groups are replaced, in the reviewed exercise order. Other templates, workout history (which supplies PRs), preferences, and the active session are preserved. Each confirmed import stores a pre-import snapshot and the new state in one IndexedDB transaction. The original v1 localStorage record remains untouched. Future sessions display imported rep targets and prescription notes; logged reps are never prefilled from a target range.

The parser and draft validation live in `src/plan-import.ts`. They are pure functions returning `PlanDraft`; persistence is isolated in `src/plan-storage.ts`, and the editor is in `src/PlanImporter.tsx`. A future AI adapter can return the same draft shape and must pass the same review/confirmation path. No AI API, credentials, paid service, or backend is used.

Use the same hostname and port on your Mac as before to access your existing browser storage. If changing origins, export a JSON backup first and merge it into the new origin. The automated tests use isolated storage and do not apply sample plans to your personal data.
