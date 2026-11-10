import type { Page } from '@playwright/test';
import { emptyData, createWorkout, type Data } from '../src/data';
import { applyProgram } from '../src/importing/saving';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { programIssues } from '../src/importing/model';
import { syncStreaks, addDays } from '../src/streak';
export const streakNow = Date.parse('2026-11-10T12:00:00Z');
export function streakData(prior = 3, count = 3, scheduled = true) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const p = parseProgram(
    textDocument(
      'Program: Strength consistency\n' +
        Array.from(
          { length: count },
          (_, i) =>
            `${scheduled ? days[i] + ': ' : ''}Workout ${String.fromCharCode(65 + i)}:\n- Press ${i + 1} 2x8 rest 90s`,
        ).join('\n'),
    ),
  );
  programIssues(p).forEach((i) => (i.reviewed = true));
  let d = applyProgram(emptyData(), p, true);
  const save = (date: string, index: number) => {
    const finish = Date.parse(date + 'T12:00:00Z'),
      w = createWorkout(p.workouts[index].id, 'heavy', d.plan, finish - 600000, [], {
        displayName: p.workouts[index].name,
        cycleWeek: 1,
      });
    w.programId = d.activeProgramId;
    w.finished = finish;
    w.exercises.forEach((e) =>
      e.sets.forEach((s) => Object.assign(s, { weight: '50', reps: '8', done: true })),
    );
    d.history.push(w);
  };
  for (let n = prior; n > 0; n--)
    for (let i = 0; i < count; i++) save(addDays('2026-11-09', -n * 7 + i), i);
  if (prior < 52 && scheduled)
    for (let i = 0; i < count - 1; i++) save(addDays('2026-11-09', i), i);
  d = syncStreaks(d, streakNow, 'UTC');
  return d;
}
export async function seedStreak(page: Page, d: Data) {
  await page.clock.setSystemTime(streakNow);
  await page.addInitScript((data) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(data));
  }, d);
  await page.goto('/strength-tracker/');
}
