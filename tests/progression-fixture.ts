import type { Page } from '@playwright/test';
import { emptyData, createWorkout } from '../src/data';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { applyProgram } from '../src/importing/saving';
export function progressionFixture(top = false, effort = '') {
  const p = parseProgram(
    textDocument('Program: Strength targets\nWorkout A HARD\n- Bench Press 2x5-8 rest 90s'),
  );
  p.workouts[0].exercises[0].sets.forEach((s) => (s.effort = effort || null));
  const d = applyProgram(emptyData(), p, true),
    now = Date.now();
  const make = (at: number) => ({
    ...createWorkout(p.workouts[0].id, 'hard', d.plan, at, [], {
      displayName: 'Workout A',
      cycleWeek: 1,
    }),
    programId: d.activeProgramId,
  });
  d.history = [0, 1].map((_, i) => {
    const w = make(now - (12 - i * 6) * 86400000);
    w.finished = w.started + 3600000;
    w.exercises[0].sets.forEach((s) =>
      Object.assign(s, { weight: '100', reps: top ? '8' : String(5 + i), done: true }),
    );
    return w;
  });
  d.active = {
    ...createWorkout(p.workouts[0].id, 'hard', d.plan, now - 30000, d.history, {
      displayName: 'Workout A',
      cycleWeek: 1,
    }),
    programId: d.activeProgramId,
  };
  d.progressionPreferences = { enabled: true, increments: {} };
  return d;
}
export async function seedProgression(page: Page, top = false, effort = '') {
  const d = progressionFixture(top, effort);
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
  return d;
}
