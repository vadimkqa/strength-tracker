import { finishWorkout, saveData, type Data, type Workout } from './data';
import {
  calculateStreak,
  syncStreaks,
  workoutStreakReason,
  STREAK_LEVELS,
  STREAK_TIME_ZONE,
  calendarWeek,
  localDate,
} from './streak';
import { secretUnlocked } from './streak-artwork';
import { sessionRecords, workoutStatistics } from './workout-results';
import { templateLabel } from './workouts';

export const savedWorkoutName = (data: Data, w: Workout) =>
  w.displayName ||
  data.trainingProgram?.workouts.find((t) => t.id === w.name && !t.legacyKey)?.name ||
  templateLabel(w.name);

/** Commit before returning success. Caller serializes this with ordinary edits; retries reuse the session ID/time. */
export async function saveWorkoutCompletion(
  data: Data,
  id: string,
  at: number,
  persist: (data: Data) => Promise<unknown> = saveData,
) {
  if (data.history.some((w) => w.id === id && Number.isFinite(w.finished))) return data;
  if (data.active?.id !== id)
    throw Error('The active workout has changed. Review it before finishing.');
  const next = syncStreaks(finishWorkout(structuredClone(data), at), at);
  await persist(next);
  return next;
}

/** Read-only receipt derived from saved history, not another stored workout or achievement counter. */
export function workoutCompletion(data: Data, id: string, now = Date.now()) {
  const workout = data.history.find((w) => w.id === id && Number.isFinite(w.finished));
  if (!workout) return null;
  const at = Math.min(workout.finished!, now);
  // Historical receipts never compare a past session to future performances or future milestones.
  const through = {
    ...data,
    active: null,
    history: data.history.filter((w) => Number.isFinite(w.finished) && w.finished! <= at),
  };
  const before = { ...through, history: through.history.filter((w) => w.id !== id) };
  const report = calculateStreak(through, at),
    previous = calculateStreak(before, at);
  const goal = report.currentWeek?.chosen,
    oldGoal = previous.currentWeek?.chosen;
  const reason = workoutStreakReason(workout, now);
  const sameDay =
    !reason &&
    before.history.some(
      (w) =>
        !workoutStreakReason(w, at) &&
        localDate(w.finished!, STREAK_TIME_ZONE) === localDate(workout.finished!, STREAK_TIME_ZONE),
    );
  const contributed =
    !reason && !!goal && goal.goal.target !== null && goal.completed > (oldGoal?.completed || 0);
  const weeklyUnlocked = contributed && !!goal?.success && !oldGoal?.success;
  const achievements = reason
    ? []
    : STREAK_LEVELS.filter((l) => l.weeks > 0 && report.earned[l.id] && !previous.earned[l.id]);
  return {
    workout,
    name: savedWorkoutName(data, workout),
    ...workoutStatistics(workout),
    records: workout.finished! <= now ? sessionRecords(workout, through.history) : [],
    streak: {
      week: calendarWeek(at, STREAK_TIME_ZONE),
      completed: goal?.completed || 0,
      target: goal?.goal.target ?? null,
      current: report.current,
      contributed,
      weeklyUnlocked,
      achievements,
      secret: !reason && secretUnlocked(report.longest) && !secretUnlocked(previous.longest),
      longest: report.longest,
      message:
        reason ||
        (goal?.goal.target == null
          ? 'Set a weekly target in Strength Streak settings.'
          : contributed
            ? 'This session added one training day to your weekly target.'
            : sameDay
              ? 'This date already has a counted workout. Daily credit is counted once.'
              : 'Your weekly target was already met. This session is saved as an extra workout.'),
    },
  };
}
