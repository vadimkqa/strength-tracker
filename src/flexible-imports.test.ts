import { it, expect } from 'vitest';
import { parseProgram } from './importing/parser';
import { textDocument } from './importing/extraction';
import { programIssues, programProblems } from './importing/model';
import { applyProgram } from './importing/saving';
import { cardFixture } from '../tests/exercise-fixture';
import { createWorkout } from './data';
import { carouselWorkouts } from './workouts';
import { workoutDifficulty, chooseWorkout } from './carousel-selection';
import { configureCalendar, suggestWorkout } from './auto-selection';
import { activateProgram } from './programs';
const source =
  'Program: Two Day Strength\nWeek 1\nTuesday: Upper Body\n- Bench Press 3x8-12\n- Row 2x10\nNotes: controlled movement\nFriday: Lower Body\n- Squat 3x5-8\nOptional: Plank';
const parse = (s = source) => parseProgram(textDocument(s, 'Two-day plan.txt'));
it('imports a clean one-week/two-session plan without optional-information warnings or invented targets', () => {
  const p = parse();
  expect(p.rotation).toBeNull();
  expect(programIssues(p)).toEqual([]);
  expect(programProblems(p)).toEqual([]);
  expect(p.workouts.map((w) => [w.name, w.week, w.day, w.intensity])).toEqual([
    ['Upper Body', 1, 'Tuesday', null],
    ['Lower Body', 1, 'Friday', null],
  ]);
  expect(p.workouts[0].exercises.map((e) => e.name)).toEqual(['Bench Press', 'Row']);
  expect(
    p.workouts[0].exercises[0].sets.map((s) => [
      s.minReps,
      s.maxReps,
      s.effort,
      s.restSeconds,
      s.weight,
      s.rpe,
      s.rir,
    ]),
  ).toEqual(Array(3).fill([8, 12, null, null, null, null, null]));
  expect(p.workouts[0].exercises[1].notes).toContain('Notes: controlled movement');
  const core = p.workouts[1].exercises[1];
  expect(core.optional).toBe(true);
  expect(core.setCount).toBeNull();
  expect(core.sets).toEqual([]);
  expect(core.defaultTarget?.minReps).toBeNull();
});
it.each([1, 3, 5, 6])('supports %s sessions without inventing a rotation or weekdays', (count) => {
  const p = parse(
    Array.from({ length: count }, (_, i) => `Workout ${i + 1}\n- Exercise ${i + 1} 2x8-10`).join(
      '\n',
    ),
  );
  expect(p.workouts).toHaveLength(count);
  expect(p.rotation).toBeNull();
  expect(programIssues(p)).toEqual([]);
  expect(p.workouts.every((w) => w.day === null && w.intensity === null)).toBe(true);
  const d = applyProgram(cardFixture(), p, true);
  expect(carouselWorkouts(d.rotation, d.rotationWeek, d.trainingProgram)).toHaveLength(count);
});
it('keeps real multiweek rotations and variable workout counts', () => {
  const p = parse(source + '\nWeek 2\nWorkout Recovery\n- Walk');
  expect(p.rotation?.weeks).toEqual([1, 2]);
  expect(programIssues(p)).toEqual([]);
  const d = applyProgram(cardFixture(), p, true);
  expect(carouselWorkouts(d.rotation, 1, d.trainingProgram)).toHaveLength(2);
  expect(carouselWorkouts(d.rotation, 2, d.trainingProgram)).toHaveLength(1);
});
it('keeps genuine conflicting intensities, ambiguous set counts/rest and unsupported content flagged', () => {
  for (const source of [
    'Workout A HARD EASY\n- Press 3x8',
    'Workout A\n- Press HARD EASY 3x8',
    'Workout A\n- Press 3-4x8',
    'Workout A\n- Press 3x8 rest 60-90 sec',
    'Workout A\n- Press 3x8 rest 90',
    'A long unsupported paragraph that cannot be assigned to an exercise or workout.',
  ]) {
    const p = parse(source);
    expect(programIssues(p).length).toBeGreaterThan(0);
    expect(programProblems(p).length).toBeGreaterThan(0);
  }
});
it('supports named legacy-style days without an intensity and keeps all plans/history/active data independent', () => {
  const p = parse('Program: Simple\nBench Day\n- Bench press 2x8-12\nLeg Day\n- Leg press 3x10');
  expect(p.workouts.map((w) => w.name)).toEqual(['Bench Day', 'Leg Day']);
  expect(programIssues(p)).toEqual([]);
  let d = cardFixture();
  d.active = createWorkout(d.trainingProgram!.workouts[0].id, 'heavy', d.plan);
  const before = structuredClone(d),
    oldId = d.activeProgramId!;
  d = applyProgram(d, p, true);
  expect(d.history).toEqual(before.history);
  expect(d.active).toEqual(before.active);
  const preserved = d.programs!.find((x) => x.id === oldId)!,
    originalEntry = before.programs!.find((x) => x.id === oldId)!;
  expect(preserved.program).toEqual(originalEntry.program);
  expect(preserved.templates).toEqual(originalEntry.templates);
  expect(carouselWorkouts(d.rotation, d.rotationWeek, d.trainingProgram)).toHaveLength(2);
  expect(workoutDifficulty(d)).toBe('');
  d = chooseWorkout(d, 1);
  expect(workoutDifficulty(d)).toBe('');
  const original = activateProgram(d, oldId);
  expect(original.trainingProgram).toEqual(before.trainingProgram);
  expect(original.active).toEqual(before.active);
});
it('calendar uses actual two-day metadata and does not manufacture intensity', () => {
  let d = applyProgram(cardFixture(), parse(), true);
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  const t = suggestWorkout(d, Date.parse('2026-11-10T12:00Z'))!,
    f = suggestWorkout(d, Date.parse('2026-11-13T12:00Z'))!;
  expect(t.templateId).toBe(d.trainingProgram!.workouts[0].id);
  expect(f.templateId).toBe(d.trainingProgram!.workouts[1].id);
  expect(t.intensity).toBe('');
  expect(f.intensity).toBe('');
  expect(t.week).toBe(1);
});

it('preserves rep ranges even without a set count or intensity', () => {
  const p = parse('Workout A\n- Press 8–12 reps');
  const e = p.workouts[0].exercises[0];
  expect(e.name).toBe('Press');
  expect(e.setCount).toBeNull();
  expect(e.defaultTarget?.minReps).toBe(8);
  expect(e.defaultTarget?.maxReps).toBe(12);
  expect(programIssues(p)).toEqual([]);
});

it.each(['rest 60s or 90s', 'RPE high', 'RIR 2 RIR 4', '@ 60'])(
  'flags explicitly ambiguous/unparseable %s rather than inventing a target',
  (tail) => {
    const p = parse(`Workout A\n- Press 3x8 ${tail}`);
    expect(programIssues(p).length).toBeGreaterThan(0);
    expect(programProblems(p).length).toBeGreaterThan(0);
  },
);
