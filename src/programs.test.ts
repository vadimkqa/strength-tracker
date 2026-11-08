import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import {
  emptyData,
  createWorkout,
  loadData,
  openStore,
  saveData,
  parseData,
  mergeBackup,
} from './data';
import { parseProgram } from './importing/parser';
import { textDocument } from './importing/extraction';
import { programIssues } from './importing/model';
import { applyProgram, compileProgram, resizeTemplateSets } from './importing/saving';
import {
  migratePrograms,
  activateProgram,
  currentProgram,
  programWeeks,
  renameProgram,
  programView,
  rememberProgram,
} from './programs';
import { carouselWorkouts } from './workouts';
import { chooseWorkout, chooseWeek } from './carousel-selection';
import { createDatabaseBackup, restoreDatabaseBackup, inspectBackup } from './backup';
const program = (text: string) => {
  const p = parseProgram(textDocument(text));
  programIssues(p).forEach((i) => (i.reviewed = true));
  return p;
};
const first = () =>
  program(
    'Program: Alpha\nWeek 1\nTuesday: Push HARD\n- Bench Press 2x6 rest 180s\n- Chest Dip 3x10\nWeek 2\nTuesday: Push EASY\n- Bench Press 3x12 rest 90s',
  );
it('keeps multiple imports independent even when their document/workout IDs and names collide', () => {
  let d = applyProgram(emptyData(), first(), true);
  const a = d.activeProgramId!;
  d.active = createWorkout(d.trainingProgram!.workouts[0].id, 'heavy', d.plan);
  d.history = [{ ...structuredClone(d.active), id: 'history', finished: Date.now() }];
  const active = structuredClone(d.active),
    history = structuredClone(d.history),
    p = first();
  p.workouts[0].exercises[0].name = 'Machine Press';
  d = applyProgram(d, p, true);
  const b = d.activeProgramId!;
  expect(a).not.toBe(b);
  expect(d.programs).toHaveLength(3);
  expect(d.trainingProgram!.name).toBe('Alpha (2)');
  expect(d.plan[p.workouts[0].id][0][0]).toBe('Machine Press');
  d = activateProgram(d, a);
  expect(d.plan[p.workouts[0].id][0][0]).toBe('Bench Press');
  d = activateProgram(d, b);
  expect(d.plan[p.workouts[0].id][0][0]).toBe('Machine Press');
  expect(d.active).toEqual(active);
  expect(d.history).toEqual(history);
});
it('preserves program-specific carousel positions, weeks, exact prescription order and overrides', () => {
  let d = applyProgram(emptyData(), first(), true);
  const a = d.activeProgramId!;
  d = chooseWeek(d, 2);
  const key = d.trainingProgram!.workouts[1].id;
  d.difficultyOverride = { key, value: 'heavy' };
  const p = program('Program: A/B\nWorkout A:\n- Squat 3x5\nWorkout B:\n- Row 2x8');
  d = applyProgram(d, p, true);
  expect(programWeeks(currentProgram(d)!)).toEqual([1]);
  expect(carouselWorkouts(d.rotation, d.rotationWeek, d.trainingProgram)).toHaveLength(2);
  expect(d.trainingProgram!.workouts.every((w) => w.day === null)).toBe(true);
  const b = d.activeProgramId!;
  d = chooseWorkout(d, 1);
  d = activateProgram(d, a);
  expect(d.rotationWeek).toBe(2);
  expect(d.difficultyOverride).toEqual({ key, value: 'heavy' });
  expect(d.plan[key][0][3]?.setPrescriptions?.map((s) => s.minReps)).toEqual([12, 12, 12]);
  d = activateProgram(d, b);
  expect(d.carouselWorkout).toBe(p.workouts[1].slotId);
});
it('legacy migration groups built-ins and preserves unknown ownership separately without interpreting names', () => {
  const d = emptyData();
  d.plan['Week 1 · Push'] = [['Custom A', 2, null]];
  d.plan['Week 2 · Push'] = [['Custom B', 3, 70]];
  const before = structuredClone(d),
    next = migratePrograms(d);
  expect(next.programs?.find((p) => p.id === 'built-in')?.templates).toEqual(emptyData().plan);
  const review = next.programs!.filter((p) => p.review);
  expect(review).toHaveLength(2);
  expect(review.every((p) => Object.keys(p.templates).length === 1)).toBe(true);
  expect(next.plan).toEqual(before.plan);
  expect(d).toEqual(before);
  expect(migratePrograms(next)).toBe(next);
});
it('recovers complete prior programs only from explicit pre-import snapshots, not similar names', async () => {
  const p = first(),
    q = program('Program: Alpha\nWorkout A:\n- Row 4x8');
  const old = {
    ...emptyData(),
    trainingProgram: p,
    plan: { ...emptyData().plan, ...compileProgram(p) },
  };
  const latest = {
    ...emptyData(),
    trainingProgram: q,
    plan: { ...old.plan, ...compileProgram(q) },
  };
  const name = crypto.randomUUID();
  await saveData(latest, name);
  const db = await openStore(name);
  await db.add('backups', { kind: 'before-plan-import', data: old, created: 1 });
  db.close();
  const loaded = await loadData({ getItem: () => null }, name);
  expect(loaded.programs!.filter((p) => p.program)).toHaveLength(2);
  expect(loaded.programs!.filter((p) => p.review)).toHaveLength(0);
  expect(loaded.plan).toEqual(latest.plan);
  expect(currentProgram(loaded)!.program).toEqual(q);
  const again = await loadData({ getItem: () => null }, name);
  expect(again).toEqual(loaded);
  const stored = await openStore(name);
  expect(
    (await stored.getAll('backups')).filter((b) => b.kind === 'before-program-library'),
  ).toHaveLength(1);
  stored.close();
});
it('template edits and program renames are isolated from active workouts and historical records', () => {
  let d = applyProgram(emptyData(), first(), true);
  const key = d.trainingProgram!.workouts[0].id;
  d.active = createWorkout(key, 'heavy', d.plan);
  d.history = [{ ...structuredClone(d.active), id: 'old', finished: 200 }];
  const before = structuredClone(d);
  resizeTemplateSets(d, key, 0, 4);
  d = renameProgram(d, d.activeProgramId!, 'My Training Program');
  expect(currentProgram(d)!.name).toBe('My Training Program');
  expect(currentProgram(d)!.program!.workouts[0].exercises[0].sets).toHaveLength(4);
  expect(d.active).toEqual(before.active);
  expect(d.history).toEqual(before.history);
  expect(createWorkout(key, 'heavy', d.plan).exercises[0].sets).toHaveLength(4);
});
it('backs up/restores all programs, preserving conflicting template versions and current history', async () => {
  let d = applyProgram(emptyData(), first(), true);
  d = applyProgram(d, program('Program: Beta\nFull Body:\n- Squat 2x5'), true);
  const name = crypto.randomUUID();
  await saveData(d, name);
  const backup = await createDatabaseBackup(d, name);
  const restored = await restoreDatabaseBackup(emptyData(), backup, true, crypto.randomUUID());
  expect(restored.programs!.filter((p) => p.program)).toEqual(
    rememberProgram(structuredClone(d)).programs!.filter((p) => p.program),
  );
  expect(inspectBackup(backup).data.programs).toEqual(d.programs);
  let original = activateProgram(d, d.programs!.find((p) => p.name === 'Alpha')!.id);
  const changed = structuredClone(original);
  resizeTemplateSets(changed, changed.trainingProgram!.workouts[0].id, 0, 5);
  const merged = mergeBackup(original, changed);
  expect(merged.programs!.filter((p) => p.name === 'Alpha')).toHaveLength(2);
  expect(
    merged.programs!.find((p) => p.id === original.activeProgramId)!.templates[
      original.trainingProgram!.workouts[0].id
    ][0][1],
  ).toBe(2);
  expect(mergeBackup(merged, changed).programs).toHaveLength(merged.programs!.length);
});
it('rejects invalid libraries before restoring and supports program-level notes without fabricating sessions', () => {
  const d = migratePrograms(emptyData());
  const bad = structuredClone(d);
  bad.activeProgramId = 'missing';
  expect(() => parseData(bad)).toThrow('library');
  const notes = {
    id: 'notes',
    name: 'Program notes',
    templates: {},
    notes: 'Unstructured source to review',
  };
  d.programs!.push(notes);
  const active = activateProgram(d, 'notes');
  expect(programView(currentProgram(active)!).workouts).toHaveLength(0);
  expect(
    carouselWorkouts(active.rotation, active.rotationWeek, active.trainingProgram),
  ).toHaveLength(0);
  expect(parseData(JSON.parse(JSON.stringify(active))).programs!.at(-1)?.notes).toBe(notes.notes);
});

it('rolls back library migration and its snapshot if the database write fails', async () => {
  const original = emptyData(),
    name = crypto.randomUUID();
  await saveData(original, name);
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    v: any,
    k?: IDBValidKey,
  ) {
    if (this.name === 'state') throw new DOMException('No space', 'QuotaExceededError');
    return put.call(this, v, k!);
  });
  try {
    await expect(loadData({ getItem: () => null }, name)).rejects.toThrow('No space');
  } finally {
    spy.mockRestore();
  }
  const db = await openStore(name);
  expect(await db.get('state', 'current')).toEqual(original);
  expect(await db.getAll('backups')).toEqual([]);
  db.close();
});
