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

The four cards map to the original templates in order: Bench Day → Tuesday Bench focus; DB Press Day → Thursday Back focus; Hammer Press Day → Saturday Chest focus; Leg Day → Sunday Legs. Existing exercise choices and customized plans are preserved rather than silently replaced to match the new names. HARD maps to the original heavy week; EASY retains the original easy-week behavior (the alternate Sunday plan).

Train contains the swipeable carousel, visible intensity selector, active workouts, set logging, timestamp-based timers, rest presets, exercise edits/additions, and set adjustment. Progress contains saved history and session details. PRs shows highest completed weight per exercise, with reps as the tiebreaker. Settings edits template set counts, default rest, and exports/merges backups. No Phase 2 analytics or programming features are included.

The original app is retained in `legacy/` for upgrade tests and reference; it is not part of the deployed build. Workout photographs are bundled from the public-domain `yuhonas/free-exercise-db` dataset; source paths are in `public/photos/README.md`. The four-screen mockup image was not attached; the implementation follows the supplied colors, structure, and visual requirements.
