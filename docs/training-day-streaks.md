# Training-day streak rules

The streak engine now counts **finished saved sessions by distinct Europe/Vienna completion date**. It does not examine exercises, prescribed sets/reps, skipped sets, names, template matches or program ownership for credit. Practice/test exclusion flags, cancellation/abandonment and invalid, unsaved or future completion times remain disqualifiers. Active sessions outside saved history never count.

- One date earns one credit, including rest-day training. Additional sessions on that date remain in history.
- Weekly targets default to distinct scheduled weekdays for the applicable program week. Settings supports selecting weekdays and overriding the target with 1–7 days. Reset the override to use the selected weekday count or imported schedule again.
- Calendars run Monday–Sunday in **Europe/Vienna**, across DST. Purple checks show actual completed dates; planned circles, rest labels and missed-day markers are reminders, not exercise/template requirements.
- Make-ups on any different date in the same week can complete the target. A missed-day marker can coexist with a successful week when training was made up elsewhere.
- An unfinished current week preserves the previous run. Only an ended, unsuccessful week breaks it.
- A current target change uses the latest selected requirement; an earlier easier goal cannot bypass it. Past saved definitions remain available. Credits count across programs because a training day is independent of the selected plan's exercise names.

## Safe recalculation

`StreakState.rulesVersion = 2` marks the new interpretation without replacing the existing version-1 payload or changing workout records. `trainingDays` stores per-program weekday overrides separately from imported plans and calendar workout-selection settings. Old backups remain readable; weekday arrays are validated before restore and conflicting restored program versions keep separate settings.

The first upgrade of existing streak metadata writes a `before-training-day-streaks` archive and recalculated state in one transaction. Write failures roll back both. Raw history and prior target snapshots are not rewritten. Old scheduled targets are interpreted by distinct retained weekday metadata rather than template count; known frequency is used to recover earlier completed dates that the previous tracker ignored. Unspecified schedules require configuration instead of an invented target.

Existing award IDs, thresholds, normal artwork and secret rules are unchanged. Achievements are revalidated from recalculated history as before. Notifications remain gated on successful persistence. The 13 original PNG hashes are unchanged. Workout logging and automatic calendar suggestion eligibility retain their previous behavior in a separate qualification helper.

Tests cover renamed/modified workouts, skipped prescriptions, 3/4 retroactive progress, scheduled/rest dates, same-date repeats, Sunday make-ups, pending weeks, target overrides, varying program cycles, Vienna DST boundaries, legacy migration/rollback, JSON restoration, conflicting program versions and all original artwork.

Mobile screenshots:

- [3/4 training-day calendar](screenshots/training-days-calendar.png)
- [Sunday make-up completes 4/4](screenshots/training-days-make-up.png)
- [Weekday and target settings](screenshots/training-days-settings.png)
