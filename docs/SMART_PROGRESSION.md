# Smart Progressive Overload

Optional, off by default. Enable **Settings → Smart Progressive Overload → On**. Each exercise then has a collapsed **Progression** section showing a previous comparable session, a proposed action and its explanation. The existing exercise PR detail page gains a chronological progression timeline alongside its existing charts.

## Explicit control

Suggestions are derived on demand from saved history and preferences. Opening a suggestion never copies it into logging inputs. **Use target** changes only eligible unfinished draft fields. Replacing already entered values requires confirmation; completed, skipped, pending-log and currently running sets stay untouched. A target never marks a set completed, starts/stops a timer, edits a prescription or changes a program. Turning the feature off hides it without losing increments.

The existing previous-performance autofill behavior is unchanged; any values it already populated are treated as existing input and require confirmation before a different progression target replaces them.

## Conservative comparison

Comparisons require an exact exercise identity or an explicitly saved equivalent identity, matching program ownership, session intensity, exercise intensity, load kind, set numbering/count and per-set rep/effort/weight/rest prescriptions. With legacy missing program ownership, the workout name must also match. Only fully logged, valid exercise performances in finished, non-cancelled sessions qualify. Skipped, unfinished, invalid and ambiguous duplicate occurrences are not evidence of readiness. Multiple sessions on the same day retain their separate timestamps and IDs.

- **Increase reps:** one additional rep total on the first eligible set, at the same weight, within the prescribed range.
- **Increase weight:** two comparable sessions at the upper bound, with matching loads and any required effort evidence. Start at the lower rep bound. Proposed increases are capped at 5%.
- **Maintain:** one good session is insufficient for a weight increase. Easy/MID and technique/recovery sessions stay conservative; they are not failed progression attempts.
- **Recovery / reduce:** at least three comparable sessions, with repeated decline at matching loads or repeated below-range reps. Offer one increment less only when it is positive and no more than 5%; otherwise offer a neutral recovery message. This is not a fatigue, overtraining or injury diagnosis.
- **Not enough history:** missing intensity, unspecified/inconsistent rep ranges, incomparable plans/prescriptions, unknown zero-load resistance or assisted load. Previous data may be shown neutrally, without inventing targets.

Bodyweight rep suggestions use only logged added load; no body mass is invented. Assistance is never treated as resistance. Fixed prescribed weights remain fixed. Rep, weight and estimated-strength PRs retain the existing analytics rules.

## Effort evidence

Old records save prescribed effort, not proof that it was met. They receive no inferred confirmations. For an active exercise with an effort target, users may optionally confirm **“I kept the prescribed effort in this session”** after logging all sets. This self-report is saved with that session and is valid only for the exact logged weights/reps and prescriptions. Changed or invalid logs invalidate it. Finished historical workouts cannot be confirmed retroactively.

A matching confirmation is needed before suggesting extra reps for an effort-targeted exercise; two matching top-range confirmations are needed before more weight. Unrecognized effort instructions remain conservative. A proposal is conditional on continuing to respect prescribed effort, never on reaching failure merely to beat a record.

## Weight increments and persistence

Exercise-specific overrides are available in the exercise section, PR detail and Settings. Period/comma decimals and up to three decimal places are supported, including 0.125 kg; manual increments are not restricted to quarter-kilogram steps. Integer-gram arithmetic preserves fractional targets.

Recognizable free-weight upper-body movements start with a 1 kg proposal; lower-body movements start with 2.5 kg. These are proposals to check against equipment, not claims about supported plates or machines. Unrecognized equipment/machines require an explicit override before suggesting more weight. Even configured increments above 5% produce a maintain suggestion.

Preferences and optional effort self-reports survive the existing full-database backup/restore path. Restore is additive: resident preference choices win conflicting overrides, incoming-only overrides are retained, and a fresh restore preserves the incoming settings. No duplicate history or synthetic chart data is stored. Deleting/restoring history recomputes suggestions and timeline events on the next render.

## Mobile previews and validation

The previews use a 390 × 844 simulated mobile browser and isolated demonstration fixtures, not production user records or physical-iPhone verification. New UI stays in ordinary document flow. Existing timer, keyboard controls, drag-and-drop and safe-area behavior are retained.

- [Suggestion inside Bench Press](screenshots/progression/exercise-iphone.png)
- [Existing exercise chart](screenshots/progression/chart-iphone.png)
- [Progression timeline](screenshots/progression/detail-iphone.png)

Unit coverage includes matching/aliases, actual imported program separation, effort evidence and invalidation, rep and weight progression, repeated decline, missing history/ranges/intensity, fractional arithmetic, target application guards, old saved data, IndexedDB reload and full-database export/restore. Browser coverage includes explicit conflict consent, timer preservation, effort confirmation/reload, opt-out persistence, 320px/390px standalone viewport simulation and the existing input navigation. The new browser suite is included in the normal required WebKit CI job; the complete Chromium suite remains required. Manual review is required; auto-merge stays off.
