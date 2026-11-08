import { migratePrograms } from './programs';
import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { emptyData, createWorkout, saveData, loadData, type Workout } from './data';
import { preparePerformance, addPerformanceSet } from './performance';
const name = 'Week 1 · Tuesday · Bench Day · Hard';
function workout(title = name, level = 'HARD', finished: number | undefined = 100): Workout {
  const w = createWorkout('Tuesday · Bench focus', 'heavy', emptyData().plan, 10);
  w.name = title;
  w.finished = finished;
  w.exercises = w.exercises.slice(0, 1);
  w.exercises[0].exerciseIntensity = level;
  w.exercises[0].sets = [
    { weight: '100', reps: '8', done: true },
    { weight: '100', reps: '7', done: true },
    { weight: '95', reps: '6', done: false },
    { weight: '90', reps: '9', done: true },
  ];
  return w;
}
it('first workout stays blank and no set is completed or target copied', () => {
  const w = preparePerformance(workout(), []);
  expect(w.exercises[0].previousPerformance).toBeUndefined();
  expect(w.exercises[0].sets.every((s) => s.weight === '' && s.reps === '' && !s.done)).toBe(true);
});
it('suggests completed actual sets independently without mutating history or references when edited', () => {
  const old = workout(),
    copy = structuredClone(old),
    w = preparePerformance(workout(), [old]);
  expect(w.exercises[0].sets.map((s) => s.reps)).toEqual(['8', '7', '', '9']);
  w.exercises[0].sets[0].weight = '110';
  expect(w.exercises[0].previousPerformance!.sets[1].weight).toBe('100');
  expect(old).toEqual(copy);
  expect(w.exercises[0].sets.every((s) => !s.done)).toBe(true);
});
it('matches exercise intensity, never the workout intensity', () => {
  const wrong = workout(name, 'EASY', 300),
    correct = workout('Other session', 'HARD', 200);
  correct.week = 'easy';
  const w = preparePerformance(workout(), [wrong, correct]);
  expect(w.exercises[0].previousPerformance!.workoutId).toBe(correct.id);
});
it('prioritizes the same template/week over a newer other-week session and uses newest within that template', () => {
  const old = workout(),
    newer = workout(name, 'HARD', 200),
    other = workout('Week 2 · Tuesday · Bench Day · Easy', 'HARD', 400);
  expect(
    preparePerformance(workout(), [other, old, newer]).exercises[0].previousPerformance!.workoutId,
  ).toBe(newer.id);
});
it('never uses unfinished workouts or fills gaps from an older session', () => {
  const incomplete = workout(name, 'HARD', undefined);
  delete incomplete.finished;
  const saved = workout();
  saved.exercises[0].sets[1].done = false;
  expect(preparePerformance(workout(), [incomplete, saved]).exercises[0].sets[1].reps).toBe('');
  expect(
    preparePerformance(workout(), [incomplete]).exercises[0].previousPerformance,
  ).toBeUndefined();
});
it('does not fuzzy match renamed exercises or equipment variants', () => {
  const old = workout();
  const current = workout();
  current.exercises[0].name = 'Incline Bench Press';
  delete current.exercises[0].exerciseKey;
  expect(preparePerformance(current, [old]).exercises[0].previousPerformance).toBeUndefined();
});
it('added and removed sets use the same frozen source session without modifying it', () => {
  const old = workout(),
    before = structuredClone(old),
    current = workout();
  current.exercises[0].sets = current.exercises[0].sets.slice(0, 3);
  const w = preparePerformance(current, [old]);
  addPerformanceSet(w.exercises[0]);
  expect(w.exercises[0].sets[3].reps).toBe('9');
  w.exercises[0].sets.pop();
  expect(old).toEqual(before);
});
it('matches source set numbers rather than row positions and rejects ambiguous history numbers', () => {
  const old = workout(),
    current = workout();
  old.exercises[0].sets[0].prescription = {
    number: 3,
    minReps: 4,
    maxReps: 6,
    effort: 'fail',
    source: '',
  };
  old.exercises[0].sets = old.exercises[0].sets.slice(0, 1);
  current.exercises[0].sets[1].prescription = {
    number: 3,
    minReps: 4,
    maxReps: 6,
    effort: 'fail',
    source: '',
  };
  const w = preparePerformance(current, [old]);
  expect(w.exercises[0].sets[1].reps).toBe('8');
  old.exercises[0].sets.push(structuredClone(old.exercises[0].sets[0]));
  expect(preparePerformance(current, [old]).exercises[0].sets[1].reps).toBe('');
});
it('persists edited inputs and independent references across storage reload', async () => {
  const d = emptyData();
  d.history = [workout()];
  d.active = preparePerformance(workout(), d.history);
  d.active.exercises[0].sets[0].weight = '105';
  const db = crypto.randomUUID();
  await saveData(d, db);
  const restored = await loadData({ getItem: () => null }, db);
  expect(restored).toEqual(migratePrograms(d));
  expect(restored.active!.exercises[0].previousPerformance!.sets[1].weight).toBe('100');
});
