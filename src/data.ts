import { assertStreak, mergeStreaks, syncStreaks, type StreakState } from './streak';
import { assertLibrary, migratePrograms, mergePrograms, type SavedProgram } from './programs';
import { assertProgram, type TrainingProgram } from './importing/model';
import { ensureController, finishController, type WorkoutController } from './controller';
import { preparePerformance, type PerformanceReference } from './performance';
import type { SetPrescription } from './prescriptions';
import type { Rotation } from './workouts';
import { openDB } from 'idb';
import { templateKey } from './workouts';
import { defaultPlan, type Plan } from './templates';
export const LEGACY_KEY = 'strength-tracker-v1';
export interface SetEntry {
  id?: string;
  skipped?: boolean;
  needsLogging?: boolean;
  timing?: { started: number; ended: number; durationMs: number };
  weight: string;
  reps: string;
  done: boolean;
  prescription?: SetPrescription;
}
export interface Exercise {
  imageUrl?: string;
  groupLabel?: string;
  skipped?: boolean;
  exerciseKey?: string;
  previousPerformance?: PerformanceReference;
  id: string;
  name: string;
  rest: number | null;
  exerciseIntensity?: string;
  optional?: boolean;
  alternatives?: string[];
  kind?: string;
  targetReps?: string;
  notes?: string;
  sets: SetEntry[];
}
export interface Workout {
  streakExcluded?: boolean;
  isTest?: boolean;
  cancelled?: boolean;
  abandoned?: boolean;
  status?: string;
  programId?: string;
  displayName?: string;
  cycleWeek?: number;
  controller?: WorkoutController;
  id: string;
  name: string;
  week: string;
  started: number;
  finished?: number;
  restEnd: number | null;
  restSeconds: number | null;
  exercises: Exercise[];
}
export interface Data {
  streak?: StreakState;
  programs?: SavedProgram[];
  activeProgramId?: string;
  programLibraryVersion?: 1;
  trainingProgram?: TrainingProgram;
  history: Workout[];
  active: Workout | null;
  week: string;
  restDefault: number;
  plan: Plan;
  rotation?: Rotation;
  rotationWeek?: number;
  carouselWorkout?: string;
  difficultyOverride?: { key: string; value: string };
  [key: string]: unknown;
}
export const emptyData = (): Data => ({
  history: [],
  active: null,
  week: 'heavy',
  restDefault: 120,
  plan: defaultPlan(),
});
function validWorkout(w: unknown): w is Workout {
  if (!w || typeof w !== 'object') return false;
  const x = w as Workout;
  return (
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.started === 'number' &&
    Array.isArray(x.exercises) &&
    x.exercises.every(
      (e) =>
        typeof e.name === 'string' &&
        (typeof e.rest === 'number' || e.rest === null) &&
        Array.isArray(e.sets) &&
        e.sets.every(
          (s) =>
            typeof s.done === 'boolean' &&
            ['string', 'number'].includes(typeof s.reps) &&
            ['string', 'number'].includes(typeof s.weight),
        ),
    )
  );
}
export function parseData(input: unknown): Data {
  if (!input || typeof input !== 'object') throw Error('Invalid backup: expected workout data.');
  const d = input as Data;
  if (
    !Array.isArray(d.history) ||
    !d.history.every(validWorkout) ||
    !('active' in d) ||
    (d.active !== null && !validWorkout(d.active))
  )
    throw Error('Invalid workout data. Original data has been preserved.');
  if (
    d.plan &&
    (!Object.keys(d.plan).length ||
      !Object.values(d.plan).every(
        (rows) =>
          Array.isArray(rows) &&
          rows.every(
            (r) =>
              Array.isArray(r) &&
              typeof r[0] === 'string' &&
              (r[1] === null || (Number.isInteger(r[1]) && r[1] > 0 && r[1] <= 100)) &&
              (r[2] === null || (Number.isFinite(r[2]) && r[2] >= 0)),
          ),
      ))
  )
    throw Error('Invalid workout plan.');
  if (d.trainingProgram) assertProgram(d.trainingProgram);
  assertLibrary(d);
  if (d.streak !== undefined) assertStreak(d.streak);
  if (
    d.rotation &&
    (!Array.isArray(d.rotation.weeks) ||
      !d.rotation.weeks.length ||
      !Array.isArray(d.rotation.sessions) ||
      !d.rotation.sessions.length ||
      !d.rotation.sessions.every(
        (s) =>
          s &&
          Number.isInteger(s.week) &&
          typeof s.key === 'string' &&
          typeof s.workout === 'string' &&
          typeof s.day === 'string',
      ))
  )
    throw Error('Invalid workout rotation. Original data has been preserved.');
  const availableWeeks =
    d.rotation?.sessions.map((s) => s.week) || d.trainingProgram?.workouts.map((w) => w.week);

  return {
    ...emptyData(),
    ...d,
    ...(availableWeeks?.length
      ? {
          rotationWeek: availableWeeks.includes(d.rotationWeek!)
            ? d.rotationWeek
            : availableWeeks[0],
        }
      : {}),
    plan: d.plan || defaultPlan(),
  };
}
export async function openStore(name = 'strength-tracker-v2') {
  return openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('state');
      db.createObjectStore('backups', { autoIncrement: true });
    },
  });
}
export async function loadData(
  storage: Pick<Storage, 'getItem'> = localStorage,
  name?: string,
): Promise<Data> {
  const db = await openStore(name);
  try {
    const current = await db.get('state', 'current');
    if (current) {
      const parsed = parseData(current);
      const migrated = migratePrograms(parsed, await db.getAll('backups'));
      if (migrated !== parsed) {
        const tx = db.transaction(['state', 'backups'], 'readwrite');
        try {
          const latest = await tx.objectStore('state').get('current');
          if (latest?.programs) {
            await tx.done;
            return parseData(latest);
          }
          if (JSON.stringify(latest) !== JSON.stringify(current)) {
            await tx.done;
            return loadData(storage, name);
          }
          await tx
            .objectStore('backups')
            .add({ kind: 'before-program-library', data: current, created: Date.now() });
          await tx.objectStore('state').put(migrated, 'current');
          await tx.done;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* Already aborted by IndexedDB. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      }
      return migrated;
    }
    const raw = storage.getItem(LEGACY_KEY);
    const data = migratePrograms(raw ? parseData(JSON.parse(raw)) : emptyData());
    const tx = db.transaction(['state', 'backups'], 'readwrite');
    try {
      // Recheck in the same write transaction: concurrent tabs cannot remigrate over new data.
      const existing = await tx.objectStore('state').get('current');
      if (existing) {
        await tx.done;
        return parseData(existing);
      }
      if (raw)
        await tx.objectStore('backups').add({ kind: 'localStorage-v1', raw, created: Date.now() });
      await tx.objectStore('state').put(data, 'current');
      await tx.done;
      return data;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already aborted by IndexedDB. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}
export async function saveData(data: Data, name?: string) {
  const db = await openStore(name);
  try {
    await db.put('state', data, 'current');
  } finally {
    db.close();
  }
}
export function mergeBackup(current: Data, incoming: Data): Data {
  const history = [...current.history];
  const content = (x: Workout) => JSON.stringify({ ...x, id: '' });
  const append = (w: Workout) => {
    if (!history.some((x) => content(x) === content(w))) {
      history.push(
        history.some((x) => x.id === w.id) || current.active?.id === w.id
          ? { ...w, id: crypto.randomUUID() }
          : w,
      );
    }
  };
  incoming.history.forEach(append);
  // Never replace a currently running session. Keep a different imported active session in history.
  const active = current.active || incoming.active;
  if (current.active && incoming.active && content(current.active) !== content(incoming.active)) {
    append(incoming.active);
  }
  const projection = mergePrograms(current, incoming);
  const streak = mergeStreaks(current.streak, incoming.streak);
  // A conflicting restored program gets a new library ID. Carry its explicit target to that ID,
  // while keeping the resident program's independent target and all historical snapshots.
  if (streak && incoming.streak) {
    const content = (p: SavedProgram) =>
      JSON.stringify({ ...p, id: undefined, position: undefined });
    for (const source of incoming.programs || []) {
      const resident = projection.programs?.find((p) => p.id === source.id);
      if (!resident || content(resident) === content(source)) continue;
      const restored = projection.programs?.find(
        (p) => p.id.startsWith(`${source.id}-restored-`) && content(p) === content(source),
      );
      const target = incoming.streak.targets[source.id];
      if (restored && target !== undefined) {
        streak.targets[restored.id] = target;
        if (current.streak?.targets[source.id] !== undefined)
          streak.targets[source.id] = current.streak.targets[source.id];
        else delete streak.targets[source.id];
      }
    }
  }
  const next: Data = {
    ...current,
    ...incoming,
    ...projection,
    streak,
    active,
    history: history.sort((a, b) => b.started - a.started),
    week: incoming.week,
    restDefault: incoming.restDefault,
  };
  return next.streak ? syncStreaks(next) : next;
}
export async function restoreBackup(current: Data, input: unknown, name?: string) {
  const incoming = parseData(input);
  const next = mergeBackup(current, incoming);
  const db = await openStore(name);
  try {
    const tx = db.transaction(['state', 'backups'], 'readwrite');
    await tx
      .objectStore('backups')
      .add({ kind: 'before-import', data: current, created: Date.now() });
    await tx.objectStore('state').put(next, 'current');
    await tx.done;
    return next;
  } finally {
    db.close();
  }
}
export const newSet = (): SetEntry => ({ weight: '', reps: '', done: false });
export function createWorkout(
  name: string,
  week: string,
  plan: Plan,
  now = Date.now(),
  history: Workout[] = [],
  templateInfo?: { displayName: string; cycleWeek: number },
): Workout {
  const keys = Object.keys(defaultPlan());
  const key = templateKey(name, week);
  return ensureController(
    preparePerformance(
      {
        id: crypto.randomUUID(),
        name,
        week,
        ...templateInfo,
        started: now,
        restEnd: null,
        restSeconds: null,
        exercises: (
          plan[key] ||
          plan[name] ||
          defaultPlan()[key] ||
          defaultPlan()[name] ||
          defaultPlan()[keys[0]]
        ).map(([name, count, rest, prescription]) => ({
          id: crypto.randomUUID(),
          name,
          rest,
          ...(prescription
            ? {
                exerciseKey: prescription.exerciseId,
                groupLabel: prescription.groupLabel,
                targetReps: prescription.reps,
                notes: prescription.notes,
                exerciseIntensity: prescription.exerciseIntensity,
                optional: prescription.optional,
                alternatives: prescription.alternatives,
                kind: prescription.kind,
              }
            : {}),
          sets: Array.from({ length: count ?? 0 }, (_, i) => ({
            ...newSet(),
            ...(prescription?.setPrescriptions?.[i]
              ? { prescription: structuredClone(prescription.setPrescriptions[i]) }
              : {}),
          })),
        })),
      },
      history,
    ),
  );
}
export function completeSet(workout: Workout, i: number, j: number, now = Date.now()): Workout {
  const next = structuredClone(workout),
    s = next.exercises[i].sets[j];
  if (
    !s.done &&
    (!Number.isInteger(Number(s.reps)) ||
      Number(s.reps) <= 0 ||
      !Number.isFinite(Number(s.weight)) ||
      Number(s.weight) < 0)
  )
    throw Error('Enter valid weight and positive whole-number reps first.');
  s.done = !s.done;
  if (s.done) {
    next.restSeconds = next.exercises[i].rest;
    next.restEnd = next.restSeconds === null ? null : now + next.restSeconds * 1000;
  }
  return next;
}
export function finishWorkout(data: Data, now = Date.now()): Data {
  if (!data.active) return data;
  return {
    ...data,
    history: [
      {
        ...(data.active.controller ? finishController(data.active, now) : data.active),
        finished: now,
      },
      ...data.history,
    ],
    active: null,
  };
}
export const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((x) => String(x).padStart(2, '0'))
    .join(':');
};
