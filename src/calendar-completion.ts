import type { Workout } from './data';
import { validLog } from './controller';
/** Calendar suggestion eligibility is intentionally unchanged by training-day streak rules. */
export function calendarCompletionReason(w: Workout, now = Date.now()): string | null {
  if (
    w.streakExcluded === true ||
    w.isTest === true ||
    w.cancelled === true ||
    w.abandoned === true ||
    ['test', 'cancelled', 'canceled', 'abandoned'].includes(
      typeof w.status === 'string' ? w.status.toLowerCase() : '',
    )
  )
    return 'Excluded practice, test or cancelled session';
  if (
    !Number.isFinite(w.started) ||
    !Number.isFinite(w.finished) ||
    w.finished! <= w.started ||
    w.finished! > now
  )
    return 'No valid saved completion time';
  if (w.controller?.phase === 'set' || w.controller?.running) return 'A set was still running';
  if (
    !w.exercises.length ||
    !w.exercises.some((e) =>
      e.sets.some((s) => s.done && !s.skipped && !s.needsLogging && validLog(s)),
    )
  )
    return 'No valid completed sets';
  if (
    w.exercises.some((e) =>
      e.sets.some((s) => s.needsLogging || (s.done && (!validLog(s) || s.skipped))),
    )
  )
    return 'Invalid or unresolved completed logging';
  for (const e of w.exercises) {
    if (e.optional) continue;
    if (
      e.skipped ||
      !e.sets.length ||
      e.sets.some((s) => !s.done || s.skipped || s.needsLogging || !validLog(s))
    )
      return 'Required exercises or sets are unfinished';
  }
  return null;
}
