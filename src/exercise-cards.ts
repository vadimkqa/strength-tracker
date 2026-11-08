import { validLog } from './controller';
import type { Exercise, Workout } from './data';
/** Skipping resolves navigation, but never counts as successful completion. */
export function exerciseComplete(w: Workout, e: Exercise) {
  return (
    !e.skipped &&
    e.sets.length > 0 &&
    w.controller?.running?.exerciseId !== e.id &&
    e.sets.every((s) => s.done && !s.skipped && !s.needsLogging && validLog(s))
  );
}
export function cardExpanded(w: Workout, e: Exercise) {
  const saved = w.controller?.exerciseCards?.[e.id];
  if (saved !== undefined) return saved;
  return (
    w.controller?.running?.exerciseId === e.id ||
    w.controller?.selected?.exerciseId === e.id ||
    e.sets.some((s) => s.needsLogging) ||
    (!w.controller?.selected && w.exercises[0]?.id === e.id && !exerciseComplete(w, e))
  );
}
export function syncExerciseCards(before: Workout, after: Workout, editingExerciseId?: string) {
  const c = after.controller!;
  const cards = { ...c.exerciseCards };
  const pending = new Set(c.pendingCardCollapse || []);
  for (const e of after.exercises) {
    const previous = before.exercises.find((x) => x.id === e.id);
    if (cards[e.id] === undefined) cards[e.id] = previous ? cardExpanded(before, previous) : true;
    const completed = exerciseComplete(after, e);
    if (!completed) {
      pending.delete(e.id);
      continue;
    }
    if ((previous && !exerciseComplete(before, previous)) || pending.has(e.id)) {
      if (editingExerciseId === e.id) pending.add(e.id);
      else {
        cards[e.id] = false;
        pending.delete(e.id);
      }
    }
  }
  const oldRunning = before.controller?.running?.exerciseId,
    run = c.running?.exerciseId;
  const oldSelected = before.controller?.selected?.exerciseId,
    selected = c.selected?.exerciseId;
  if (selected && selected !== oldSelected) cards[selected] = true;
  if (run && (run !== oldRunning || before.controller?.phase !== 'set')) cards[run] = true;
  c.exerciseCards = cards;
  c.pendingCardCollapse = [...pending].filter((id) => after.exercises.some((e) => e.id === id));
  return after;
}
export function toggleExerciseCard(w: Workout, id: string) {
  const e = w.exercises.find((e) => e.id === id);
  if (!e) return w;
  w.controller!.exerciseCards = { ...w.controller!.exerciseCards, [id]: !cardExpanded(w, e) };
  w.controller!.pendingCardCollapse = w.controller!.pendingCardCollapse?.filter((x) => x !== id);
  return w;
}
