import type { Data, Workout } from './data';
import { validLog } from './controller';
import { historyProgram, STREAK_TIME_ZONE } from './streak';
import { localDate, monday } from './calendar';
/** A saved performed session need not reproduce every planned exercise/set. */
export function calendarCompletionReason(w: Workout, now = Date.now()): string | null {
  if (
    w.isTest === true ||
    w.cancelled === true ||
    w.abandoned === true ||
    ['test', 'cancelled', 'canceled', 'abandoned'].includes(
      typeof w.status === 'string' ? w.status.toLowerCase() : '',
    )
  )
    return 'Excluded test or cancelled session';
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
  return null;
}

export interface ScheduledOccurrence {
  date: string;
  week: number;
  templateIds: string[];
}
/** Exact identities and occurrence dates only. Never compare display names or exercise lists. */
export function completedOccurrence(
  data: Data,
  programId: string,
  occurrence: ScheduledOccurrence,
  now = Date.now(),
  history: Workout[] = data.history,
) {
  return history.find((w) => {
    if ((w.programId || historyProgram(w, data.programs || [])?.id) !== programId) return false;
    if (!occurrence.templateIds.includes(w.name)) return false;
    if (w.cycleWeek !== undefined && w.cycleWeek !== occurrence.week) return false;
    if (calendarCompletionReason(w, now)) return false;
    if (w.scheduledFor) return w.scheduledFor === occurrence.date;
    // Legacy records lack scheduledFor. The exact template + local start week identifies
    // the occurrence, including a session that finishes after midnight. No records are changed.
    return monday(localDate(w.started, STREAK_TIME_ZONE)) === monday(occurrence.date);
  });
}
