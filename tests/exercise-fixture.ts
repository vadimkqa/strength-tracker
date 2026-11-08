import type { Page } from '@playwright/test';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { programIssues } from '../src/importing/model';
import { applyProgram } from '../src/importing/saving';
import { emptyData, createWorkout } from '../src/data';
export function cardFixture() {
  const program = parseProgram(
    textDocument(
      'Program: Push\nUpper Body Push:\n- Bench Press 2x8 rest 90s\n- Chest Dip 2x12 rest 180s\nOptional: Face Pull 1x15 rest 60s',
    ),
  );
  program.workouts[0].name = 'Upper Body Push – Week 1';
  programIssues(program).forEach((i) => (i.reviewed = true));
  const d = applyProgram(emptyData(), program, true);
  const history = createWorkout(
    program.workouts[0].id,
    'heavy',
    d.plan,
    Date.now() - 86400000,
    [],
    { displayName: 'Previous push workout', cycleWeek: 1 },
  );
  history.finished = history.started + 3600000;
  history.exercises[0].sets.forEach((s, i) =>
    Object.assign(s, { weight: '60', reps: String(8 - i), done: true }),
  );
  d.history = [history];
  return d;
}
export async function beginCards(page: Page) {
  const data = cardFixture();
  await page.addInitScript((d) => {
    if (!localStorage.getItem('strength-tracker-v1'))
      localStorage.setItem('strength-tracker-v1', JSON.stringify(d));
  }, data);
  await page.goto('/strength-tracker/');
  await page.getByRole('button', { name: 'START WORKOUT' }).click();
  return data;
}
export async function stored(page: Page) {
  await page.locator('.save-status').filter({ hasText: 'Saved on this device' }).waitFor();
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('strength-tracker-v2');
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const r = db.transaction('state').objectStore('state').get('current');
        r.onsuccess = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
export async function advanceClock(page: Page, ms = 10000) {
  await page.clock.setSystemTime((await page.evaluate(() => Date.now())) + ms);
}
