import type { Workout } from './data';
import { cardExpanded } from './exercise-cards';
/** Order-only edit. Logs, IDs, selected/running sets and every timer timestamp remain attached to their records. */
export function reorderExercises(input: Workout, exerciseId: string, targetId: string): Workout {
  const from = input.exercises.findIndex((e) => e.id === exerciseId),
    to = input.exercises.findIndex((e) => e.id === targetId);
  if (from < 0 || to < 0 || from === to) return input;
  const w = structuredClone(input);
  if (w.controller)
    w.controller.exerciseCards = Object.fromEntries(
      input.exercises.map((e) => [e.id, cardExpanded(input, e)]),
    );
  const [exercise] = w.exercises.splice(from, 1);
  w.exercises.splice(to, 0, exercise);
  return w;
}
