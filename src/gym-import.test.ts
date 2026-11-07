import 'fake-indexeddb/auto';
import gym from '../tests/fixtures/GYM.txt?raw';
import { describe, it, expect } from 'vitest';
import {
  parseTrainingPlan,
  draftSessions,
  draftTemplates,
  applyImportedPlan,
  rowProblems,
} from './plan-import';
import { parseSetBlock } from './prescriptions';
import { saveImportedPlan } from './plan-storage';
import {
  emptyData,
  createWorkout,
  finishWorkout,
  loadData,
  completeSet,
  mergeBackup,
} from './data';
import { workouts } from './workouts';
const names = [
  [
    'Bench press',
    'Cable Seated Flys',
    'Pull-ups',
    'EZ-Bar curl',
    'Overhead cable extension',
    'Rear delt cable pull around',
    'Core crunch machine or L-stand with leg raises to failure',
  ],
  [
    'Cable row',
    'Shrugs',
    'DB Press',
    'Hammer curls',
    'Triceps crossover',
    'Cable lateral raises',
    'Incline crunches with weight or core crunch machine to failure',
  ],
  [
    'Leg Press',
    'Leg extension',
    'Adductors',
    'Hip Thrusts',
    'Calves',
    'Leg curls',
    'Back extensions',
    'Core crunch machine or L-stand with leg raises to failure',
  ],
  [
    'Hammer Press',
    'Dips',
    'T-bar row',
    'Bicep crossover',
    'Single tricep pushdown',
    'Lateral raises',
    'L-stand with leg raises or negative incline crunches to failure',
  ],
  [
    'Bench press',
    'Seated Cable Flys',
    'Pull-ups w weight',
    'EZ-Bar curl',
    'Overhead cable extension',
    'Rear delt cable pull around',
    'Negative incline crunches with weight or core crunch machine to failure',
  ],
  [
    'Cable row',
    'Shrugs',
    'DB Press',
    'Hammer Curls',
    'Triceps Cable Push',
    'Cable lateral raises',
    'Incline crunches with weight or core crunch machine to failure',
  ],
  [
    'Leg Press',
    'Leg extensions',
    'Adductors',
    'Hip Thrusts',
    'Calves',
    'Leg curls',
    'Back extensions',
    'Core crunch machine or L-stand with leg raises to failure',
  ],
  [
    'Hammer Press',
    'Dips',
    'T-bar row',
    'Bicep crossover',
    'Tricep Single Arm Pushdowns',
    'Lateral raises',
    'Core crunch machine or L-stand with leg raises to failure',
  ],
];
const corrected = () => {
  const d = parseTrainingPlan(gym);
  for (const r of d.rows) r.reviewed = true;
  return d;
};
describe('actual GYM.txt regression', () => {
  it('recognizes exactly two weeks, eight correctly classified sessions and 58 assigned exercises', () => {
    const d = parseTrainingPlan(gym),
      s = draftSessions(d);
    expect(d.rotation).toBe(true);
    expect([...new Set(d.rows.map((r) => r.week))]).toEqual([1, 2]);
    expect(s).toHaveLength(8);
    expect(d.rows).toHaveLength(58);
    expect(s.map((x) => [x.week, x.day, x.workout, x.intensity])).toEqual([
      [1, 'Tuesday', workouts[0].key, 'hard'],
      [1, 'Thursday', workouts[1].key, 'easy'],
      [1, 'Friday', workouts[3].key, 'easy'],
      [1, 'Saturday', workouts[2].key, 'hard'],
      [2, 'Tuesday', workouts[0].key, 'easy'],
      [2, 'Thursday', workouts[1].key, 'hard'],
      [2, 'Friday', workouts[3].key, 'hard'],
      [2, 'Saturday', workouts[2].key, 'easy'],
    ]);
    s.forEach((session, i) =>
      expect(
        d.rows
          .filter((r) => r.week === session.week && r.workout === session.workout)
          .map((r) => r.name),
      ).toEqual(names[i]),
    );
    expect(d.rows.every((r) => r.workout && r.intensity)).toBe(true);
    expect(d.rows.some((r) => /^\(/.test(r.name) || /\b(?:HARD|EASY|MID)$/.test(r.name))).toBe(
      false,
    );
  });
  it('preserves every per-set prescription and source order as an explicit regression snapshot', () => {
    const d = parseTrainingPlan(gym);
    expect(
      d.rows.map((r) => ({
        week: r.week,
        day: r.day,
        workout: r.workout,
        sessionIntensity: r.intensity,
        name: r.name,
        exerciseIntensity: r.exerciseIntensity,
        optional: r.optional,
        alternatives: r.alternatives,
        sets: r.setPrescriptions.map(({ source, ...set }) => set),
      })),
    ).toMatchSnapshot();
    expect(d.rows[0].setPrescriptions).toMatchObject([
      { number: 1, minReps: 6, maxReps: 6, effort: 'no fail' },
      { number: 2, minReps: 4, maxReps: 4, effort: 'no fail' },
      { number: 3, minReps: 3, maxReps: 6, effort: 'fail' },
      { number: 4, minReps: 3, maxReps: 6, effort: 'fail' },
    ]);
  });
  it('keeps workout intensity independent from exercise intensity, including MID', () => {
    const d = parseTrainingPlan(gym);
    expect(d.rows[1]).toMatchObject({ intensity: 'hard', exerciseIntensity: 'EASY' });
    expect(d.rows[7]).toMatchObject({ intensity: 'easy', exerciseIntensity: 'HARD' });
    expect(d.rows.find((r) => r.week === 2 && r.name === 'Back extensions')).toMatchObject({
      intensity: 'hard',
      exerciseIntensity: 'MID',
    });
  });
  it('retains optional exercises, all core alternatives, unset rest and unknown core counts', () => {
    const d = parseTrainingPlan(gym);
    expect(d.rows.filter((r) => r.optional).map((r) => [r.week, r.name])).toEqual([
      [1, 'Hip Thrusts'],
      [2, 'Hip Thrusts'],
    ]);
    const core = d.rows.filter((r) => r.kind === 'core');
    expect(core).toHaveLength(8);
    expect(core.every((r) => r.alternatives.length === 2 && r.sets === null)).toBe(true);
    expect(d.rows.every((r) => r.rest === null)).toBe(true);
  });
  it('flags missing source set 2 and unusual effort without renumbering or rewriting', () => {
    const d = parseTrainingPlan(gym),
      shrugs = d.rows.find((r) => r.week === 2 && r.name === 'Shrugs')!,
      pullups = d.rows.find((r) => r.week === 1 && r.name === 'Pull-ups')!;
    expect(shrugs.setPrescriptions.map((s) => s.number)).toEqual([1, 3, 4]);
    expect(shrugs.warnings.join(' ')).toContain('Missing set number(s): 2');
    expect(shrugs.sets).toBe(3);
    expect(pullups.setPrescriptions[0].effort).toBe('half fail fail');
    expect(pullups.warnings.join(' ')).toContain('half fail fail');
    expect(rowProblems(shrugs).length).toBeGreaterThan(0);
    expect(() => draftTemplates(d)).toThrow();
  });
  it('flags absent and duplicate set numbers and ignores harmless Unicode whitespace', () => {
    const d = parseTrainingPlan(
      'Tuesday; Bench (Heavy):\n1. Bench HARD\n(1:6 no fail; 1:4 fail; 8 half fail)\nWeek 2\n\u200b\u00a0\nTuesday; Bench (Easy):\nBench EASY\n(1:12 no fail)',
    );
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0].setPrescriptions.map((s) => s.number)).toEqual([1, 1, null]);
    expect(d.rows[0].warnings.join(' ')).toMatch(/Repeated.*1/);
    expect(d.rows[0].warnings.join(' ')).toContain('set number is missing');
    const unnumbered = parseTrainingPlan(
      'Tuesday; Bench (Heavy):\nBench HARD\n(6 no fail; 4 fail)',
    );
    expect(unnumbered.rows).toHaveLength(1);
    expect(unnumbered.rows[0].setPrescriptions.map((s) => s.number)).toEqual([null, null]);
    expect(unnumbered.rows[0].warnings.join(' ')).toContain('set number is missing');
    expect(parseSetBlock('(1:3–6 no fail;)')[0]).toMatchObject({
      minReps: 3,
      maxReps: 6,
      effort: 'no fail',
    });
  });
  it('applies eight distinct rotation templates only after confirmation and protects history, PR source and active sessions', async () => {
    let current = emptyData();
    current.active = createWorkout(workouts[0].key, 'heavy', current.plan, 100);
    current.active.exercises[0].sets[0] = { weight: '100', reps: '6', done: true };
    current = finishWorkout(current, 200);
    current.active = createWorkout(workouts[3].key, 'easy', current.plan, 300);
    const before = structuredClone(current),
      draft = corrected();
    expect(Object.keys(draftTemplates(draft))).toHaveLength(8);
    expect(() => applyImportedPlan(current, draft, false)).toThrow('confirmation');
    expect(current).toEqual(before);
    const name = crypto.randomUUID(),
      next = await saveImportedPlan(current, draft, true, name);
    expect(next.history).toEqual(before.history);
    expect(next.active).toEqual(before.active);
    expect(next.rotation?.sessions).toHaveLength(8);
    expect(await loadData({ getItem: () => null }, name)).toEqual(next);
    expect(current).toEqual(before);
    const first = next.rotation!.sessions[0];
    const session = createWorkout(first.key, 'heavy', next.plan);
    expect(session.exercises[0].sets[2].prescription).toMatchObject({
      number: 3,
      minReps: 3,
      maxReps: 6,
      effort: 'fail',
    });
    expect(session.exercises[0].rest).toBeNull();
    session.exercises[0].sets[0].reps = '6';
    expect(completeSet(session, 0, 0).restEnd).toBeNull();
    expect(session.exercises.at(-1)!.sets).toHaveLength(0);
  });
});

it('retains the imported rotation and all nullable prescriptions in backup restore', () => {
  const data = applyImportedPlan(emptyData(), corrected(), true);
  const restored = mergeBackup(emptyData(), data);
  expect(restored.rotation).toEqual(data.rotation);
  expect(restored.plan).toEqual(data.plan);
});
