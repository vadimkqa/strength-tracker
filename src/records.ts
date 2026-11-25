import { weightValue, weightVolume, sumVolumes } from './weight';
import type { Exercise, Workout } from './data';
import { exerciseIdentity } from './performance';
import { beatsRecord, loggedSet, type PersonalRecord } from './workout-results';
export type SessionFilter = 'all' | 'easy' | 'hard';
export type RecordSort = 'alphabetical' | 'trained' | 'achieved';
export type RecordFilter = 'all' | 'favorites' | 'recent';
export type LoadKind = 'external' | 'bodyweight' | 'assisted';
export type ChartMetric = 'estimate' | 'weight' | 'volume';
export type ChartRange = '1' | '3' | '6' | '12' | 'all';
export interface Performance extends PersonalRecord {
  at: number;
  workoutId: string;
  workoutName: string;
  intensity: SessionFilter | 'unknown';
  kind: LoadKind;
  estimate: number | null;
  volume: number | null;
  prs: { weight: boolean; reps: boolean; strength: boolean };
}
export interface ExerciseRecord {
  id: string;
  name: string;
  names: string[];
  history: Performance[];
  best: Performance;
  estimated: Performance | null;
  volume: Performance | null;
  byReps: Performance[];
  lastPR: number | null;
  lastTrained: number;
}
export const recordIdentity = (exercise: Exercise) =>
  typeof exercise.exerciseKey === 'string' && exercise.exerciseKey.trim()
    ? exercise.exerciseKey
    : exerciseIdentity(exercise.name);
export function loadKind(exercise: Exercise): LoadKind {
  const text = `${exercise.kind || ''} ${exercise.name}`;
  if (/\bassisted\b|\bassistance\b/i.test(text)) return 'assisted';
  if (/body[ -]?weight|pull[ -]?ups?|chin[ -]?ups?|push[ -]?ups?|\bdips?\b/i.test(text))
    return 'bodyweight';
  return 'external';
}
/** Epley estimate, limited to 1–10 reps. A logged single needs no extrapolation. */
export function estimatedOneRM(weight: number, reps: number, kind: LoadKind = 'external') {
  if (
    kind !== 'external' ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps > 10
  )
    return null;
  const estimate = reps === 1 ? weight : weight * (1 + reps / 30);
  return Number.isFinite(estimate) ? estimate : null;
}
export function savedIntensity(workout: Workout, exercise: Exercise): Performance['intensity'] {
  const saved =
    typeof exercise.exerciseIntensity === 'string' ? exercise.exerciseIntensity.trim() : '';
  const value = (saved || String(workout.week || '')).trim().toLowerCase();
  if (value === 'easy' || value === 'light') return 'easy';
  if (value === 'hard' || value === 'heavy') return 'hard';
  return 'unknown';
}
export function completedWorkout(workout: Workout) {
  return (
    Number.isFinite(workout.finished) &&
    !workout.cancelled &&
    !workout.abandoned &&
    !['cancelled', 'abandoned', 'unfinished', 'in-progress'].includes(workout.status || '')
  );
}
export function exerciseRecords(
  workouts: Workout[],
  intensity: SessionFilter = 'all',
): ExerciseRecord[] {
  const groups = new Map<string, { name: string; names: Set<string>; history: Performance[] }>();
  for (const w of [...workouts]
    .filter(completedWorkout)
    .sort((a, b) => a.finished! - b.finished!)) {
    for (const e of w.exercises) {
      if (e.skipped) continue;
      const session = savedIntensity(w, e);
      if (intensity !== 'all' && session !== intensity) continue;
      const id = recordIdentity(e),
        kind = loadKind(e);
      for (const s of e.sets) {
        if (!loggedSet(e, s)) continue;
        let group = groups.get(id);
        if (!group) {
          group = { name: e.name, names: new Set(), history: [] };
          groups.set(id, group);
        }
        group.names.add(e.name);
        const weight = weightValue(s.weight)!,
          reps = Number(s.reps);
        group.history.push({
          weight,
          reps,
          at: w.finished!,
          workoutId: w.id,
          workoutName: w.displayName || w.name,
          intensity: session,
          kind,
          estimate: estimatedOneRM(weight, reps, kind),
          volume:
            kind === 'assisted' || !Number.isFinite(weightVolume(s.weight, reps))
              ? null
              : weightVolume(s.weight, reps),
          prs: { weight: false, reps: false, strength: false },
        });
      }
    }
  }
  return [...groups].map(([id, g]) => {
    let best = g.history[0],
      estimated: Performance | null = null,
      volume: Performance | null = null,
      lastPR: number | null = null;
    const repsAtLoad = new Map<number, number>(),
      byReps = new Map<number, Performance>();
    g.history.forEach((p, index) => {
      const priorReps = repsAtLoad.get(p.weight);
      p.prs = {
        // Assistance is not resistance; a larger assistance value is never a strength PR.
        weight: index > 0 && p.kind !== 'assisted' && p.weight > best.weight,
        reps: priorReps !== undefined && p.reps > priorReps,
        strength: p.estimate !== null && estimated !== null && p.estimate > estimated.estimate!,
      };
      if (Object.values(p.prs).some(Boolean)) lastPR = p.at;
      if (beatsRecord(p, best)) best = p;
      if (p.estimate !== null && (!estimated || p.estimate > estimated.estimate!)) estimated = p;
      if (p.volume !== null && (!volume || p.volume > volume.volume!)) volume = p;
      repsAtLoad.set(p.weight, Math.max(priorReps || 0, p.reps));
      const prior = byReps.get(p.reps);
      if (!prior || (p.kind === 'assisted' ? p.weight < prior.weight : p.weight > prior.weight))
        byReps.set(p.reps, p);
    });
    return {
      id,
      name: g.name,
      names: [...g.names],
      history: g.history,
      best,
      estimated,
      volume,
      byReps: [...byReps.values()].sort((a, b) => a.reps - b.reps),
      lastPR,
      lastTrained: g.history.at(-1)!.at,
    };
  });
}
export function selectRecords(
  records: ExerciseRecord[],
  favorites: string[],
  filter: RecordFilter,
  sort: RecordSort,
  search: string,
  now: number,
) {
  const query = search.trim().toLowerCase(),
    cutoff = rangeStart('1', now);
  return records
    .filter(
      (r) =>
        r.names.some((n) => n.toLowerCase().includes(query)) &&
        (filter !== 'favorites' || favorites.includes(r.id)) &&
        (filter !== 'recent' || (r.lastPR !== null && r.lastPR >= cutoff && r.lastPR <= now)),
    )
    .sort((a, b) => {
      const ai = favorites.indexOf(a.id),
        bi = favorites.indexOf(b.id);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      const delta =
        filter === 'recent' || sort === 'achieved'
          ? (b.lastPR ?? -Infinity) - (a.lastPR ?? -Infinity)
          : sort === 'trained'
            ? b.lastTrained - a.lastTrained
            : 0;
      return (
        (Number.isNaN(delta) ? 0 : delta) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    });
}
export function rangeStart(range: ChartRange, now: number) {
  if (range === 'all') return -Infinity;
  const date = new Date(now),
    day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - Number(range));
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return date.getTime();
}
export interface ChartPoint {
  at: number;
  value: number;
  workoutId: string;
}
/** One actual observation per finished workout; no filled weeks, interpolation or synthetic values. */
export function chartPoints(
  record: ExerciseRecord,
  metric: ChartMetric,
  range: ChartRange = 'all',
  now = Date.now(),
): ChartPoint[] {
  const sessions = new Map<string, ChartPoint>(),
    cutoff = rangeStart(range, now);
  for (const p of record.history) {
    if (p.at < cutoff || p.at > now) continue;
    const value =
      metric === 'estimate'
        ? p.estimate
        : metric === 'weight'
          ? p.kind === 'assisted'
            ? null
            : p.weight
          : p.volume;
    if (value === null) continue;
    const prior = sessions.get(p.workoutId);
    sessions.set(p.workoutId, {
      at: p.at,
      workoutId: p.workoutId,
      value: prior
        ? metric === 'volume'
          ? sumVolumes([prior.value, value])
          : Math.max(prior.value, value)
        : value,
    });
  }
  return [...sessions.values()].filter((p) => Number.isFinite(p.value)).sort((a, b) => a.at - b.at);
}
