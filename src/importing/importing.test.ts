import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import basic from '../../tests/fixtures/basic_gym_workout_plan.txt?raw';
import gym from '../../tests/fixtures/GYM.txt?raw';
import { parseProgram } from './parser';
import { textDocument, parseCSV, extractDocument } from './extraction';
import { programIssues, programProblems, type TrainingProgram } from './model';
import { applyProgram } from './saving';
import { parseTrainingPlan, applyImportedPlan } from '../plan-import';
import { emptyData, createWorkout, mergeBackup, parseData, loadData } from '../data';
import { saveImportedPlan } from '../plan-storage';
import { carouselWorkouts } from '../workouts';
import { carouselIndex, chooseWorkout, chooseWeek } from '../carousel-selection';
const parse = (text: string) => parseProgram(textDocument(text));
const review = (p: TrainingProgram) => {
  programIssues(p).forEach((i) => (i.reviewed = true));
  return p;
};
describe('independent document parsing and normalized program model', () => {
  it('parses the uploaded five-day basic plan without inventing cut-off exercises or rest', () => {
    const p = parse(basic);
    expect(p.workouts.map((w) => w.day)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ]);
    expect(p.workouts.map((w) => w.exercises.length)).toEqual([6, 6, 6, 6, 5]);
    expect(p.workouts[0].exercises.map((e) => e.name)).toEqual([
      'Bench Press',
      'Chest Fly',
      'Incline Dumbbell Press',
      'Cable Triceps Pushdown',
      'Dumbbell Overhead Triceps Extension',
      'Close-Grip Bench Press',
    ]);
    expect(p.workouts[0].exercises[0].sets.map((s) => [s.minReps, s.maxReps])).toEqual(
      Array(4).fill([8, 10]),
    );
    expect(
      p.workouts
        .flatMap((w) => w.exercises)
        .every((e) => e.sets.every((s) => s.restSeconds === null)),
    ).toBe(true);
    expect(p.issues.some((i) => i.message.includes('cut off'))).toBe(true);
    expect(p.workouts.flatMap((w) => w.exercises).some((e) => e.name.startsWith('NOTE'))).toBe(
      false,
    );
    expect(programProblems(p).length).toBeGreaterThan(0);
    expect(programProblems(review(p))).toEqual([]);
  });
  it.each([
    [
      'full body',
      'Program: Three days\nMonday: Full Body A\n- Squat 3x5\nWednesday: Full Body B\n- Deadlift 2x5\nFriday: Full Body C\n- Press 3x8',
      3,
    ],
    [
      'upper lower',
      'Program: Upper Lower\nUpper A:\nSquat 4x6\nLower A:\nDeadlift 3x5\nUpper B:\nRow 4x10\nLower B:\nLunge 3x12',
      4,
    ],
    ['push pull legs', 'Push:\n- Press 3x8\nPull:\n- Row 3x10\nLegs:\n- Squat 4x6', 3],
    ['alternating AB', 'Workout A\n- Squat 3x5\nWorkout B\n- Deadlift 2x5', 2],
    [
      'six days',
      'Day 1: Push\n- Press 3x8\nDay 2: Pull\n- Row 3x10\nDay 3: Legs\n- Squat 3x8\nDay 4: Push\n- Press 4x10\nDay 5: Pull\n- Row 4x10\nDay 6: Legs\n- Squat 4x10',
      6,
    ],
  ] as const)('supports %s without fixed legacy workout IDs', (_, source, count) => {
    const p = parse(source);
    expect(p.workouts).toHaveLength(count);
    expect(p.workouts.every((w) => w.exercises.length === 1)).toBe(true);
    expect(new Set(p.workouts.map((w) => w.id)).size).toBe(count);
    expect(p.rotation).toBeNull();
    const data = applyProgram(emptyData(), review(p), true);
    expect(carouselWorkouts(undefined, 1, data.trainingProgram)).toHaveLength(count);
  });
  it('handles three-week cycles with different session counts and both boundary wraps', () => {
    const p = parse(
      'Program: Cycle\nWeek 1\nWorkout A\n- Squat 3x5\nWorkout B\n- Press 3x8\nWeek 2\nWorkout C\n- Row 3x10\nWeek 3\nWorkout D\n- Lunge 3x12\nWorkout E\n- Curl 2x12\nWorkout F\n- Fly 2x15',
    );
    expect(p.rotation?.weeks).toEqual([1, 2, 3]);
    let d = applyProgram(emptyData(), review(p), true);
    d = chooseWorkout(d, 1);
    d = chooseWorkout(d, 0, 1);
    expect(d.rotationWeek).toBe(2);
    expect(carouselIndex(d)).toBe(0);
    d = chooseWorkout(d, 0, 1);
    expect(d.rotationWeek).toBe(3);
    d = chooseWorkout(d, 0, -1);
    expect(d.rotationWeek).toBe(2);
    expect(carouselIndex(d)).toBe(0);
    d = chooseWeek(d, 3);
    d = chooseWorkout(d, 0, 1);
    expect(d.rotationWeek).toBe(1);
    d = chooseWorkout(d, 1, -1);
    expect(d.rotationWeek).toBe(3);
    expect(carouselIndex(d)).toBe(2);
  });
  it('retains optional alternatives, group membership, individual intensity and exact set instructions', () => {
    const p = parse(
      'Workout A (Heavy)\nSuperset A:\nA1. Bench HARD\n(1:6 no fail; 2:4 half fail fail; 4:3-6 fail)\nA2. Row 3x8 @ 50 kg RPE 8 RIR 2 rest 90s\nEnd superset\nOptional: Plank or Dead Bug',
    );
    const w = p.workouts[0];
    expect(w.intensity).toBe('HEAVY');
    expect(w.exercises.map((e) => e.name)).toEqual(['Bench', 'Row', 'Plank or Dead Bug']);
    expect(w.exercises[0].intensity).toBe('HARD');
    expect(w.exercises[0].sets.map((s) => s.number)).toEqual([1, 2, 4]);
    expect(w.exercises[0].sets[1].effort).toBe('half fail fail');
    expect(w.exercises[0].issues.some((i) => /Missing|ambiguous|Ambiguous/i.test(i.message))).toBe(
      true,
    );
    expect(w.exercises[0].groupId).toBe(w.exercises[1].groupId);
    expect(w.exercises[2].groupId).toBeNull();
    expect(w.exercises[2].optional).toBe(true);
    expect(w.exercises[2].alternatives).toEqual(['Plank', 'Dead Bug']);
    expect(w.exercises[1].sets[0]).toMatchObject({
      weight: { value: 50, unit: 'kg' },
      rpe: 8,
      rir: 2,
      restSeconds: 90,
    });
  });
  it('does not turn unsupported paragraphs, rest instructions or prescriptions into workouts/exercises', () => {
    const p = parse(
      'Program: Unsupported\nThis paragraph describes a progressive overload strategy and is not an exercise prescription.\n(1:6 fail)\nWorkout A\nRest days are flexible\n- Squat',
    );
    expect(p.workouts[0].exercises.map((e) => e.name)).toEqual(['Squat']);
    expect(p.workouts[0].exercises[0].setCount).toBeNull();
    expect(p.issues.length).toBeGreaterThan(1);
  });
  it('preserves duplicate exercise occurrences with separate editable IDs and exact matching identities', () => {
    const p = parse('Workout A\n- Bench 2x5\n- Bench 3x8');
    const ex = p.workouts[0].exercises;
    expect(ex[0].id).not.toBe(ex[1].id);
    expect(ex[0].identity).toBe(ex[1].identity);
  });
  it('retains table set numbering, targets, units and row references, warns for unsupported columns', async () => {
    const rows = await parseCSV(
      'Week,Workout,Exercise,Set,Reps,Weight,Unit,RPE,RIR,Rest seconds,Tempo\n1,Upper,Squat,1,6,80,kg,8,2,120,3010\n1,Upper,Squat,3,4,90,kg,9,1,150,3010',
    );
    const p = parseProgram({
      name: 'table.csv',
      format: 'csv',
      text: 'table',
      blocks: [{ rows, sheet: 'Upper' }],
      warnings: [],
    });
    const e = p.workouts[0].exercises[0];
    expect(e.sets.map((s) => s.number)).toEqual([1, 3]);
    expect(e.sets[0]).toMatchObject({
      minReps: 6,
      weight: { value: 80, unit: 'kg' },
      rpe: 8,
      rir: 2,
      restSeconds: 120,
    });
    expect(e.source[0].row).toBe(2);
    expect(p.issues.some((i) => i.message.includes('Tempo'))).toBe(true);
  });
  it('extracts quoted CSV and TXT and rejects unsupported formats without side effects', async () => {
    expect(await parseCSV('Workout,Exercise,Sets,Reps\nA,"Row, seated",3,10')).toEqual([
      ['Workout', 'Exercise', 'Sets', 'Reps'],
      ['A', 'Row, seated', '3', '10'],
    ]);
    const doc = await extractDocument(new File(['Workout A\nSquat 3x5'], 'plan.txt'));
    expect(doc.text).toContain('Squat');
    await expect(extractDocument(new File(['binary'], 'plan.exe'))).rejects.toThrow('Choose TXT');
  });
  it('preserves GYM exact sessions and prescriptions through the compatibility model', () => {
    const draft = parseTrainingPlan(gym);
    draft.rows.forEach((r) => (r.reviewed = true));
    const d = applyImportedPlan(emptyData(), draft, true);
    const p = d.trainingProgram!;
    expect(p.schemaVersion).toBe(1);
    expect(p.workouts).toHaveLength(8);
    expect(p.rotation?.weeks).toEqual([1, 2]);
    expect(p.workouts.reduce((n, w) => n + w.exercises.length, 0)).toBe(58);
    const shrug = p.workouts
      .find((w) => w.week === 2 && w.name === 'DB Press Day')!
      .exercises.find((e) => /shrug/i.test(e.name))!;
    expect(shrug.sets.map((s) => s.number)).toEqual([1, 3, 4]);
    expect(p.workouts.filter((w) => w.name === 'Leg Day').map((w) => w.day)).toEqual([
      'Friday',
      'Friday',
    ]);
  });
  it('requires confirmation and review, snapshots before applying, and preserves history/active session and JSON backups', async () => {
    const d = emptyData();
    const completed = createWorkout('Tuesday · Bench focus', 'heavy', d.plan);
    completed.finished = Date.now();
    completed.exercises[0].sets[0] = { weight: '100', reps: '8', done: true };
    d.history = [completed];
    d.active = createWorkout('Thursday · Back focus', 'heavy', d.plan);
    const before = structuredClone(d),
      p = parse(basic),
      db = crypto.randomUUID();
    expect(() => applyProgram(d, p, false)).toThrow('confirmation');
    expect(() => applyProgram(d, p, true)).toThrow('Review');
    expect(d).toEqual(before);
    const next = await saveImportedPlan(d, review(p), true, db);
    expect(next.history).toEqual(before.history);
    expect(next.active).toEqual(before.active);
    const restored = await loadData({ getItem: () => null }, db);
    expect(restored.trainingProgram).toEqual(p);
    expect(restored.history).toEqual(before.history);
    const backup = parseData(JSON.parse(JSON.stringify(restored)));
    expect(mergeBackup(emptyData(), backup).trainingProgram).toEqual(p);
    expect(parseData(JSON.parse(JSON.stringify(before))).history).toEqual(before.history);
  });
  it('planned weight targets never populate actual completed performance', () => {
    const p = review(parse('Workout A\n- Squat 3x5 @ 100 kg RPE 8 rest 120s'));
    const d = applyProgram(emptyData(), p, true);
    const w = createWorkout(p.workouts[0].id, '', d.plan);
    expect(w.exercises[0].sets[0]).toMatchObject({
      weight: '',
      reps: '',
      done: false,
      prescription: { targetWeight: { value: 100, unit: 'kg' }, targetRpe: 8 },
    });
  });
});
it('never silently chooses a ranged set count or RPE/RIR target', () => {
  const p = parse('Workout A\n- Squat 3-4 x 8 RPE 7-8 rest 90s\n- Row 3x8 RIR 1-2 rest 60s');
  const [a, b] = p.workouts[0].exercises;
  expect(a.name).toBe('Squat');
  expect(a.setCount).toBeNull();
  expect(a.sets).toEqual([]);
  expect(a.issues.some((i) => i.message.includes('ranged set'))).toBe(true);
  expect(b.sets[0].rir).toBeNull();
  expect(b.issues.some((i) => i.message.includes('RIR is a range'))).toBe(true);
});
it('rejects unknown schema versions and malformed normalized backups before saving', () => {
  const d = applyProgram(emptyData(), review(parse('Workout A\n- Squat 3x5 rest 90s')), true);
  expect(() =>
    parseData({ ...d, trainingProgram: { ...d.trainingProgram, schemaVersion: 99 } }),
  ).toThrow('Unsupported');
  const bad = structuredClone(d);
  (bad.trainingProgram!.workouts[0].exercises[0] as any).sets = [{}];
  expect(() => parseData(bad)).toThrow('Unsupported');
});
it('JSON restore switches from a legacy rotation to the restored universal program while retaining active history', () => {
  const old = parseTrainingPlan(gym);
  old.rows.forEach((r) => (r.reviewed = true));
  const current = applyImportedPlan(emptyData(), old, true);
  const incoming = applyProgram(emptyData(), review(parse(basic)), true),
    merged = mergeBackup(current, incoming);
  expect(merged.rotation).toBeUndefined();
  expect(
    carouselWorkouts(merged.rotation, merged.rotationWeek, merged.trainingProgram),
  ).toHaveLength(5);
});
it('table workouts with the same name on different weekdays remain separate', () => {
  const p = parseProgram({
    name: 'plan.csv',
    format: 'csv',
    text: 'table',
    warnings: [],
    blocks: [
      {
        rows: [
          ['Workout', 'Day', 'Exercise', 'Sets', 'Reps'],
          ['Full Body', 'Monday', 'Squat', '3', '5'],
          ['Full Body', 'Friday', 'Press', '3', '8'],
          ['Full Body', 'Monday', 'Row', '3', '10'],
        ],
      },
    ],
  });
  expect(p.workouts).toHaveLength(2);
  expect(p.workouts[0].exercises.map((e) => e.name)).toEqual(['Squat', 'Row']);
  expect(new Set(p.workouts.map((w) => w.slotId)).size).toBe(2);
});
it('recognizes titled weeks and lettered days without inventing weekday assignments', () => {
  const p = parse(
    'Program: Blocks\nWeek 1 — Base\nDay A\n- Squat 3x5 rest 90s\nWeek 2 — Build\nDay B\n- Press 3x8 rest 90s',
  );
  expect(p.rotation?.weeks).toEqual([1, 2]);
  expect(p.workouts.map((w) => w.name)).toEqual(['Day A', 'Day B']);
  expect(p.workouts.every((w) => w.day === null)).toBe(true);
});
it('stores arbitrary effort instructions from explicit table columns exactly as supplied', () => {
  const p = parseProgram({
    name: 'effort.csv',
    format: 'csv',
    text: 'source',
    warnings: [],
    blocks: [
      {
        rows: [
          ['Workout', 'Exercise', 'Sets', 'Reps', 'Effort'],
          ['A', 'Squat', '3', '5', 'fast concentric'],
        ],
      },
    ],
  });
  expect(p.workouts[0].exercises[0].sets.every((s) => s.effort === 'fast concentric')).toBe(true);
});
it('retains explicitly supplied targets even when set count is unspecified', () => {
  const p = parse('Workout A\n- Squat 8 reps @ 80 kg RPE 8 rest 90s');
  const e = p.workouts[0].exercises[0];
  expect(e.setCount).toBeNull();
  expect(e.sets).toEqual([]);
  expect(e.defaultTarget).toMatchObject({
    minReps: 8,
    maxReps: 8,
    weight: { value: 80, unit: 'kg' },
    rpe: 8,
    restSeconds: 90,
  });
});
it('retains explicit zero rest and unknown-count targets through saving and reload validation', () => {
  const p = review(parse('Workout A\n- Squat 8 reps @ 80 kg rest 0s'));
  const d = applyProgram(emptyData(), p, true);
  expect(parseData(JSON.parse(JSON.stringify(d))).trainingProgram).toEqual(p);
  expect(d.plan[p.workouts[0].id][0][1]).toBeNull();
  expect(d.plan[p.workouts[0].id][0][2]).toBe(0);
});
it('classic single-workout imports do not create four artificial carousel positions', () => {
  const draft = parseTrainingPlan('Leg Day Easy\nLeg Press 4x8 rest 90s');
  const d = applyImportedPlan(emptyData(), draft, true);
  expect(carouselWorkouts(d.rotation, d.rotationWeek, d.trainingProgram)).toHaveLength(1);
});
it('Settings set-count edits keep normalized targets in sync without changing history or active workout', async () => {
  const { resizeTemplateSets } = await import('./saving');
  const d = applyProgram(emptyData(), review(parse('Workout A\n- Squat 3x5 rest 90s')), true);
  d.active = createWorkout('Tuesday · Bench focus', 'heavy', d.plan);
  const active = structuredClone(d.active),
    key = d.trainingProgram!.workouts[0].id;
  resizeTemplateSets(d, key, 0, 4);
  expect(d.trainingProgram!.workouts[0].exercises[0].sets).toHaveLength(4);
  expect(d.plan[key][0][1]).toBe(4);
  expect(d.active).toEqual(active);
  expect(d.history).toEqual([]);
});
it('Settings additions preserve nonconsecutive imported set numbering', async () => {
  const { resizeTemplateSets } = await import('./saving');
  const draft = parseTrainingPlan(gym);
  draft.rows.forEach((r) => (r.reviewed = true));
  const d = applyImportedPlan(emptyData(), draft, true);
  const template = d.trainingProgram!.workouts.find(
    (w) => w.week === 2 && w.name === 'DB Press Day',
  )!;
  const index = template.exercises.findIndex((e) => /shrug/i.test(e.name));
  resizeTemplateSets(d, template.id, index, 4);
  expect(template.exercises[index].sets.map((s) => s.number)).toEqual([1, 3, 4, 5]);
});
