import type { Exercise, SetEntry, Workout } from './data';
import type { ProgressionPreferences } from './progression-preferences';
import {
  completedWorkout,
  exerciseRecords,
  loadKind,
  recordIdentity,
  savedIntensity,
} from './records';
import { loggedSet } from './workout-results';
import { setNumber } from './performance';
import { normalizedWeight, offsetWeight, weightValue } from './weight';
export type ProgressionAction = 'reps' | 'weight' | 'maintain' | 'recovery' | 'insufficient';
export const progressionLabels: Record<ProgressionAction, string> = {
  reps: 'Increase reps',
  weight: 'Increase weight',
  maintain: 'Maintain',
  recovery: 'Recovery / reduce',
  insufficient: 'Not enough history',
};
interface Range {
  min: number;
  max: number;
}
export interface ProgressionTarget {
  setId: string;
  number: number;
  weight: string;
  reps: string;
}
export interface ComparableSession {
  workout: Workout;
  exercise: Exercise;
}
export interface ProgressionSuggestion {
  action: ProgressionAction;
  reason: string;
  previous?: ComparableSession;
  targets: ProgressionTarget[];
}
const norm = (s: unknown) =>
  typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '';
export function progressionIntensity(w: Workout, e: Exercise): string {
  if (e.exerciseIntensity != null && typeof e.exerciseIntensity !== 'string') return 'unknown';
  const saved = savedIntensity(w, e);
  return saved !== 'unknown' ? saved : norm(e.exerciseIntensity) === 'mid' ? 'mid' : 'unknown';
}
function repRange(e: Exercise, s: SetEntry): Range | null {
  if (s.prescription) {
    const { minReps: min, maxReps: max } = s.prescription;
    return Number.isInteger(min) && Number.isInteger(max) && min! > 0 && max! >= min!
      ? { min: min!, max: max! }
      : null;
  }
  const m = /^(\d+)(?:\s*[-–—]\s*(\d+))?(?:\s*reps?)?$/i.exec(
    (typeof e.targetReps === 'string' ? e.targetReps : '').trim(),
  );
  return m && Number(m[1]) > 0 && Number(m[2] || m[1]) >= Number(m[1])
    ? { min: Number(m[1]), max: Number(m[2] || m[1]) }
    : null;
}
function effort(s: SetEntry) {
  const p = s.prescription;
  const text =
    p?.effort != null && typeof p.effort !== 'string' ? 'Unrecognized effort' : norm(p?.effort);
  return [text, p?.targetRpe ?? null, p?.targetRir ?? null];
}
function signature(e: Exercise) {
  return JSON.stringify(
    e.sets.map((s, i) => [
      setNumber(s, i),
      repRange(e, s),
      effort(s),
      s.prescription?.repsText || '',
      s.prescription?.targetWeight || null,
      s.prescription?.restSeconds ?? e.rest,
    ]),
  );
}
function complete(e: Exercise) {
  const numbers = e.sets.map(setNumber);
  return (
    !e.skipped &&
    !!e.sets.length &&
    numbers.every((n) => Number.isInteger(n) && n! > 0) &&
    new Set(numbers).size === numbers.length &&
    e.sets.every((s) => loggedSet(e, s))
  );
}
export function hasEffortTarget(e: Exercise) {
  return e.sets.some((s) => effort(s).some((v) => v !== '' && v !== null));
}
function knownEffort(e: Exercise) {
  return e.sets.every((s) => {
    const [text, rpe, rir] = effort(s);
    return (
      (!text || /^(?:no fail|half fail|fail|to failure|amrap)$/.test(String(text))) &&
      (rpe === null || (Number.isFinite(rpe) && Number(rpe) >= 0 && Number(rpe) <= 10)) &&
      (rir === null || (Number.isFinite(rir) && Number(rir) >= 0))
    );
  });
}
function effortSignature(e: Exercise) {
  return JSON.stringify([
    recordIdentity(e),
    signature(e),
    e.sets.map((s) => [normalizedWeight(s.weight), String(s.reps)]),
  ]);
}
export function effortConfirmed(e: Exercise) {
  return complete(e) && knownEffort(e) && e.progressionEffort?.signature === effortSignature(e);
}
export function confirmProgressionEffort(
  input: Workout,
  exerciseId: string,
  confirmed: boolean,
): Workout {
  const w = structuredClone(input),
    e = w.exercises.find((e) => e.id === exerciseId);
  if (!e || w.finished !== undefined) return w;
  if (!confirmed) delete e.progressionEffort;
  else if (complete(e) && knownEffort(e) && hasEffortTarget(e))
    e.progressionEffort = { signature: effortSignature(e) };
  return w;
}
/** Strict matching avoids borrowing another plan, machine, intensity, set count or rep/effort scheme. */
export function comparableSessions(
  w: Workout,
  e: Exercise,
  history: Workout[],
): ComparableSession[] {
  if (w.exercises.filter((x) => recordIdentity(x) === recordIdentity(e)).length !== 1) return [];
  const id = recordIdentity(e),
    shape = signature(e),
    intensity = progressionIntensity(w, e),
    kind = loadKind(e);
  return history
    .filter(
      (h) =>
        h.id !== w.id &&
        completedWorkout(h) &&
        h.finished! <= w.started &&
        (h.programId || null) === (w.programId || null) &&
        (w.programId || h.name === w.name),
    )
    .flatMap((h) => {
      const matches = h.exercises.filter((x) => recordIdentity(x) === id);
      if (matches.length !== 1) return [];
      const ex = matches[0];
      return complete(ex) &&
        progressionIntensity(h, ex) === intensity &&
        savedIntensity(h, { ...ex, exerciseIntensity: '' }) ===
          savedIntensity(w, { ...e, exerciseIntensity: '' }) &&
        loadKind(ex) === kind &&
        signature(ex) === shape
        ? [{ workout: h, exercise: ex }]
        : [];
    })
    .sort(
      (a, b) =>
        b.workout.finished! - a.workout.finished! ||
        b.workout.started - a.workout.started ||
        b.workout.id.localeCompare(a.workout.id),
    );
}
/** Defaults are proposals for recognizable free-weight movements, never machine compatibility claims. */
export function defaultIncrement(e: Exercise): string | null {
  if (
    loadKind(e) !== 'external' ||
    /machine|cable|smith|leg press|hammer|assisted|hack|belt|lever|sled/i.test(e.name)
  )
    return null;
  if (
    /\b(?:squat|deadlift|(?:barbell|dumbbell|db) lunges?|romanian deadlift|hip thrust)\b/i.test(
      e.name,
    )
  )
    return '2.5';
  if (/\b(?:bench press|barbell|dumbbell|db curl|db press)\b/i.test(e.name)) return '1';
  return null;
}
export function preferredIncrement(e: Exercise, prefs?: ProgressionPreferences) {
  return prefs?.increments[recordIdentity(e)] || defaultIncrement(e);
}
export function progressionSuggestion(
  w: Workout,
  e: Exercise,
  history: Workout[],
  prefs?: ProgressionPreferences,
): ProgressionSuggestion {
  const sessions = comparableSessions(w, e, history),
    previous = sessions[0];
  const result = (
    action: ProgressionAction,
    reason: string,
    targets: ProgressionTarget[] = [],
  ): ProgressionSuggestion => ({ action, reason, previous, targets });
  if (!previous)
    return result(
      'insufficient',
      'No completed session matches this exercise, program, intensity and prescription.',
    );
  const ranges = e.sets.map((s) => repRange(e, s)),
    last = previous.exercise.sets;
  if (ranges.some((r) => !r))
    return result(
      'insufficient',
      'Rep targets are unspecified or inconsistent. Previous performance is shown without inventing a prescription.',
    );
  if (progressionIntensity(w, e) === 'unknown')
    return result(
      'insufficient',
      'Intensity was not saved. Use this as a neutral comparison; no progression target is inferred.',
    );
  if (loadKind(e) === 'assisted')
    return result(
      'insufficient',
      'Logged assistance is not resistance. Choose assistance and effort manually.',
    );
  if (last.some((s) => weightValue(s.weight) === 0) && loadKind(e) !== 'bodyweight')
    return result(
      'insufficient',
      'Zero logged load does not identify resistance. No weight target is inferred.',
    );
  const targets = last.map((s, i) => ({
    setId: e.sets[i].id || '',
    number: setNumber(e.sets[i], i)!,
    weight: normalizedWeight(s.weight)!,
    reps: String(Math.min(Number(s.reps), ranges[i]!.max)),
  }));
  const cautious =
    savedIntensity(w, { ...e, exerciseIntensity: '' }) === 'easy' ||
    progressionIntensity(w, e) === 'easy' ||
    progressionIntensity(w, e) === 'mid' ||
    /recovery|technique/i.test(`${e.notes || ''} ${e.name}`);
  if (cautious)
    return result(
      'maintain',
      'Keep this Easy/MID or technique session controlled. It is not a failed progression attempt.',
      targets.filter((_, i) => Number(last[i].reps) >= ranges[i]!.min),
    );
  // A prescribed effort is not evidence that actual effort was met. Do not manufacture readiness.
  if (hasEffortTarget(e) && (!knownEffort(e) || !effortConfirmed(previous.exercise)))
    return result(
      'maintain',
      'Repeat while keeping the prescribed effort. This session has no matching effort confirmation; extra reps or load are not inferred.',
      targets.filter((_, i) => Number(last[i].reps) >= ranges[i]!.min),
    );
  if (e.sets.some((s) => s.prescription?.targetWeight))
    return result(
      'maintain',
      'This plan specifies a weight target. Keep the prescription; adjust the plan only through its editor.',
      targets.filter(
        (_, i) =>
          Number(last[i].reps) >= ranges[i]!.min &&
          norm(e.sets[i].prescription!.targetWeight!.unit) === 'kg' &&
          samesLoad(last[i], e.sets[i].prescription!.targetWeight!.value),
      ),
    );
  const increment = preferredIncrement(e, prefs),
    sameLoads = (a: Exercise, b: Exercise) =>
      a.sets.every((s, i) => normalizedWeight(s.weight) === normalizedWeight(b.sets[i].weight));
  const below = (ex: Exercise) => ex.sets.some((s, i) => Number(s.reps) < ranges[i]!.min);
  const total = (ex: Exercise) => ex.sets.reduce((n, s) => n + Number(s.reps), 0);
  const declined = (recent: Exercise, older: Exercise) =>
    recent.sets.every(
      (s, i) =>
        weightValue(s.weight)! <= weightValue(older.sets[i].weight)! &&
        Number(s.reps) <= Number(older.sets[i].reps),
    ) &&
    recent.sets.some(
      (s, i) =>
        weightValue(s.weight)! < weightValue(older.sets[i].weight)! ||
        Number(s.reps) < Number(older.sets[i].reps),
    );
  const repeatedDecline =
    sessions.length >= 3 &&
    declined(previous.exercise, sessions[1].exercise) &&
    declined(sessions[1].exercise, sessions[2].exercise);
  const fixedLoadDecline =
    sessions.length >= 3 &&
    sessions.slice(1, 3).every((s) => sameLoads(previous.exercise, s.exercise)) &&
    ((below(previous.exercise) && below(sessions[1].exercise)) ||
      (total(previous.exercise) < total(sessions[1].exercise) &&
        total(sessions[1].exercise) < total(sessions[2].exercise)));
  if (
    sessions.length >= 3 &&
    sessions.slice(1, 3).every((s) => !hasEffortTarget(e) || effortConfirmed(s.exercise)) &&
    (repeatedDecline || fixedLoadDecline)
  ) {
    const reduced =
      increment && loadKind(e) === 'external'
        ? targets.map((t, i) => ({
            ...t,
            weight: offsetWeight(t.weight, increment, -1) || '',
            reps: String(ranges[i]!.min),
          }))
        : [];
    const safe =
      reduced.length > 0 &&
      reduced.every(
        (t, i) =>
          !!t.weight &&
          Number(t.weight) > 0 &&
          Number(increment) / Number(targets[i].weight) <= 0.05,
      );
    return result(
      'recovery',
      safe
        ? 'Three comparable sessions show repeated decline or below-range reps. Consider one small increment less (at most 5%), staying within the rep range. This is not a fatigue or injury diagnosis.'
        : 'Repeated decline across comparable sessions. Consider a recovery session and choose a suitable lighter load manually; no automatic deload or diagnosis.',
      safe ? reduced : [],
    );
  }
  if (below(previous.exercise))
    return result(
      'maintain',
      'One below-range performance is not enough to infer a deload. Repeat conservatively and review effort; no target outside the prescription is proposed.',
    );
  const top = (ex: Exercise) => ex.sets.every((s, i) => Number(s.reps) === ranges[i]!.max);
  if (
    top(previous.exercise) &&
    sessions[1] &&
    top(sessions[1].exercise) &&
    sameLoads(previous.exercise, sessions[1].exercise)
  ) {
    if (hasEffortTarget(e) && !effortConfirmed(sessions[1].exercise))
      return result(
        'maintain',
        'Confirming effort in one session is not enough for more weight. Repeat until two comparable sessions confirm the prescribed effort.',
        targets,
      );
    if (!increment || loadKind(e) !== 'external')
      return result(
        'maintain',
        'Top reps repeated. Configure an increment supported by this equipment before considering a weight increase.',
        targets,
      );
    if (targets.some((t) => Number(increment) / Number(t.weight) > 0.05))
      return result(
        'maintain',
        'The selected increment exceeds a conservative 5% increase. Choose a smaller supported increment or repeat.',
        targets,
      );
    return result(
      'weight',
      `Top reps repeated in two comparable sessions. Consider +${increment} kg only if the equipment supports it and effort stays controlled.`,
      targets.map((t, i) => ({
        ...t,
        weight: offsetWeight(t.weight, increment)!,
        reps: String(ranges[i]!.min),
      })),
    );
  }
  if (last.some((s, i) => Number(s.reps) < ranges[i]!.max)) {
    // One additional rep total, not one rep on every working set at once.
    const i = last.findIndex((s, i) => Number(s.reps) < ranges[i]!.max);
    targets[i] = { ...targets[i], reps: String(Number(last[i].reps) + 1) };
    return result(
      'reps',
      'Try one additional rep on the first eligible set at the same load, within the prescribed range. Keep effort controlled; stop sooner if needed.',
      targets,
    );
  }
  return result(
    'maintain',
    'Repeat this target. A single top-range session does not establish readiness for more weight.',
    targets,
  );
}
function samesLoad(s: SetEntry, weight: number) {
  return normalizedWeight(s.weight) === normalizedWeight(weight);
}
/** Only draft fields change. No controller, timing, done flags or prescriptions are touched. */
export function applyProgressionTarget(
  input: Workout,
  exerciseId: string,
  suggestion: ProgressionSuggestion,
  overwrite = false,
): Workout {
  const w = structuredClone(input),
    e = w.exercises.find((e) => e.id === exerciseId);
  if (!e || e.skipped || w.finished !== undefined) return w;
  for (const target of suggestion.targets) {
    const s = e.sets.find((s) => s.id === target.setId);
    if (!s || s.done || s.skipped || s.needsLogging || w.controller?.running?.setId === s.id)
      continue;
    for (const key of ['weight', 'reps'] as const)
      if (!String(s[key]).trim() || (overwrite && String(s[key]) !== target[key]))
        s[key] = target[key];
  }
  return w;
}
export function progressionConflicts(w: Workout, e: Exercise, suggestion: ProgressionSuggestion) {
  return suggestion.targets.filter((t) => {
    const s = e.sets.find((s) => s.id === t.setId);
    return (
      s &&
      !s.done &&
      !s.skipped &&
      !s.needsLogging &&
      w.controller?.running?.setId !== s.id &&
      (['weight', 'reps'] as const).some((k) => String(s[k]).trim() && String(s[k]) !== t[k])
    );
  }).length;
}
export function progressionTimeline(history: Workout[], id: string) {
  const prs = exerciseRecords(history).find((r) => r.id === id)?.history || [];
  return history
    .filter(completedWorkout)
    .sort((a, b) => a.finished! - b.finished! || a.started - b.started)
    .flatMap((w) => {
      const exercises = w.exercises.filter(
        (e) => recordIdentity(e) === id && !e.skipped && e.sets.some((s) => loggedSet(e, s)),
      );
      if (exercises.length !== 1) return [];
      const e = exercises[0],
        previous = comparableSessions(w, e, history)[0];
      let label = 'Insufficient comparable history';
      if (complete(e) && previous) {
        const prior = previous.exercise.sets;
        const weights = e.sets.map(
          (s, i) => weightValue(s.weight)! - weightValue(prior[i].weight)!,
        );
        const reps = e.sets.map((s, i) => Number(s.reps) - Number(prior[i].reps));
        if (
          loadKind(e) === 'external' &&
          weights.every((d) => d >= 0) &&
          weights.some((d) => d > 0)
        )
          label = 'Increased weight';
        else if (
          weights.every((d) => d === 0) &&
          reps.every((d) => d >= 0) &&
          reps.some((d) => d > 0)
        )
          label = 'Increased reps';
        else if (weights.every((d) => d === 0) && reps.every((d) => d === 0))
          label = 'Maintained performance';
        else label = 'Changed performance';
      }
      return [
        {
          workoutId: w.id,
          at: w.finished!,
          label,
          pr: prs.some((p) => p.workoutId === w.id && Object.values(p.prs).some(Boolean)),
          intensity: progressionIntensity(w, e),
          program: w.displayName || w.name,
        },
      ];
    });
}
