import type { Workout, SetEntry } from './data';
export interface Position {
  exerciseId: string;
  setId: string;
}
export interface WorkoutController {
  removedSets?: { exerciseId: string; set: SetEntry; removedAt: number }[];
  exerciseCards?: Record<string, boolean>;
  pendingCardCollapse?: string[];
  bubblePosition?: { x: number; y: number };
  phase: 'warmup' | 'set' | 'rest';
  phaseStarted: number;
  selected: Position | null;
  running: Position | null;
  warmupEnded?: number;
  lastActionAt?: number;
  rests: { started: number; ended: number; durationMs: number; afterSetId: string | null }[];
  afterSetId: string | null;
  screen: 'exercises' | 'timer';
}
export function positions(w: Workout) {
  return w.exercises.flatMap((e) =>
    e.skipped
      ? []
      : e.sets
          .filter((s) => !s.done && !s.skipped && !s.needsLogging)
          .map((s) => ({ exerciseId: e.id, setId: s.id! })),
  );
}
export function findSet(w: Workout, p: Position | null) {
  if (!p) return undefined;
  return w.exercises.find((e) => e.id === p.exerciseId)?.sets.find((s) => s.id === p.setId);
}
export function ensureController(input: Workout): Workout {
  const w = structuredClone(input);
  for (const e of w.exercises) {
    e.id ||= crypto.randomUUID();
    for (const s of e.sets) s.id ??= crypto.randomUUID();
  }
  w.controller ??= {
    phase: 'warmup',
    phaseStarted: w.started,
    selected: positions(w)[0] || null,
    running: null,
    rests: [],
    afterSetId: null,
    screen: 'exercises',
  };
  reconcile(w);
  return w;
}
export function reconcile(w: Workout) {
  const c = w.controller;
  if (!c) return;
  if (c.running && !findSet(w, c.running)) throw Error('Stop the active set before removing it.');
  const s = findSet(w, c.selected);
  if (
    c.selected &&
    (!s || s.skipped || w.exercises.find((e) => e.id === c.selected?.exerciseId)?.skipped)
  )
    c.selected = positions(w)[0] || null;
}
export function validLog(s: SetEntry) {
  return (
    String(s.weight).trim() !== '' &&
    Number.isFinite(Number(s.weight)) &&
    Number(s.weight) >= 0 &&
    Number.isInteger(Number(s.reps)) &&
    Number(s.reps) > 0
  );
}
export function finalizeLogging(w: Workout) {
  for (const e of w.exercises)
    for (const s of e.sets)
      if (s.needsLogging && validLog(s)) {
        s.needsLogging = false;
        s.done = true;
        if (w.controller?.selected?.setId === s.id)
          w.controller!.selected = positions(w)[0] || null;
      }
}
export function pendingLogs(w: Workout) {
  return w.exercises.flatMap((e) => e.sets.filter((s) => s.needsLogging));
}
export function selectSet(w: Workout, p: Position) {
  if (!findSet(w, p)) throw Error('Set no longer exists.');
  w.controller!.selected = p;
}
export function startSet(input: Workout, now = Date.now()) {
  const w = ensureController(input),
    c = w.controller!;
  if (c.phase === 'set' || (c.lastActionAt !== undefined && now - c.lastActionAt < 600)) return w;
  const s = findSet(w, c.selected);
  if (!s) throw Error('Select an unfinished set.');
  if (s.done || s.skipped || s.needsLogging)
    throw Error('Select an unfinished set or finish its logging first.');
  if (c.phase === 'warmup') c.warmupEnded = now;
  else
    c.rests.push({
      started: c.phaseStarted,
      ended: now,
      durationMs: Math.max(0, now - c.phaseStarted),
      afterSetId: c.afterSetId,
    });
  c.phase = 'set';
  c.phaseStarted = now;
  c.running = { ...c.selected! };
  c.lastActionAt = now;
  return w;
}
export function stopSet(input: Workout, now = Date.now()) {
  const w = ensureController(input),
    c = w.controller!;
  if (
    c.phase !== 'set' ||
    !c.running ||
    (c.lastActionAt !== undefined && now - c.lastActionAt < 600)
  )
    return w;
  const p = c.running,
    s = findSet(w, p)!;
  s.timing = { started: c.phaseStarted, ended: now, durationMs: Math.max(0, now - c.phaseStarted) };
  s.needsLogging = !validLog(s);
  s.done = !s.needsLogging;
  c.afterSetId = p.setId;
  c.running = null;
  c.phase = 'rest';
  c.phaseStarted = now;
  c.lastActionAt = now;
  const all = w.exercises.flatMap((e) =>
    e.sets.map((set) => ({ exerciseId: e.id, setId: set.id! })),
  );
  const index = all.findIndex((x) => x.setId === p.setId);
  const eligible = positions(w);
  c.selected = all.slice(index + 1).find((x) => eligible.some((y) => y.setId === x.setId)) || null;
  return w;
}
export function skipSet(w: Workout, p: Position) {
  if (w.controller?.running?.setId === p.setId) throw Error('Stop this set before skipping it.');
  const s = findSet(w, p);
  if (s) {
    s.skipped = true;
    s.needsLogging = false;
    s.done = false;
  }
  const all = w.exercises.flatMap((e) => e.sets.map((s) => ({ exerciseId: e.id, setId: s.id! })));
  const i = all.findIndex((x) => x.setId === p.setId);
  const eligible = positions(w);
  w.controller!.selected =
    all.slice(i + 1).find((x) => eligible.some((y) => y.setId === x.setId)) || null;
}
export function finishController(input: Workout, now = Date.now()) {
  const w = ensureController(input),
    c = w.controller!;
  if (c.phase === 'set') throw Error('Stop the active set before finishing.');
  if (pendingLogs(w).length) throw Error('Complete logging for stopped sets before finishing.');
  if (c.phase === 'rest')
    c.rests.push({
      started: c.phaseStarted,
      ended: now,
      durationMs: Math.max(0, now - c.phaseStarted),
      afterSetId: c.afterSetId,
    });
  return w;
}
export function stopwatch(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
