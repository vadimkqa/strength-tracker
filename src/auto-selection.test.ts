import { workoutStreakReason } from './streak';
import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { createDatabaseBackup, inspectBackup, restoreDatabaseBackup } from './backup';
import { emptyData, saveData, loadData } from './data';
import { calendarFixture, noon, savedSession } from '../tests/calendar-fixture';
import {
  suggestWorkout,
  applyAutomaticSelection,
  automaticSelectionKey,
  configureCalendar,
  calendarStatus,
  matchesSuggestion,
} from './auto-selection';
import { currentProgram, activateProgram } from './programs';
import { carouselWorkouts } from './workouts';
import { chooseWorkout, chooseWeek, workoutDifficulty, carouselIndex } from './carousel-selection';
import { calculateStreak, syncStreaks, configureStreak } from './streak';
import { parseData, mergeBackup, type Data } from './data';
import { applyProgram } from './importing/saving';
import { parseProgram } from './importing/parser';
import { textDocument } from './importing/extraction';
import { programIssues } from './importing/model';
import { cycleForDate, localDate } from './calendar';
const cases = [
  ['2026-11-10', 1, 'Bench Day', 'heavy'],
  ['2026-11-12', 1, 'DB Press Day', 'easy'],
  ['2026-11-13', 1, 'Leg Day', 'easy'],
  ['2026-11-14', 1, 'Hammer Press Day', 'heavy'],
  ['2026-11-17', 2, 'Bench Day', 'easy'],
  ['2026-11-19', 2, 'DB Press Day', 'heavy'],
  ['2026-11-20', 2, 'Leg Day', 'heavy'],
  ['2026-11-21', 2, 'Hammer Press Day', 'easy'],
  ['2026-11-24', 1, 'Bench Day', 'heavy'],
] as const;
for (const [date, week, name, intensity] of cases)
  it(`${date} selects exact ${name} week ${week} ${intensity}`, () => {
    const d = calendarFixture(),
      result = applyAutomaticSelection(d, noon(date));
    const card = carouselWorkouts(
      result.rotation,
      result.rotationWeek,
      result.trainingProgram,
      result.week,
    )[carouselIndex(result)];
    expect(card.name).toBe(name);
    expect(result.rotationWeek).toBe(week);
    expect(workoutDifficulty(result)).toBe(intensity);
    expect(suggestWorkout(d, noon(date))!.kind).toBe("TODAY'S WORKOUT");
    expect(result.history).toEqual(d.history);
    expect(calculateStreak(result, noon(date)).current).toBe(0);
  });
it('Sunday catches up Saturday; completion suggests next Tuesday and never repeats a saved session', () => {
  let d = calendarFixture();
  expect(suggestWorkout(d, noon('2026-11-15'))).toMatchObject({
    date: '2026-11-14',
    week: 1,
    kind: 'CATCH-UP WORKOUT',
  });
  d.history = [savedSession(d, 1, 'Saturday', '2026-11-14')];
  for (const date of ['2026-11-14', '2026-11-15', '2026-11-16'])
    expect(suggestWorkout(d, noon(date))).toMatchObject({
      date: '2026-11-17',
      week: 2,
      kind: 'NEXT WORKOUT',
    });
  d.history.push(structuredClone(d.history[0]), {
    ...structuredClone(d.history[0]),
    id: 'duplicate',
  });
  const before = structuredClone(d.history);
  expect(applyAutomaticSelection(d, noon('2026-11-16')).rotationWeek).toBe(2);
  expect(d.history).toEqual(before);
});
it('several missed sessions prefer the most recent; earlier sessions and manual overrides remain accessible', () => {
  const d = calendarFixture();
  const now = noon('2026-11-15');
  const selected = applyAutomaticSelection(d, now);
  const key = automaticSelectionKey(selected, now);
  const manual = chooseWorkout(selected, 0);
  expect(automaticSelectionKey(manual, now)).toBe(key);
  expect(matchesSuggestion(manual, suggestWorkout(d, now))).toBe(false);
  expect(automaticSelectionKey(chooseWeek(manual, 2), now)).toBe(key);
  expect(applyAutomaticSelection(manual, noon('2026-11-17')).rotationWeek).toBe(2);
});
it('only valid saved history from the exact program/template suppresses a suggestion', () => {
  const date = '2026-11-14',
    d = calendarFixture(),
    valid = savedSession(d, 1, 'Saturday', date);
  for (const invalid of [
    { ...valid, finished: undefined },
    { ...valid, programId: 'other' },
    { ...valid, streakExcluded: true },
    { ...valid, isTest: true },
    { ...valid, cancelled: true },
    { ...valid, name: 'similar but different' },
    {
      ...valid,
      cycleWeek: 2,
      name: currentProgram(d)!.program!.workouts.find((w) => w.week === 2 && w.day === 'Saturday')!
        .id,
    },
    {
      ...valid,
      exercises: valid.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, done: false })),
      })),
    },
  ]) {
    d.history = [invalid];
    expect(suggestWorkout(d, noon(date))!.date).toBe(date);
  }
  expect(workoutStreakReason(valid, noon(date))).toBeNull();
  d.history = [valid];
  expect(suggestWorkout(d, noon(date))!.date).toBe('2026-11-17');
});
it('does not use unsaved completions, nor interrupt an active workout', () => {
  const d = calendarFixture(),
    w = savedSession(d, 1, 'Saturday', '2026-11-14');
  const optimistic = { ...d, history: [w] };
  expect(applyAutomaticSelection(optimistic, noon('2026-11-14'), d.history).rotationWeek).toBe(1);
  d.active = { ...w, finished: undefined };
  expect(applyAutomaticSelection(d, noon('2026-11-17'))).toBe(d);
});
it('explicit catch-up dates prevent another week completion from consuming the wrong occurrence', () => {
  const d = calendarFixture();
  const w = savedSession(d, 1, 'Saturday', '2026-11-16');
  w.scheduledFor = '2026-11-14';
  d.history = [w];
  expect(suggestWorkout(d, noon('2026-11-16'))!.date).toBe('2026-11-17');
  expect(suggestWorkout(d, noon('2026-11-28'))!.date).toBe('2026-11-28');
  const r = syncStreaks(d, noon('2026-11-16'));
  expect(calculateStreak(r, noon('2026-11-16')).current).toBe(0);
});
it('reload and JSON merge retain calendar anchors, assignments, history and streak audits', () => {
  const d = calendarFixture();
  d.history = [savedSession(d, 1, 'Tuesday', '2026-11-10')];
  const round = mergeBackup(d, parseData(JSON.parse(JSON.stringify(d))));
  expect(currentProgram(round)!.calendar).toEqual(currentProgram(d)!.calendar);
  expect(round.history).toEqual(d.history);
  expect(round.streak!.awards).toEqual(d.streak!.awards);
  expect(suggestWorkout(round, noon('2026-11-12'))!.week).toBe(1);
  const bad = structuredClone(d);
  currentProgram(bad)!.calendar!.anchorDate = '2026-02-30';
  expect(() => parseData(bad)).toThrow('calendar');
});
it('calendar anchors use local Mondays across DST/year boundaries, not ISO parity', () => {
  const c = currentProgram(calendarFixture())!.calendar!;
  c.anchorDate = '2026-03-23';
  for (const [stamp, date, cycle] of [
    ['2026-03-29T21:59:59Z', '2026-03-29', 1],
    ['2026-03-29T22:00:00Z', '2026-03-30', 2],
    ['2026-04-05T22:00:00Z', '2026-04-06', 1],
  ] as const) {
    expect(localDate(Date.parse(stamp), 'Europe/Vienna')).toBe(date);
    expect(cycleForDate(date, c, [1, 2])).toBe(cycle);
  }
  c.anchorDate = '2026-12-28';
  expect(cycleForDate('2027-01-05', c, [1, 2])).toBe(2);
  c.anchorDate = '2026-10-19';
  expect(cycleForDate('2026-10-26', c, [1, 2])).toBe(2);
  // A future reference date still defines preceding calendar weeks.
  c.anchorDate = '2027-01-11';
  expect(cycleForDate('2027-01-04', c, [1, 2])).toBe(2);
});
it('anchor corrections align current/future streak schedules without rewriting past requirements', () => {
  let d = calendarFixture();
  d.history = [savedSession(d, 1, 'Tuesday', '2026-11-10')];
  d = syncStreaks(d, noon('2026-11-17'));
  const past = structuredClone(d.streak!.weeks.filter((w) => w.week < '2026-11-16'));
  d = configureCalendar(d, {
    ...currentProgram(d)!.calendar!,
    anchorDate: '2026-11-16',
    anchorWeek: 1,
  });
  d = syncStreaks(d, noon('2026-11-17'));
  expect(d.streak!.weeks.filter((w) => w.week < '2026-11-16')).toEqual(past);
  expect(calculateStreak(d, noon('2026-11-17')).currentWeek!.goals.at(-1)!.goal.cycleWeek).toBe(1);
  expect(suggestWorkout(d, noon('2026-11-17'))!.week).toBe(1);
});
function otherProgram(d: Data, text: string) {
  const p = parseProgram(textDocument(text));
  programIssues(p).forEach((i) => (i.reviewed = true));
  return applyProgram(d, p, true);
}
it('different programs retain independent anchors; three-cycle rotations follow supplied order', () => {
  const original = calendarFixture();
  let d = otherProgram(
    original,
    'Program: Three cycle\nWeek 1\nMonday: Full Body\n- Squat 2x5\nWeek 2\nWednesday: Upper\n- Press 3x8\nWeek 3\nFriday: Lower\n- Deadlift 2x4',
  );
  currentProgram(d)!.program!.rotation = { weeks: [1, 3, 2], repeat: true };
  d.trainingProgram = currentProgram(d)!.program;
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: {},
  });
  expect(suggestWorkout(d, noon('2026-11-20'))!.week).toBe(3);
  expect(suggestWorkout(d, noon('2026-11-25'))!.week).toBe(2);
  expect(
    suggestWorkout(activateProgram(d, original.activeProgramId!), noon('2026-11-17'))!.week,
  ).toBe(2);
});
it('missing metadata requires explicit configuration, and weekday overrides are shared with streaks', () => {
  let d = otherProgram(
    calendarFixture(),
    'Program: No fixed days\nWorkout A:\n- Squat 2x5\nWorkout B:\n- Press 3x8',
  );
  expect(calendarStatus(d)).toMatch(/Assign workout weekdays/);
  expect(suggestWorkout(d, noon('2026-11-10'))).toBeNull();
  expect(() =>
    configureCalendar(d, {
      version: 1,
      enabled: true,
      anchorDate: '2026-11-09',
      anchorWeek: 1,
      days: {},
    }),
  ).toThrow('weekday');
  const ids = currentProgram(d)!.program!.workouts.map((w) => w.id);
  d = configureCalendar(d, {
    version: 1,
    enabled: true,
    anchorDate: '2026-11-09',
    anchorWeek: 1,
    days: { [ids[0]]: 1, [ids[1]]: 3 },
  });
  expect(suggestWorkout(d, noon('2026-11-10'))!.templateId).toBe(ids[0]);
  const r = syncStreaks(d, noon('2026-11-10'));
  expect(calculateStreak(r, noon('2026-11-10')).currentWeek!.goals.at(-1)!.goal.target).toBe(2);
  delete currentProgram(d)!.calendar;
  expect(suggestWorkout(d, noon('2026-11-10'))).toBeNull();
});

it('selection is pure and disabled configuration never changes manual position', () => {
  const d = calendarFixture(),
    before = structuredClone(d);
  applyAutomaticSelection(d, noon('2026-11-14'));
  expect(d).toEqual(before);
  currentProgram(d)!.calendar!.enabled = false;
  expect(applyAutomaticSelection(d, noon('2026-11-14'))).toBe(d);
});
it('correcting the Streak calendar cycle updates the shared auto-selection anchor', () => {
  let d = calendarFixture();
  d = configureStreak(d, { cycleWeek: 2 }, noon('2026-11-10'));
  expect(currentProgram(d)!.calendar!.anchorWeek).toBe(2);
  expect(suggestWorkout(d, noon('2026-11-10'))!.week).toBe(2);
  expect(calculateStreak(d, noon('2026-11-10')).currentWeek!.goals.at(-1)!.goal.cycleWeek).toBe(2);
});

it('the full IndexedDB JSON backup restores calendar anchors and keeps performance separate', async () => {
  const d = calendarFixture(),
    store = crypto.randomUUID();
  d.history = [savedSession(d, 1, 'Tuesday', '2026-11-10')];
  await saveData(d, store);
  const file = await createDatabaseBackup(d, store);
  const preview = inspectBackup(JSON.parse(JSON.stringify(file)));
  expect(currentProgram(preview.data)!.calendar).toEqual(currentProgram(d)!.calendar);
  await expect(restoreDatabaseBackup(emptyData(), file, false, store)).rejects.toThrow('Confirm');
  const restored = await restoreDatabaseBackup(emptyData(), file, true, crypto.randomUUID());
  expect(currentProgram(restored)!.calendar).toEqual(currentProgram(d)!.calendar);
  expect(restored.history).toEqual(d.history);
  const reloaded = await loadData({ getItem: () => null }, store);
  expect(currentProgram(reloaded)!.calendar).toEqual(currentProgram(d)!.calendar);
});

it('completing Week 2 Saturday advances to Week 1 Tuesday while the current streak week stays Week 2', () => {
  let d = calendarFixture();
  d.history = [savedSession(d, 2, 'Saturday', '2026-11-21')];
  d = syncStreaks(d, noon('2026-11-21'));
  const before = structuredClone(d.streak!.weeks);
  const selected = applyAutomaticSelection(d, noon('2026-11-21'));
  expect(suggestWorkout(d, noon('2026-11-21'))).toMatchObject({
    date: '2026-11-24',
    week: 1,
    kind: 'NEXT WORKOUT',
  });
  const synced = syncStreaks(selected, noon('2026-11-21'));
  expect(synced.streak!.weeks).toEqual(before);
  expect(calculateStreak(synced, noon('2026-11-21')).currentWeek!.chosen!.goal.cycleWeek).toBe(2);
});

it('saving an incomplete/test workout triggers review but never consumes its scheduled occurrence', () => {
  const d = calendarFixture(),
    now = noon('2026-11-14');
  const key = automaticSelectionKey(d, now);
  const w = savedSession(d, 1, 'Saturday', '2026-11-14');
  w.streakExcluded = true;
  d.history = [w];
  expect(automaticSelectionKey(d, now)).not.toBe(key);
  expect(suggestWorkout(d, now)).toMatchObject({ date: '2026-11-14', kind: "TODAY'S WORKOUT" });
});
