import type { Exercise, SetEntry, Workout } from './data';
import { validLog } from './controller';
import { exerciseComplete } from './exercise-cards';

/** Actual logged performance only. Zero kg is valid bodyweight/added load, never an inferred body mass. */
export const loggedSet = (_exercise: Exercise, set: SetEntry) =>
  set.done && !set.skipped && !set.needsLogging && validLog(set);
export function workoutStatistics(workout: Workout) {
  const sets = workout.exercises.flatMap((e) => e.sets.filter((s) => loggedSet(e, s)));
  return {
    sets: sets.length,
    exercises: workout.exercises.filter((e) => exerciseComplete(workout, e)).length,
    volume: sets.reduce((sum, s) => sum + Number(s.weight) * Number(s.reps), 0),
    duration:
      Number.isFinite(workout.finished) && Number.isFinite(workout.started)
        ? Math.max(0, workout.finished! - workout.started)
        : 0,
  };
}
export interface PersonalRecord {
  weight: number;
  reps: number;
}
/** Existing PR rule: highest logged weight, breaking equal-weight ties by reps. Names remain exact. */
export const beatsRecord = (candidate: PersonalRecord, previous: PersonalRecord) =>
  candidate.weight > previous.weight ||
  (candidate.weight === previous.weight && candidate.reps > previous.reps);
export function personalRecords(history: Workout[]) {
  const records = new Map<string, PersonalRecord>();
  for (const w of history) {
    if (!Number.isFinite(w.finished)) continue;
    for (const e of w.exercises)
      for (const s of e.sets) {
        if (!loggedSet(e, s)) continue;
        const result = { weight: Number(s.weight), reps: Number(s.reps) },
          previous = records.get(e.name);
        if (!previous || beatsRecord(result, previous)) records.set(e.name, result);
      }
  }
  return records;
}
export function sessionRecords(workout: Workout, history: Workout[]) {
  if (!Number.isFinite(workout.finished)) return [];
  const previous = personalRecords(
    history.filter(
      (w) => w.id !== workout.id && Number.isFinite(w.finished) && w.finished! < workout.finished!,
    ),
  );
  return [...personalRecords([workout])].flatMap(([name, result]) => {
    const baseline = previous.get(name);
    // A first observation is a baseline, not evidence of an improvement.
    return baseline && beatsRecord(result, baseline)
      ? [{ name, ...result, previous: baseline }]
      : [];
  });
}
