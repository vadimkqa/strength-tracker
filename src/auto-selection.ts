import type { Data, Workout } from './data';
import { currentProgram, programView, rememberProgram } from './programs';
import { scheduleMetadata } from './program-schedule';
import { addDays, localDate, monday, cycleForDate, assertCalendar } from './calendar';
import { historyProgram, workoutStreakReason } from './streak';
import { carouselWorkouts } from './workouts';
export interface WorkoutSuggestion {
  date: string;
  week: number;
  slotId: string;
  templateId: string;
  templateIds: string[];
  intensity: string;
  kind: "TODAY'S WORKOUT" | 'CATCH-UP WORKOUT' | 'NEXT WORKOUT';
}
export function calendarStatus(data: Data) {
  const p = currentProgram(data);
  if (!p || p.review)
    return 'Review the active training program before enabling calendar selection.';
  const metadata = scheduleMetadata(p);
  if (!metadata.hasWeekdays)
    return 'Assign workout weekdays in Settings → Calendar workout selection.';
  if (!p.calendar) return 'Set a rotation anchor in Settings → Calendar workout selection.';
  if (!p.calendar.enabled) return 'Calendar workout selection is off.';
  if (!metadata.cycles.some((c) => c.week === p.calendar!.anchorWeek))
    return 'Review the calendar anchor: its program week is no longer available.';
  return null;
}
export function suggestWorkout(
  data: Data,
  now = Date.now(),
  history: Workout[] = data.history,
): WorkoutSuggestion | null {
  if (calendarStatus(data)) return null;
  const p = currentProgram(data)!,
    config = p.calendar!,
    metadata = scheduleMetadata(p),
    weeks = metadata.cycles.map((c) => c.week),
    zone = data.streak?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    today = localDate(now, zone),
    currentMonday = monday(today);
  const occurrences: WorkoutSuggestion[] = [];
  // A current/previous rotation is relevant for catch-up; older sessions remain manually accessible.
  for (let offset = -weeks.length; offset <= weeks.length + 1; offset++) {
    const start = addDays(currentMonday, offset * 7),
      week = cycleForDate(start, config, weeks);
    const cycle = metadata.cycles.find((c) => c.week === week);
    if (!cycle) continue;
    for (const session of cycle.sessions) {
      const date = addDays(start, session.day!);
      occurrences.push({
        date,
        week: cycle.week,
        slotId: session.slotId,
        templateId: session.templateIds[0],
        templateIds: session.templateIds,
        intensity: /^(hard|heavy)$/i.test(session.intensity || '')
          ? 'heavy'
          : session.intensity?.toLowerCase() || '',
        kind:
          date === today ? "TODAY'S WORKOUT" : date < today ? 'CATCH-UP WORKOUT' : 'NEXT WORKOUT',
      });
    }
  }
  occurrences.sort((a, b) => a.date.localeCompare(b.date));
  const valid = history.filter(
    (w) =>
      !workoutStreakReason(w, now) &&
      (w.programId ? w.programId === p.id : historyProgram(w, data.programs || [])?.id === p.id),
  );
  const isComplete = (s: WorkoutSuggestion) =>
    valid.some(
      (w) =>
        s.templateIds.includes(w.name) &&
        (w.scheduledFor
          ? w.scheduledFor === s.date
          : monday(localDate(w.finished!, zone)) === monday(s.date)),
    );
  const scheduledToday = occurrences.filter((s) => s.date === today);
  const todayUnfinished = scheduledToday.find((s) => !isComplete(s));
  if (todayUnfinished) return todayUnfinished;
  const latestDate = occurrences.filter((s) => s.date < today).at(-1)?.date;
  // Today's completed session (especially the last of a week) moves forward rather than blocking on older misses.
  if (!scheduledToday.length && latestDate) {
    const catchup = occurrences.find((s) => s.date === latestDate && !isComplete(s));
    if (catchup) return catchup;
  }
  return occurrences.find((s) => s.date > today && !isComplete(s)) || null;
}
export function matchesSuggestion(data: Data, suggestion: WorkoutSuggestion | null) {
  if (!suggestion || data.rotationWeek !== suggestion.week) return false;
  const cards = carouselWorkouts(
    data.rotation,
    data.rotationWeek,
    data.trainingProgram,
    data.week,
    currentProgram(data)?.calendar?.days,
  );
  const card = cards.find((c) => c.key === data.carouselWorkout) || cards[0];
  return (
    card?.key === suggestion.slotId &&
    !!card.templateKey &&
    suggestion.templateIds.includes(card.templateKey)
  );
}
export function applyAutomaticSelection(
  data: Data,
  now = Date.now(),
  savedHistory = data.history,
): Data {
  if (data.active) return data;
  const suggestion = suggestWorkout(data, now, savedHistory);
  if (!suggestion) return data;
  const next = {
    ...data,
    rotationWeek: suggestion.week,
    carouselWorkout: suggestion.slotId,
    week: suggestion.intensity,
    difficultyOverride: undefined,
  };
  return rememberProgram(structuredClone(next));
}
export function automaticSelectionKey(data: Data, now: number) {
  const zone = data.streak?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return JSON.stringify([
    localDate(now, zone),
    zone,
    data.activeProgramId,
    currentProgram(data)?.calendar,
    data.history.map((w) => [
      w.id,
      w.finished,
      w.name,
      w.programId,
      w.scheduledFor,
      workoutStreakReason(w, now),
    ]),
  ]);
}
export function configureCalendar(
  data: Data,
  config: NonNullable<ReturnType<typeof currentProgram>>['calendar'],
): Data {
  if (!config) throw Error('Choose a rotation anchor and weekday assignments.');
  assertCalendar(config);
  const next = structuredClone(data),
    p = currentProgram(next);
  if (!p) throw Error('Choose a training program first.');
  if (!programView(p).workouts.some((w) => w.week === config.anchorWeek))
    throw Error('Choose a valid anchor program week.');
  p.calendar = structuredClone(config);
  if (config.enabled && !scheduleMetadata(p).hasWeekdays)
    throw Error('Assign a weekday to every workout before enabling automatic selection.');
  return next;
}
