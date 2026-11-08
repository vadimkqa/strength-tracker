import type { Data } from './data';
import { defaultPlan, type Plan } from './templates';
import { assertProgram, stableId, type TrainingProgram } from './importing/model';
import { compileProgram } from './importing/compilation';
import { workouts, templateLabel, type Rotation } from './workouts';
import { exerciseIdentity } from './performance';
export interface SavedProgram {
  kind?: 'built-in' | 'legacy';
  id: string;
  name: string;
  program?: TrainingProgram;
  templates: Plan;
  rotation?: Rotation;
  notes?: string;
  review?: string;
  position?: Pick<Data, 'week' | 'rotationWeek' | 'carouselWorkout' | 'difficultyOverride'>;
}
const clone = <T>(v: T): T => structuredClone(v);
/** Raw legacy templates keep their original tuples; this adapter supplies presentation metadata only. */
export function programView(entry: SavedProgram): TrainingProgram {
  if (entry.program) return entry.program;
  return {
    schemaVersion: 1,
    id: entry.id,
    name: entry.name,
    source: {
      name: entry.name,
      format:
        entry.kind === 'built-in' || entry.id === 'built-in' ? 'built-in' : 'legacy-templates',
      text: entry.notes || '',
    },
    issues: [],
    rotation: entry.rotation ? { weeks: entry.rotation.weeks, repeat: true } : null,
    workouts: Object.entries(entry.templates).map(([key, rows], order) => {
      const scheduled = entry.rotation?.sessions.find((s) => s.key === key);
      const known = workouts.find((w) => key === w.key || key === `${w.key} · Easy`);
      return {
        id: key,
        legacyKey: key,
        slotId: scheduled?.workout || known?.key || key,
        name: known?.name || templateLabel(key),
        week: scheduled?.week || 1,
        day: scheduled?.day || known?.day || null,
        order,
        intensity:
          scheduled?.intensity || (known ? (key.endsWith(' · Easy') ? 'easy' : 'hard') : null),
        groups: [],
        source: [],
        exercises: rows.map(([name, count, rest, meta], i) => ({
          id: `${key}-exercise-${i}`,
          identity: meta?.exerciseId || exerciseIdentity(name),
          name,
          order: i,
          intensity: meta?.exerciseIntensity || null,
          setCount: count,
          sets: [],
          optional: meta?.optional || false,
          alternatives: meta?.alternatives || [],
          groupId: meta?.groupId || null,
          notes: meta?.notes || '',
          source: [],
          issues: [],
        })),
      };
    }),
  };
}
export function programWeeks(entry: SavedProgram) {
  return [...new Set(programView(entry).workouts.map((w) => w.week))].sort((a, b) => a - b);
}
export function currentProgram(data: Data) {
  return data.programs?.find((p) => p.id === data.activeProgramId);
}
function subset(plan: Plan, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => plan[k]).map((k) => [k, clone(plan[k])])) as Plan;
}
function fromSnapshot(data: Data): SavedProgram | undefined {
  if (data.trainingProgram) {
    const p = clone(data.trainingProgram),
      keys = p.workouts.map((w) => w.id);
    return {
      id: `saved-${stableId(JSON.stringify([p, subset(data.plan, keys)]))}`,
      name: p.name,
      program: p,
      templates: { ...compileProgram(p), ...subset(data.plan, keys) },
      rotation: clone(data.rotation),
    };
  }
  if (data.rotation)
    return {
      id: `rotation-${stableId(JSON.stringify(data.rotation))}`,
      name: 'Imported rotation',
      templates: subset(
        data.plan,
        data.rotation.sessions.map((s) => s.key),
      ),
      rotation: clone(data.rotation),
    };
}
/** Never infer ownership from names. Only explicit IDs/schedules or exact snapshot contents establish it. */
export function migratePrograms(data: Data, snapshots: unknown[] = []): Data {
  if (data.programs) return data;
  const programs: SavedProgram[] = [],
    claimed = new Set<string>();
  const active = fromSnapshot(data);
  const insert = (p: SavedProgram) => {
    const content = (p: SavedProgram) => JSON.stringify([p.program, p.templates, p.rotation]);
    const same = programs.find((x) => content(x) === content(p));
    if (same) return same;
    const baseId = p.id;
    let suffix = 2;
    while (programs.some((x) => x.id === p.id)) p.id = `${baseId}-${suffix++}`;
    if (programs.some((x) => x.name === p.name)) p.name += ` · Recovered ${programs.length + 1}`;
    programs.push(p);
    for (const [key, rows] of Object.entries(p.templates))
      if (JSON.stringify(data.plan[key]) === JSON.stringify(rows)) claimed.add(key);
    return p;
  };
  if (active) insert(active);
  for (const raw of snapshots) {
    // Stored pre-import snapshots contain a complete Data object; malformed/foreign snapshots stay archived.
    const value = raw as { data?: Data };
    const prior = value?.data;
    if (!prior?.plan) continue;
    try {
      if (prior.trainingProgram) assertProgram(prior.trainingProgram);
      if (prior.programs) {
        assertLibrary(prior);
        prior.programs.forEach((p) => insert(clone(p)));
      } else {
        const p = fromSnapshot(prior);
        if (p) insert(p);
      }
    } catch {
      /* Preserve the original archive; do not guess its structure. */
    }
  }
  const built = subset(
    data.plan,
    Object.keys(defaultPlan()).filter((k) => !claimed.has(k)),
  );
  if (Object.keys(built).length)
    insert({
      id: 'built-in',
      kind: 'built-in',
      name: 'Built-in training program',
      templates: built,
    });
  for (const key of Object.keys(data.plan).filter((k) => !claimed.has(k))) {
    insert({
      id: `unassigned-${stableId(key)}`,
      name: `Needs review · ${templateLabel(key)}`,
      templates: subset(data.plan, [key]),
      review:
        'The original import ownership is unavailable. This template is preserved independently. Review and name this program before using it; it has not been merged with another import.',
    });
  }
  if (!programs.length)
    programs.push({ id: 'program-notes', name: 'My Training Program', templates: {}, notes: '' });
  const selected = active || programs.find((p) => p.id === 'built-in') || programs[0];
  const next = {
    ...data,
    programs,
    activeProgramId: selected.id,
    programLibraryVersion: 1 as const,
  };
  // Keep the compatibility cache and active aliases; never modify session/history objects.
  next.trainingProgram = selected.program || programView(selected);
  next.plan = { ...data.plan, ...clone(selected.templates) };
  return next;
}
/** Remember only the active projection; inactive programs remain untouched even when template IDs coincide. */
export function rememberProgram(data: Data): Data {
  const p = currentProgram(data);
  if (p) {
    for (const key of Object.keys(p.templates))
      if (data.plan[key]) p.templates[key] = clone(data.plan[key]);
    if (p.program && data.trainingProgram) p.program = clone(data.trainingProgram);
    p.position = {
      week: data.week,
      rotationWeek: data.rotationWeek,
      carouselWorkout: data.carouselWorkout,
      difficultyOverride: clone(data.difficultyOverride),
    };
  }
  return data;
}
export function activateProgram(input: Data, id: string): Data {
  const data = rememberProgram(clone(migratePrograms(input)));
  const p = data.programs!.find((p) => p.id === id);
  if (!p) throw Error('Training program no longer exists.');
  const view = programView(p),
    weeks = programWeeks(p);
  return {
    ...data,
    activeProgramId: id,
    trainingProgram: p.program ? clone(p.program) : view,
    rotation: clone(p.rotation),
    plan: { ...data.plan, ...clone(p.templates) },
    week: p.position?.week || data.week,
    rotationWeek: p.position?.rotationWeek || weeks[0],
    carouselWorkout: p.position?.carouselWorkout || view.workouts[0]?.slotId,
    difficultyOverride: clone(p.position?.difficultyOverride),
  };
}
export function addProgram(input: Data, entry: SavedProgram): Data {
  const data = rememberProgram(clone(migratePrograms(input)));
  // Every confirmed import is independent, including a repeated file or a document with the same name.
  if (data.programs!.some((p) => p.id === entry.id)) entry.id = crypto.randomUUID();
  const base = entry.name;
  let suffix = 2;
  while (data.programs!.some((p) => p.name === entry.name)) entry.name = `${base} (${suffix++})`;
  if (entry.program) entry.program.name = entry.name;
  data.programs!.push(clone(entry));
  return activateProgram(data, entry.id);
}
export function renameProgram(input: Data, id: string, name: string) {
  if (!name.trim()) throw Error('Program name is required.');
  const data = clone(input),
    p = data.programs!.find((p) => p.id === id)!;
  p.name = name.trim();
  if (p.program) p.program.name = p.name;
  if (data.activeProgramId === id && data.trainingProgram) data.trainingProgram.name = p.name;
  return data;
}
export function assertLibrary(data: Data) {
  if (data.programs === undefined) return;
  if (
    data.programLibraryVersion !== 1 ||
    !Array.isArray(data.programs) ||
    !data.programs.length ||
    !data.programs.some((p) => p.id === data.activeProgramId)
  )
    throw Error('Invalid training-program library.');
  const ids = new Set<string>();
  for (const p of data.programs) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      !p.templates ||
      typeof p.templates !== 'object' ||
      Array.isArray(p.templates) ||
      !Object.values(p.templates).every(
        (rows) =>
          Array.isArray(rows) &&
          rows.every(
            (r) =>
              Array.isArray(r) &&
              typeof r[0] === 'string' &&
              (r[1] === null || (Number.isInteger(r[1]) && r[1] > 0 && r[1] <= 100)) &&
              (r[2] === null || (Number.isFinite(r[2]) && r[2] >= 0)),
          ),
      )
    )
      throw Error('Invalid training-program library.');
    if (
      (p.notes !== undefined && typeof p.notes !== 'string') ||
      (p.review !== undefined && typeof p.review !== 'string') ||
      (p.position &&
        ((p.position.week !== undefined && typeof p.position.week !== 'string') ||
          (p.position.carouselWorkout !== undefined &&
            typeof p.position.carouselWorkout !== 'string') ||
          (p.position.rotationWeek !== undefined &&
            (!Number.isInteger(p.position.rotationWeek) || p.position.rotationWeek < 1)))) ||
      (p.rotation &&
        (!Array.isArray(p.rotation.weeks) ||
          !p.rotation.weeks.length ||
          !p.rotation.weeks.every((w) => Number.isInteger(w) && w > 0) ||
          !Array.isArray(p.rotation.sessions) ||
          !p.rotation.sessions.every(
            (s) =>
              s &&
              p.rotation!.weeks.includes(s.week) &&
              typeof s.key === 'string' &&
              p.templates[s.key] &&
              typeof s.day === 'string' &&
              typeof s.workout === 'string',
          )))
    )
      throw Error('Invalid training-program library metadata.');
    ids.add(p.id);
    if (p.program) assertProgram(p.program);
  }
}
/** Restore unions by ID and exact contents; conflicting versions are preserved as separate programs. */
export function mergePrograms(current: Data, incoming: Data): Data {
  const a = rememberProgram(clone(migratePrograms(current))),
    b = rememberProgram(clone(migratePrograms(incoming)));
  const entries = clone(a.programs!);
  let selected = b.activeProgramId!;
  for (const p of b.programs!) {
    const same = entries.find((x) => x.id === p.id);
    const content = (x: SavedProgram) =>
      JSON.stringify({ ...x, id: undefined, position: undefined });
    if (same && content(same) !== content(p)) {
      const base = `${p.id}-restored-${stableId(content(p))}`;
      const copy = { ...clone(p), id: base };
      let suffix = 2;
      while (entries.some((x) => x.id === copy.id && content(x) !== content(copy)))
        copy.id = `${base}-${suffix++}`;
      if (!entries.some((x) => x.id === copy.id)) entries.push(copy);
      if (selected === p.id) selected = copy.id;
    } else if (!same) entries.push(clone(p));
  }
  const next = { ...b, programs: entries, activeProgramId: selected };
  // Do not save the incoming projection over the resident entry with a conflicting ID.
  const p = entries.find((p) => p.id === selected)!;
  return {
    ...next,
    trainingProgram: p.program ? clone(p.program) : programView(p),
    rotation: clone(p.rotation),
    plan: { ...a.plan, ...b.plan, ...clone(p.templates) },
  };
}
