import { it, expect } from 'vitest';
import { calendarFixture, savedSession, noon } from '../tests/calendar-fixture';
import {
  carouselCompletions,
  configureCalendar,
  suggestWorkout,
  scheduledOccurrences,
} from './auto-selection';
import { completedOccurrence, calendarCompletionReason } from './calendar-completion';
import { currentProgram, activateProgram } from './programs';
import { applyProgram } from './importing/saving';
import { parseProgram } from './importing/parser';
import { textDocument } from './importing/extraction';
import { chooseWeek, chooseWorkout } from './carousel-selection';
import { calculateStreak } from './streak';
import { parseData, mergeBackup, createWorkout } from './data';
const setup = () => {
  let d = calendarFixture();
  d = configureCalendar(d, { ...currentProgram(d)!.calendar!, anchorWeek: 2 });
  d.rotationWeek = 2;
  return d;
};
const hammer = (d = setup()) =>
  currentProgram(d)!.program!.workouts.find((w) => w.week === 2 && w.day === 'Saturday')!;

it('Nov 14 Week 2 Easy saved session with changed/skipped work counts, without rewriting history', () => {
  const d = setup(),
    w = savedSession(d, 2, 'Saturday', '2026-11-14');
  w.started = w.finished! - 6114000; // 01:41:54, as reported; saved actual work is authoritative.
  w.exercises[0].name = 'Modified exercise';
  w.exercises.push({
    id: 'skipped-extra',
    name: 'Unperformed optional change',
    rest: null,
    skipped: true,
    sets: [{ id: 'pending', done: false, weight: '', reps: '', skipped: true }],
  });
  d.history = [w];
  const before = structuredClone(d);
  expect(calendarCompletionReason(w, noon('2026-11-14'))).toBeNull();
  for (const date of ['2026-11-14', '2026-11-15', '2026-11-16']) {
    expect(suggestWorkout(d, noon(date))?.kind).not.toBe('CATCH-UP WORKOUT');
    expect(carouselCompletions(d, noon(date))[hammer(d).slotId]).toMatchObject({
      date: '2026-11-14',
      completed: true,
    });
  }
  const other = chooseWorkout(chooseWeek(d, 1), 1);
  expect(
    carouselCompletions(chooseWeek(other, 2), noon('2026-11-15'))[hammer(d).slotId].completed,
  ).toBe(true);
  expect(carouselCompletions(d, Date.parse('2026-11-14T22:59Z'))[hammer(d).slotId].completed).toBe(
    true,
  );
  expect(carouselCompletions(d, noon('2026-11-15'), [])[hammer(d).slotId].completed).toBe(false);
  expect(d).toEqual(before);
});

it('only the exact program/template/cycle and occurrence can be completed', () => {
  const d = setup(),
    w = savedSession(d, 2, 'Saturday', '2026-11-14');
  const occurrence = scheduledOccurrences(d, noon('2026-11-14')).find(
    (s) => s.date === '2026-11-14',
  )!;
  for (const edit of [
    { name: 'Hammer Press Day', displayName: 'Hammer Press Day' },
    { programId: 'different-program' },
    { cycleWeek: 1 },
    { scheduledFor: '2026-10-31' },
    { finished: undefined },
    { isTest: true },
    { cancelled: true },
    { controller: { phase: 'set', running: {} } },
  ]) {
    d.history = [{ ...w, ...edit } as typeof w];
    expect(
      completedOccurrence(d, d.activeProgramId!, occurrence, noon('2026-11-14')),
    ).toBeUndefined();
  }
  d.history = [savedSession(d, 2, 'Tuesday', '2026-11-14')];
  expect(
    completedOccurrence(d, d.activeProgramId!, occurrence, noon('2026-11-14')),
  ).toBeUndefined();
  expect(suggestWorkout(d, noon('2026-11-15'))?.kind).toBe('CATCH-UP WORKOUT');
  d.history = [{ ...w, programId: undefined, cycleWeek: undefined }];
  expect(completedOccurrence(d, d.activeProgramId!, occurrence, noon('2026-11-14'))?.id).toBe(w.id);
  const duplicateProgram = structuredClone(currentProgram(d)!);
  duplicateProgram.id = 'ambiguous-owner';
  d.programs!.push(duplicateProgram);
  expect(
    completedOccurrence(d, d.activeProgramId!, occurrence, noon('2026-11-14')),
  ).toBeUndefined();
});

it('Vienna start dates handle local midnight, overnight finishing, DST and recurring weeks', () => {
  const d = setup(),
    w = savedSession(d, 2, 'Saturday', '2026-11-14');
  w.started = Date.parse('2026-11-14T22:30Z'); // Saturday 23:30 Vienna
  w.finished = Date.parse('2026-11-15T00:15Z');
  d.history = [w];
  expect(
    carouselCompletions(d, Date.parse('2026-11-14T22:59:59Z'))[hammer(d).slotId].completed,
  ).toBe(false);
  expect(carouselCompletions(d, Date.parse('2026-11-15T00:16Z'))[hammer(d).slotId].completed).toBe(
    true,
  );
  expect(carouselCompletions(d, noon('2026-11-28'))[hammer(d).slotId].completed).toBe(false);
  w.scheduledFor = '2026-11-14';
  w.started = noon('2026-11-16') - 600000;
  w.finished = noon('2026-11-16');
  expect(carouselCompletions(d, noon('2026-11-16'))[hammer(d).slotId].completed).toBe(true);
  expect(carouselCompletions(d, noon('2026-11-28'))[hammer(d).slotId].completed).toBe(false);
  currentProgram(d)!.calendar!.anchorDate = '2026-10-19';
  w.scheduledFor = '2026-10-24';
  w.started = Date.parse('2026-10-24T21:30Z');
  w.finished = Date.parse('2026-10-25T01:30Z'); // DST transition
  expect(carouselCompletions(d, Date.parse('2026-10-25T02:00Z'))[hammer(d).slotId].completed).toBe(
    true,
  );
});

it('delete, restore, plan switch and streak-only exclusion remain independent and reactive', () => {
  const d = setup(),
    w = savedSession(d, 2, 'Saturday', '2026-11-14');
  w.streakExcluded = true;
  d.history = [w];
  const backup = parseData(JSON.parse(JSON.stringify(d)));
  const state = () => carouselCompletions(d, noon('2026-11-15'))[hammer(d).slotId].completed;
  expect(state()).toBe(true);
  expect(calculateStreak(d, noon('2026-11-15')).currentWeek!.chosen!.completed).toBe(0);
  d.history = [];
  expect(state()).toBe(false);
  const restored = mergeBackup(d, backup);
  expect(carouselCompletions(restored, noon('2026-11-15'))[hammer(d).slotId].completed).toBe(true);
  const oldId = d.activeProgramId!;
  let other = applyProgram(
    restored,
    parseProgram(textDocument('Program: Other\nTuesday: Hammer Press Day\n- Press 2x8')),
    true,
  );
  other = configureCalendar(other, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  expect(
    Object.values(carouselCompletions(other, noon('2026-11-15'))).every((c) => !c.completed),
  ).toBe(true);
  other = activateProgram(other, oldId);
  expect(carouselCompletions(other, noon('2026-11-15'))[hammer(d).slotId].completed).toBe(true);
});

it('a one-week two-day plan matches its own sessions without inventing extra weeks or weekdays', () => {
  let d = applyProgram(
    setup(),
    parseProgram(textDocument('Program: Two days\nTuesday: A\n- Row 2x8\nFriday: B\n- Squat 2x8')),
    true,
  );
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  const p = currentProgram(d)!,
    template = p.program!.workouts[1];
  const w = createWorkout(template.id, '', d.plan, Date.parse('2026-11-12T23:15Z'));
  w.finished = Date.parse('2026-11-13T00:15Z'); // Friday in Vienna, Thursday UTC start
  w.programId = p.id;
  w.cycleWeek = 1;
  Object.assign(w.exercises[0].sets[0], { done: true, reps: '8', weight: '20' });
  d.history = [w];
  const completions = carouselCompletions(d, noon('2026-11-13'));
  expect(Object.keys(completions)).toHaveLength(2);
  expect(completions[template.slotId]).toMatchObject({ date: '2026-11-13', completed: true });
  expect(completions[p.program!.workouts[0].slotId].completed).toBe(false);
  expect(
    completedOccurrence(
      d,
      p.id,
      { date: '2026-11-20', week: 1, templateIds: [template.id] },
      noon('2026-11-20'),
    ),
  ).toBeUndefined();
  // Sunday late catch-up finishing after Monday midnight belongs to its start week.
  w.started = Date.parse('2026-11-15T22:30Z');
  w.finished = Date.parse('2026-11-16T00:15Z');
  const afterMidnight = Date.parse('2026-11-16T00:16Z');
  expect(
    completedOccurrence(
      d,
      p.id,
      { date: '2026-11-13', week: 1, templateIds: [template.id] },
      afterMidnight,
    )?.id,
  ).toBe(w.id);
  expect(
    completedOccurrence(
      d,
      p.id,
      { date: '2026-11-20', week: 1, templateIds: [template.id] },
      afterMidnight,
    ),
  ).toBeUndefined();
});
