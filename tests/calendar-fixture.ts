import { readFileSync } from 'node:fs';
import { applyImportedPlan, parseTrainingPlan } from '../src/plan-import';
import { emptyData, createWorkout, type Data } from '../src/data';
import { currentProgram } from '../src/programs';
import { configureCalendar } from '../src/auto-selection';
import { syncStreaks } from '../src/streak';
export const noon = (date: string) => Date.parse(date + 'T12:00:00Z');
export function calendarFixture() {
  const draft = parseTrainingPlan(readFileSync('tests/fixtures/GYM.txt', 'utf8'));
  draft.rows.forEach((r) => (r.reviewed = true));
  let d = applyImportedPlan(emptyData(), draft, true);
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  return syncStreaks(d, noon('2026-11-10'), 'Europe/Vienna');
}
export function savedSession(d: Data, week: number, day: string, finishedDate: string) {
  const template = currentProgram(d)!.program!.workouts.find(
    (w) => w.week === week && w.day === day,
  )!;
  const w = createWorkout(
    template.id,
    template.intensity === 'easy' ? 'easy' : 'heavy',
    d.plan,
    noon(finishedDate) - 600000,
  );
  w.programId = d.activeProgramId;
  w.cycleWeek = week;
  w.finished = noon(finishedDate);
  w.exercises.forEach((e) => {
    // A saved performed set supplies actual logging even where the TXT left set count unspecified.
    if (!e.sets.length) e.sets.push({ id: crypto.randomUUID(), done: false, reps: '', weight: '' });
    e.sets.forEach((s) => Object.assign(s, { done: true, reps: '8', weight: '50' }));
  });
  return w;
}
