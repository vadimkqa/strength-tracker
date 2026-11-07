import { openDB } from 'idb';
import { defaultPlan, type Plan } from './templates';
export const LEGACY_KEY = 'strength-tracker-v1';
export interface SetEntry {
  weight: string;
  reps: string;
  done: boolean;
}
export interface Exercise {
  id: string;
  name: string;
  rest: number;
  sets: SetEntry[];
}
export interface Workout {
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
  history: Workout[];
  active: Workout | null;
  week: string;
  restDefault: number;
  plan: Plan;
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
        typeof e.rest === 'number' &&
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
              Number.isInteger(r[1]) &&
              r[1] > 0 &&
              r[1] <= 12 &&
              Number.isFinite(r[2]) &&
              r[2] > 0,
          ),
      ))
  )
    throw Error('Invalid workout plan.');
  return { ...emptyData(), ...d, plan: d.plan || defaultPlan() };
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
    if (current) return parseData(current);
    const raw = storage.getItem(LEGACY_KEY);
    const data = raw ? parseData(JSON.parse(raw)) : emptyData();
    const tx = db.transaction(['state', 'backups'], 'readwrite');
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
  return {
    ...current,
    active,
    history: history.sort((a, b) => b.started - a.started),
    plan: { ...current.plan, ...incoming.plan },
    week: incoming.week,
    restDefault: incoming.restDefault,
  };
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
export function createWorkout(name: string, week: string, plan: Plan, now = Date.now()): Workout {
  const keys = Object.keys(defaultPlan());
  const key = name === 'Sunday · Legs' && week === 'easy' ? 'Sunday · Legs · Easy' : name;
  return {
    id: crypto.randomUUID(),
    name,
    week,
    started: now,
    restEnd: null,
    restSeconds: null,
    exercises: (plan[key] || defaultPlan()[key] || defaultPlan()[keys[0]]).map(
      ([name, count, rest]) => ({
        id: crypto.randomUUID(),
        name,
        rest,
        sets: Array.from({ length: count }, newSet),
      }),
    ),
  };
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
    next.restEnd = now + next.restSeconds * 1000;
  }
  return next;
}
export function finishWorkout(data: Data, now = Date.now()): Data {
  if (!data.active) return data;
  return { ...data, history: [{ ...data.active, finished: now }, ...data.history], active: null };
}
export const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((x) => String(x).padStart(2, '0'))
    .join(':');
};
