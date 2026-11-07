import { saveImportedPlan } from './plan-storage';
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  parseTrainingPlan,
  draftTemplates,
  rowProblems,
  parseAliases,
  applyImportedPlan,
} from './plan-import';
import { emptyData, createWorkout, finishWorkout, openStore, loadData, saveData } from './data';
import { workouts, templateKey } from './workouts';
const bench = workouts[0].key,
  db = workouts[1].key,
  hammer = workouts[2].key,
  legs = workouts[3].key;
describe('local TXT parsing', () => {
  it('recognizes the four workouts and preserves exact exercise order and all prescriptions', () => {
    const draft = parseTrainingPlan(
      `Bench Day — Hard\n1. Bench Press — 4 x 6–8 — rest 3 min — RIR 2\n2. Cable Fly — 3 sets, 12 reps, rest 90s\nDB Press Day — Hard\nPull-ups — 4x8 — rest 2 minutes\nHammer Press Day — Hard\nChest Press — 4x10 — rest 1:30\nLeg Day — Hard\nLeg Press — 4x12 — rest 2m 30s`,
    );
    expect(draft.rows.map((r) => r.name)).toEqual([
      'Bench Press',
      'Cable Fly',
      'Pull-ups',
      'Chest Press',
      'Leg Press',
    ]);
    expect(draft.rows.map((r) => r.rest)).toEqual([180, 90, 120, 90, 150]);
    expect(draft.rows[0].reps).toBe('6–8');
    expect(draft.rows[0].notes).toContain('RIR 2');
    expect(draft.rows.flatMap(rowProblems)).toEqual([]);
    const plan = draftTemplates(draft);
    expect(Object.keys(plan)).toEqual([bench, db, hammer, legs]);
    expect(plan[bench].map((r) => r[1])).toEqual([4, 3]);
  });
  it('separates inline and global Hard/Easy variants without leaking an inline intensity', () => {
    const draft = parseTrainingPlan(
      `Bench Day Hard\nBench — 4x5 rest 3 min\nBench Day Easy\nBench — 2x10 rest 90s\nDB Press Day\nPull-ups — 3x8 rest 2 min`,
    );
    expect(draft.rows.map((r) => r.intensity)).toEqual(['hard', 'easy', '']);
    draft.rows[2].excluded = true;
    const plan = draftTemplates(draft);
    expect(plan[bench][0][1]).toBe(4);
    expect(plan[templateKey(bench, 'easy')][0][1]).toBe(2);
    const global = parseTrainingPlan(
      `HARD\nBench Day\nBench — 4x5 rest 3 min\nDB Press Day\nPull-ups — 3x8 rest 90s\nEASY\nLeg Day\nLeg Press — 2x12 rest 60s`,
    );
    expect(global.rows.map((r) => r.intensity)).toEqual(['hard', 'hard', 'easy']);
  });
  it('supports legacy headings, custom aliases, inline alias definitions and Unicode alias names', () => {
    const aliases = parseAliases('Push A = Bench Day\nНоги = Leg Day');
    const draft = parseTrainingPlan(
      'Hard\nPush A\nBench — 4x8 rest 90s\nThursday · Back focus\nPull-ups — 4x8 rest 90s\nBench Day (aka Push B)\nBench — 3x8 rest 90s\nPush B\nFly — 3x12 rest 60s\nНоги\nLeg Press — 4x8 rest 90s',
      aliases,
    );
    expect(draft.rows.map((r) => r.workout)).toEqual([bench, db, bench, bench, legs]);
    expect(() => parseAliases('Push A = unknown')).toThrow();
  });
  it('uses explicit compound/isolation defaults without guessing exercise types', () => {
    const draft = parseTrainingPlan(
      `Bench Day Hard\nCompounds: 4 sets; Isolation: 3 sets\nCompound: Bench Press — 6–8 reps, rest 180s\nCable Fly — 12 reps, rest 90s\nIsolation\nTriceps Pushdown — 12 reps, rest 60s`,
    );
    expect(draft.rows.map((r) => r.sets)).toEqual([4, null, 3]);
    expect(draft.rows[0].name).toBe('Bench Press');
    expect(draft.rows[1].category).toBe('');
    expect(rowProblems(draft.rows[1])).toContain('Enter 1–12 sets.');
  });
  it('does not invent missing details and permits explicit manual assignments', () => {
    const draft = parseTrainingPlan('Mystery Day:\nUnfamiliar exercise');
    const row = draft.rows[0];
    expect(row.workout).toBe('');
    expect(row.intensity).toBe('');
    expect(row.sets).toBeNull();
    expect(row.rest).toBeNull();
    expect(row.reps).toBe('');
    expect(() => draftTemplates(draft)).toThrow();
    Object.assign(row, {
      workout: db,
      intensity: 'easy',
      sets: 3,
      rest: 90,
      allowUnspecifiedReps: true,
      reviewed: true,
    });
    expect(draftTemplates(draft)[templateKey(db, 'easy')][0][0]).toBe('Unfamiliar exercise');
  });
  it('flags ranges, conflicting prescriptions, missing units and mixed intensity headings', () => {
    const draft = parseTrainingPlan(
      'Bench Day Hard/Easy\nBench — 3-4 sets, 6-8 reps, rest 2-3 min\nFly — 3x10 + 2x12, rest 90',
    );
    expect(draft.rows[0].intensity).toBe('');
    expect(draft.rows[0].sets).toBeNull();
    expect(draft.rows[0].rest).toBeNull();
    expect(draft.rows[1].sets).toBeNull();
    expect(draft.rows[1].rest).toBeNull();
    expect(draft.rows.every((r) => r.warnings.length > 0)).toBe(true);
  });
  it('attaches continuation instructions in order and never attaches them across headings', () => {
    const draft = parseTrainingPlan(
      'Bench Day Hard\nBench Press\nSets: 4\nReps: 6-8\nRest: 3 min\nTempo: 3010\nDB Press Day Easy\nRest: 90s',
    );
    expect(draft.rows[0]).toMatchObject({ name: 'Bench Press', sets: 4, reps: '6–8', rest: 180 });
    expect(draft.rows[0].notes).toContain('Tempo: 3010');
    expect(draft.rows[1].name).toBe('');
  });
  it('keeps original order for repeated sections and excludes only explicitly excluded rows', () => {
    const draft = parseTrainingPlan(
      'Bench Day Hard\nZ press 4x8 rest 90s\nFly 3x12 rest 60s\nDB Press Day Hard\nRow 4x8 rest 90s\nBench Day Hard\nA press 4x6 rest 120s',
    );
    expect(draftTemplates(draft)[bench].map((r) => r[0])).toEqual(['Z press', 'Fly', 'A press']);
    draft.rows[1].excluded = true;
    expect(draftTemplates(draft)[bench].map((r) => r[0])).toEqual(['Z press', 'A press']);
  });
});
describe('applying imported templates safely', () => {
  const draft = () =>
    parseTrainingPlan(
      'Bench Day Hard\nCustom Bench 5x5 rest 3 min\nBench Day Easy\nCustom Easy 2x12 rest 60s',
    );
  it('requires explicit confirmation and does not mutate preview or current data', () => {
    const data = emptyData(),
      before = structuredClone(data),
      preview = draft();
    expect(() => applyImportedPlan(data, preview, false)).toThrow('confirmation');
    expect(data).toEqual(before);
    expect(applyImportedPlan(data, preview, true).plan[bench][0][0]).toBe('Custom Bench');
    expect(data).toEqual(before);
  });
  it('preserves history, derived PR source, preferences and active sessions; affects only matched templates', async () => {
    let data = emptyData();
    data.active = createWorkout(bench, 'heavy', data.plan, 100);
    data.active.exercises[0].sets[0] = { weight: '100', reps: '5', done: true };
    data = finishWorkout(data, 200);
    data.active = createWorkout(legs, 'easy', data.plan, 300);
    const before = structuredClone(data),
      dbname = crypto.randomUUID();
    const next = await saveImportedPlan(data, draft(), true, dbname);
    expect(next.history).toEqual(before.history);
    expect(next.active).toEqual(before.active);
    expect(next.restDefault).toBe(before.restDefault);
    expect(next.plan[legs]).toEqual(before.plan[legs]);
    expect(createWorkout(bench, 'easy', next.plan).exercises[0]).toMatchObject({
      name: 'Custom Easy',
      targetReps: '12',
      rest: 60,
    });
    expect(createWorkout(bench, 'heavy', next.plan).exercises[0].sets).toHaveLength(5);
    expect(await loadData({ getItem: () => null }, dbname)).toEqual(next);
    const store = await openStore(dbname);
    expect((await store.getAll('backups'))[0]).toMatchObject({
      kind: 'before-plan-import',
      data: before,
    });
    store.close();
    expect(data).toEqual(before);
  });
  it('leaves storage unchanged for unconfirmed or invalid imports', async () => {
    const data = emptyData(),
      dbname = crypto.randomUUID();
    await saveData(data, dbname);
    await expect(saveImportedPlan(data, draft(), false, dbname)).rejects.toThrow();
    await expect(
      saveImportedPlan(data, parseTrainingPlan('Unclear'), true, dbname),
    ).rejects.toThrow();
    expect(await loadData({ getItem: () => null }, dbname)).toEqual(data);
  });
});

it('flags ranged set counts in x notation and parses sets-of syntax without fabricating a count', () => {
  const rows = parseTrainingPlan(
    '1. Bench Day Hard\nBench 3–4 x 8 rest 90s\nFly 3 sets of 10–12 reps rest 60s',
  ).rows;
  expect(rows[0].workout).toBe(bench);
  expect(rows[0].sets).toBeNull();
  expect(rows[0].warnings.length).toBeGreaterThan(0);
  expect(rows[1]).toMatchObject({ name: 'Fly', sets: 3, reps: '10–12', rest: 60 });
});
it('keeps workout-specific set defaults out of other workouts and intensities', () => {
  const rows = parseTrainingPlan(
    'Bench Day Hard\nCompounds: 4 sets\nCompound: Bench 8 reps rest 90s\nBench Day Easy\nCompound: Bench 10 reps rest 60s\nMystery Day:\nCompound: Odd press 10 reps rest 60s',
  ).rows;
  expect(rows.map((r) => r.sets)).toEqual([4, null, null]);
  expect(rows[2].intensity).toBe('');
  const global = parseTrainingPlan(
    'Compounds: 4 sets\nHard\nBench Day\nCompound: Bench 8 reps rest 90s\nLeg Day\nCompound: Squat 8 reps rest 90s',
  );
  expect(global.rows.map((r) => r.sets)).toEqual([4, 4]);
});

it('never drops an exercise line merely because it also mentions a compound set count', () => {
  const draft = parseTrainingPlan(
    'Bench Day Hard\nBench Press — compound: 4 sets, 8 reps, rest 90s',
  );
  expect(draft.rows).toHaveLength(1);
  expect(draft.rows[0].source).toContain('Bench Press');
  expect(draft.rows[0].sets).toBe(4);
});
