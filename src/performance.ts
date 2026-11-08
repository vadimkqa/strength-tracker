import type { Exercise, SetEntry, Workout } from './data';
export interface PreviousSet {
  weight: string;
  reps: string;
}
export interface PerformanceReference {
  workoutId: string;
  finished: number;
  sets: Record<string, PreviousSet>;
}
// Exact orthographic identity only: punctuation, equipment and variant words are never removed.
export const exerciseIdentity = (name: string) =>
  `exercise:${JSON.stringify(name.trim().replace(/\s+/g, ' ').toLowerCase())}`;
const intensity = (ex: Exercise) => (ex.exerciseIntensity || '').trim().toUpperCase();
export function setNumber(set: SetEntry, index: number): number | null {
  return set.prescription ? set.prescription.number : index + 1;
}
function week(workout: Workout) {
  return workout.cycleWeek ? String(workout.cycleWeek) : workout.name.match(/^Week (\d+) ·/)?.[1];
}
export function previousPerformance(
  workout: Workout,
  exercise: Exercise,
  history: Workout[],
): PerformanceReference | undefined {
  const identity = exercise.exerciseKey || exerciseIdentity(exercise.name);
  const candidates = history
    .filter((w) => Number.isFinite(w.finished))
    .flatMap((w) =>
      w.exercises
        .filter(
          (ex) =>
            (ex.exerciseKey || exerciseIdentity(ex.name)) === identity &&
            intensity(ex) === intensity(exercise) &&
            ex.sets.some((s) => s.done),
        )
        .map((ex) => ({
          w,
          ex,
          rank: w.name === workout.name ? 2 : week(w) && week(w) === week(workout) ? 1 : 0,
        })),
    );
  candidates.sort((a, b) => b.rank - a.rank || b.w.finished! - a.w.finished!);
  const chosen = candidates[0];
  if (!chosen) return undefined;
  const sets: Record<string, PreviousSet> = {};
  chosen.ex.sets.forEach((s, i) => {
    const n = setNumber(s, i);
    if (
      n === null ||
      chosen.ex.sets.filter((x, j) => setNumber(x, j) === n).length !== 1 ||
      !s.done ||
      !Number.isFinite(Number(s.weight)) ||
      Number(s.weight) < 0 ||
      !Number.isInteger(Number(s.reps)) ||
      Number(s.reps) <= 0
    )
      return;
    sets[n] = { weight: String(s.weight || 0), reps: String(s.reps) };
  });
  return { workoutId: chosen.w.id, finished: chosen.w.finished!, sets };
}
export function suggestSet(ex: Exercise, set: SetEntry, index: number): SetEntry {
  const number = setNumber(set, index);
  const previous = number === null ? undefined : ex.previousPerformance?.sets[number];
  return { ...set, weight: previous?.weight ?? '', reps: previous?.reps ?? '', done: false };
}
export function preparePerformance(workout: Workout, history: Workout[]): Workout {
  const result = structuredClone(workout);
  result.exercises.forEach((ex) => {
    ex.exerciseKey ||= exerciseIdentity(ex.name);
    ex.previousPerformance = previousPerformance(result, ex, history);
    ex.sets = ex.sets.map((s, i) => suggestSet(ex, s, i));
  });
  return result;
}
export function addPerformanceSet(ex: Exercise): void {
  const set: SetEntry = { weight: '', reps: '', done: false };
  if (ex.sets.some((s) => s.prescription))
    set.prescription = {
      number: Math.max(0, ...ex.sets.map((s, i) => setNumber(s, i) ?? 0)) + 1,
      minReps: null,
      maxReps: null,
      effort: '',
      source: 'Manually added',
    };
  ex.sets.push(suggestSet(ex, set, ex.sets.length));
}
