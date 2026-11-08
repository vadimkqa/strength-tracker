import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import gym from '../tests/fixtures/GYM.txt?raw';
import { parseTrainingPlan, applyImportedPlan } from './plan-import';
import { emptyData, createWorkout, saveData, loadData } from './data';
import { chooseWorkout, chooseWeek, carouselIndex, workoutDifficulty } from './carousel-selection';
import { workouts } from './workouts';
const draft = parseTrainingPlan(gym);
draft.rows.forEach((r) => (r.reviewed = true));
const base = applyImportedPlan(emptyData(), draft, true);
it('wraps forward and backward between weeks while keeping four day positions', () => {
  let d = chooseWorkout(base, 3);
  d = chooseWorkout(d, 0, 1);
  expect(d.rotationWeek).toBe(2);
  expect(carouselIndex(d)).toBe(0);
  d = chooseWorkout(d, 3, -1);
  expect(d.rotationWeek).toBe(1);
  d = chooseWeek(d, 2);
  d = chooseWorkout(d, 0, 1);
  expect(d.rotationWeek).toBe(1);
  d = chooseWorkout(d, 3, -1);
  expect(d.rotationWeek).toBe(2);
});
it('manual week selection keeps the day and loads that weeks source default', () => {
  let d = chooseWorkout(base, 1);
  expect(workoutDifficulty(d)).toBe('easy');
  d = chooseWeek(d, 2);
  expect(carouselIndex(d)).toBe(1);
  expect(workoutDifficulty(d)).toBe('heavy');
});
it('difficulty overrides do not switch weeks, templates or per-exercise prescriptions', () => {
  const d = chooseWorkout(base, 0),
    session = d.rotation!.sessions.find((s) => s.week === 1 && s.workout === workouts[0].key)!;
  const override = { ...d, difficultyOverride: { key: session.key, value: 'easy' } };
  expect(workoutDifficulty(override)).toBe('easy');
  expect(override.rotationWeek).toBe(d.rotationWeek);
  const w = createWorkout(session.key, workoutDifficulty(override), override.plan);
  expect(w.exercises.map((e) => e.name)).toEqual(base.plan[session.key].map((e) => e[0]));
  expect(w.exercises[0].exerciseIntensity).toBe('HARD');
  expect(workoutDifficulty(chooseWorkout(override, 1))).toBe('easy');
  expect(chooseWeek(override, 2).difficultyOverride).toBeUndefined();
});
it('persists day, week and override without changing plans, history or an active session', async () => {
  const completed = createWorkout('Tuesday · Bench focus', 'heavy', base.plan);
  completed.finished = Date.now();
  completed.exercises[0].sets[0] = { weight: '100', reps: '8', done: true };
  let d = chooseWorkout({ ...base, history: [completed] }, 2);
  d = chooseWeek(d, 2);
  const session = d.rotation!.sessions.find((s) => s.week === 2 && s.workout === workouts[2].key)!;
  d.difficultyOverride = { key: session.key, value: 'heavy' };
  d.active = createWorkout('Tuesday · Bench focus', 'heavy', d.plan);
  const active = structuredClone(d.active),
    plan = structuredClone(d.plan);
  const db = crypto.randomUUID();
  await saveData(d, db);
  const restored = await loadData({ getItem: () => null }, db);
  expect(carouselIndex(restored)).toBe(2);
  expect(restored.rotationWeek).toBe(2);
  expect(restored.active).toEqual(active);
  expect(restored.plan).toEqual(plan);
  expect(restored.history).toEqual([completed]);
  expect(restored.difficultyOverride).toEqual(d.difficultyOverride);
});
