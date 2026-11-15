import type { Page } from '@playwright/test';
import { emptyData, type Workout } from '../src/data';
import { exerciseIdentity } from '../src/performance';
export const recordsNow = Date.parse('2026-11-15T12:00:00Z');
export function recordsFixture() {
  const d = emptyData();
  const names = [
    'Bench Press',
    'Biceps Curl',
    'Leg Press',
    'Cable Row',
    'Dumbbell Shoulder Press',
    'Assisted Pull-up',
    'Bodyweight Dip',
    'Imported machine · independent station',
  ];
  d.history = Array.from({ length: 8 }, (_, i): Workout => ({
    id: `records-session-${i}`,
    name: 'Imported strength program',
    week: i % 2 ? 'easy' : 'heavy',
    started: recordsNow - (210 - i * 30) * 86400000 - 3600000,
    finished: recordsNow - (210 - i * 30) * 86400000,
    restEnd: null,
    restSeconds: null,
    exercises: names.map((name, j) => ({
      id: `ex-${i}-${j}`,
      name,
      exerciseKey: exerciseIdentity(name),
      rest: 120,
      sets: Array.from({ length: 2 }, (_, s) => ({
        weight: String(
          j === 6 ? 0 : j === 5 ? 40 - i * 2 : j === 2 ? 200 + i * 10 : 20 + j * 5 + i * 2.5,
        ),
        reps: String(8 - s),
        done: true,
      })),
    })),
  }));
  d.prPreferences = {
    favorites: [exerciseIdentity('Bench Press'), exerciseIdentity('Biceps Curl')],
  };
  return d;
}
export async function seedRecords(page: Page) {
  const d = recordsFixture();
  await page.clock.setSystemTime(recordsNow);
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, d);
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'PRs', exact: true }).click();
  return d;
}
