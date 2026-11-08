import type { Workout } from './data';
import { ensureController, stopSet, reconcile } from './controller';
/** Removal affects this session only; retain the removed log/timing in the session backup payload. */
export function removeLiveSet(
  input: Workout,
  exerciseId: string,
  confirmed: boolean,
  now = Date.now(),
) {
  let w = ensureController(input);
  const e = w.exercises.find((e) => e.id === exerciseId);
  if (!e || e.sets.length <= 1) return w;
  const last = e.sets.at(-1)!;
  const running = w.controller!.running?.setId === last.id;
  if ((last.done || running || last.needsLogging) && !confirmed)
    throw Error('Confirm removal of a logged or active set.');
  if (running) {
    w = stopSet(w, now);
    if (w.controller!.running) throw Error('Wait a moment before removing the active set.');
  }
  const exercise = w.exercises.find((e) => e.id === exerciseId)!;
  w.controller!.removedSets ||= [];
  w.controller!.removedSets.push({
    exerciseId,
    set: structuredClone(exercise.sets.at(-1)!),
    removedAt: now,
  });
  exercise.sets.pop();
  reconcile(w);
  return w;
}
