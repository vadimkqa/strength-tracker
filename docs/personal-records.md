# Personal records dashboard

The PRs → Weight PRs view now has compact, touch-friendly exercise rows with a best logged load/reps pair, favorite star, weight sparkline (two or more sessions) and a detail disclosure. The existing Graphite & Muted Lavender tokens, brand, artwork, bottom navigation and safe-area behavior remain unchanged. Five normal rows take about 380px; long imported names wrap rather than scroll horizontally.

Favorites always appear first in their manually chosen order, independent of load or sorting. Use **Sort & session filters → Reorder favorites** for labeled move-up/down buttons. Remaining exercises sort alphabetically, by most recently trained, or by most recent PR. Search matches all saved aliases. **Recent PRs** means a weight, same-load rep or estimated-strength improvement within the last calendar month; a first observation establishes a baseline.

## Read-only calculations

`records.ts` reuses the existing `loggedSet`, `beatsRecord` and `exerciseIdentity` helpers. It does not alter saved sets or existing workout-completion, Progress, timer, plan, achievement or streak calculations.

- Only finished, non-cancelled/non-abandoned workouts and valid, completed, non-skipped sets/exercises are included. Sets still needing logging are excluded.
- Identity uses an explicit saved `exerciseKey` when available, otherwise the existing conservative name normalization (case and whitespace only). Shared explicit keys represent mapped aliases. Equipment/variant words and punctuation are never stripped; there is no automatic machine/barbell equivalence or cross-exercise strength ranking.
- Weight records use highest logged load, breaking equal-load ties by reps. Rep PRs require more reps at the same load. Estimated-strength PRs require a larger eligible estimate. Records in an intensity-filtered view are calculated within that view.
- Estimated 1RM uses Epley, `weight × (1 + reps / 30)`, for 2–10 reps; a logged single uses its actual weight. Zero load, nonpositive/invalid reps, bodyweight and assisted movements receive no estimate. Estimates are explicitly labeled.
- Named/kinded bodyweight movements show logged **added** load only. No body mass is inferred. An unclassified zero-load entry remains zero. Bodyweight volume is external-load volume, not total work.
- Assisted movements show assistance explicitly. Higher assistance never earns a weight/strength PR. Bests by rep count use the lowest assistance; assistance volume and resistance/1RM charts are not calculated. Rep comparisons retain the same-assistance requirement.
- First/last performances and full set history are chronological, using the saved workout finish timestamp. Session intensity prefers saved exercise intensity; legacy `heavy`/`hard` and `light`/`easy` map to Hard and Easy. Unknown intensity remains visible under All sessions and is not guessed.

The detail view includes heaviest load with reps, best estimated 1RM, best completed-set volume, best load per repetition count, first/latest performance and all eligible set history. History labels distinguish weight, rep and estimated-strength PRs.

## Charts

Each chart point represents an actual saved workout: maximum eligible estimate, maximum completed-set load, or the sum of completed-set `kg × reps` for this exercise. One point is shown for a single session. No missing weeks, zero baselines or interpolated records are created. X positions use actual timestamps; connecting lines join observations only. Null/invalid/nonfinite estimates or volumes are omitted, not changed to zero.

Choose 1, 3 or 6 calendar months, 1 year, or all time. Month boundaries clamp to the target month's last day. Tap near a chart point, use Previous/Next session buttons, or select a session to inspect its exact date/value. The latest eligible observation is selected initially. Metric/range and intensity changes recalculate from saved history without writing to it.

## Preferences and backup compatibility

`Data.prPreferences.favorites` is an optional ordered list of stable identities, saved through the existing queued data writes and IndexedDB. Old data/backups without this field require no migration. Invalid preference payloads fail validation before restoration writes.

The normal full-database backup includes favorites and their order. Restoration combines favorites: current order first, incoming-only favorites afterward in backup order. Restoring an old backup cannot erase current favorites. Other preference fields and existing workout snapshots continue through the established backup flow. Restore still requires the existing validated preview/confirmation and creates its normal safety snapshot. The UI explains the additive favorite behavior.

## Mobile screenshots

Captured against the production build with seeded logged-history test fixtures in Chromium iPhone-sized emulation; these are not physical-device Safari captures or the user's personal records.

| View                  | 390 × 844                                                   | 375 × 667                                                   |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Compact list          | [View](screenshots/personal-records/list-390.png)           | [View](screenshots/personal-records/list-375.png)           |
| Exercise detail       | [View](screenshots/personal-records/detail-390.png)         | [View](screenshots/personal-records/detail-375.png)         |
| Estimated 1RM chart   | [View](screenshots/personal-records/chart-estimate-390.png) | [View](screenshots/personal-records/chart-estimate-375.png) |
| Top weight chart      | [View](screenshots/personal-records/chart-weight-390.png)   | [View](screenshots/personal-records/chart-weight-375.png)   |
| Training volume chart | [View](screenshots/personal-records/chart-volume-390.png)   | [View](screenshots/personal-records/chart-volume-375.png)   |

Reproduce screenshots and mobile interaction/persistence/restore checks with `npx playwright test tests/records.spec.ts` after a production build. Unit coverage is in `records.test.ts` and `record-preferences.test.ts`. The existing workflow and full Chromium suite are unchanged; the new records browser suite is also included in the existing WebKit regression job. This PR extends backup preferences and is left for manual review under `AGENTS.md`; auto-merge is not enabled.
