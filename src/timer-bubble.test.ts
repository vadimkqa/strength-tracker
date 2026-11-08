import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { bubblePoint } from './TimerBubble';
import { createWorkout, emptyData, saveData, loadData } from './data';
import { startSet, stopSet } from './controller';
it('bounds normalized bubble coordinates and handles invalid positions', () => {
  const bounds = { left: 8, top: 40, width: 290, height: 500 };
  expect(bubblePoint({ x: 2, y: -1 }, bounds)).toEqual({ left: 298, top: 40 });
  expect(bubblePoint({ x: NaN, y: NaN }, bounds)).toEqual({ left: 298, top: 215 });
  expect(bubblePoint({ x: 0.5, y: 0.5 }, { ...bounds, width: 100, height: 150 })).toEqual({
    left: 58,
    top: 115,
  });
});
it('persists position across phase changes and reload without affecting timings or history', async () => {
  const d = emptyData();
  let w = createWorkout('Tuesday · Bench focus', 'heavy', d.plan, 1000);
  w.controller!.bubblePosition = { x: 0.2, y: 0.7 };
  w = startSet(w, 4000);
  w.exercises[0].sets[0].weight = '50';
  w.exercises[0].sets[0].reps = '8';
  w = stopSet(w, 9000);
  expect(w.controller!.bubblePosition).toEqual({ x: 0.2, y: 0.7 });
  const db = crypto.randomUUID();
  await saveData({ ...d, active: w }, db);
  const restored = await loadData({ getItem: () => null }, db);
  expect(restored.active!.controller).toEqual(w.controller);
  expect(restored.history).toEqual([]);
  expect(restored.active!.exercises[0].sets[0].timing!.durationMs).toBe(5000);
});
