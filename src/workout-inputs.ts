import type { Workout } from './data';
import { validLog } from './controller';
import { adjustWeight } from './weight';
/** Apply only the explicit editing target inside the existing cloned-workout change transaction. */
export function adjustWorkoutInput(
  w: Workout,
  exerciseId: string | undefined,
  setId: string | undefined,
  delta: -500 | -250 | 250 | 500,
) {
  const set = w.exercises.find((e) => e.id === exerciseId)?.sets.find((s) => s.id === setId);
  if (!set) return w;
  const value = adjustWeight(String(set.weight), delta);
  if (value === null) return w;
  set.weight = value;
  if (set.done && !validLog(set)) {
    set.done = false;
    set.needsLogging = true;
  }
  return w;
}
