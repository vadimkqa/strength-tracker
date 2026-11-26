import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDatabaseBackup, parseBackup, restoreDatabaseBackup } from './backup';
import { emptyData, loadData, parseData, saveData } from './data';
import { addDays, calendarWeek, localDate } from './calendar';
import {
  calculateStreak,
  configureStreak,
  previewRestPeriod,
  syncStreaks,
  STREAK_TIME_ZONE,
} from './streak';
import { secretUnlocked } from './streak-artwork';
import {
  assertFreezes,
  earliestRestDate,
  freezeWeekCoverage,
  restWeeks,
  freezeStatus,
  mergeFreezes,
  updateFreezes,
} from './streak-freeze';
import { completed, fillWeek, streakFixture } from '../tests/streak-unit-fixture';

const period = { start: '2026-11-09', end: '2026-11-15' };
const now = Date.parse('2026-11-08T18:00Z');
const at = (date: string) => Date.parse(date + 'T18:00:00Z');
const schedule = (end = period.end) =>
  updateFreezes([], { type: 'save', range: { ...period, end } }, now);

describe('inclusive Europe/Vienna rest periods', () => {
  it('calculates touched and fully covered weeks without modifying selected dates', () => {
    expect([...restWeeks(period)]).toEqual([period.start]);
    expect(freezeWeekCoverage(period, period.start).protected).toBe(true);
    const partial = { start: '2026-11-10', end: '2026-11-26' };
    expect([...restWeeks(partial)]).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
    expect(
      [...restWeeks(partial)].map((week) => freezeWeekCoverage(partial, week).protected),
    ).toEqual([false, true, false]);
    expect([...restWeeks({ start: '2026-11-15', end: '2026-11-16' })]).toEqual([
      '2026-11-09',
      '2026-11-16',
    ]);
    expect(freezeStatus(period, '2026-11-08')).toBe('Upcoming');
    expect(freezeStatus(period, '2026-11-09')).toBe('Active');
    expect(freezeStatus(period, '2026-11-15')).toBe('Active');
    expect(freezeStatus(period, '2026-11-16')).toBe('Previous');
  });

  it.each([
    ['2026-03-23', '2026-04-05', '2026-03-29T22:00Z', '2026-03-30'],
    ['2026-10-19', '2026-11-01', '2026-10-25T23:00Z', '2026-10-26'],
  ])(
    'keeps Monday boundaries across daylight-saving changes starting %s',
    (start, end, boundary, monday) => {
      expect([...restWeeks({ start, end })]).toEqual([start, monday]);
      const instant = Date.parse(boundary);
      expect(calendarWeek(instant - 1, STREAK_TIME_ZONE)).toBe(start);
      expect(calendarWeek(instant, STREAK_TIME_ZONE)).toBe(monday);
      expect(localDate(instant, STREAK_TIME_ZONE)).toBe(monday);
      const first = earliestRestDate(monday);
      expect(earliestRestDate(localDate(instant - 1, STREAK_TIME_ZONE))).toBe(addDays(first, -7));
      expect(
        updateFreezes([], { type: 'save', range: { start: first, end } }, instant)[0].start,
      ).toBe(first);
      expect(() =>
        updateFreezes([], { type: 'save', range: { start: addDays(first, -1), end } }, instant),
      ).toThrow('previous two');
    },
  );

  it('rejects invalid, overlapping and backdated ranges, including shared endpoints', () => {
    const saved = schedule();
    for (const range of [period, { start: '2026-11-15', end: '2026-11-20' }])
      expect(() => updateFreezes(saved, { type: 'save', range }, now)).toThrow('overlap');
    for (const range of [
      { start: '2026-10-18', end: period.end },
      { start: period.end, end: period.start },
      { start: '2026-02-30', end: period.end },
    ])
      expect(() => updateFreezes(saved, { type: 'save', range }, now)).toThrow('previous two');
    expect(
      updateFreezes(
        saved,
        { type: 'save', range: { start: '2026-11-16', end: '2026-11-22' } },
        now,
      ),
    ).toHaveLength(2);
    expect(() => assertFreezes([...saved, ...saved])).toThrow('Invalid');
    expect(() => assertFreezes([...saved, { ...saved[0], id: 'different' }])).toThrow('overlap');
  });

  it('edits and cancels future dates while retaining invalidation in older backup merges', () => {
    const prior = schedule(),
      id = prior[0].id;
    const edited = updateFreezes(
      prior,
      { type: 'save', id, range: { start: '2026-11-16', end: '2026-11-22' } },
      now,
    );
    expect(edited[0]).toMatchObject({ id, start: '2026-11-16', end: '2026-11-22' });
    expect(mergeFreezes(prior, edited)).toEqual(edited);
    const cancelled = updateFreezes(edited, { type: 'cancel', id }, now);
    expect(cancelled[0].cancelled).toBe(true);
    expect(mergeFreezes(cancelled, prior)).toEqual(cancelled);
    expect(mergeFreezes(prior, cancelled)).toEqual(cancelled);
    expect(updateFreezes(cancelled, { type: 'save', range: period }, now)).toHaveLength(2);
    expect(updateFreezes(prior, { type: 'cancel', id }, at(period.start))[0].cancelled).toBe(true);
    const extended = updateFreezes(
      prior,
      {
        type: 'save',
        id,
        range: { start: '2026-11-06', end: '2026-11-18' },
      },
      at(period.start),
    );
    expect(extended[0]).toMatchObject({ id, start: '2026-11-06', end: '2026-11-18' });
    expect(mergeFreezes(extended, prior)).toEqual(extended);
    expect(
      updateFreezes(
        extended,
        { type: 'save', id, range: { start: '2026-11-06', end: '2026-12-07' } },
        at('2026-11-23'),
      )[0].start,
    ).toBe('2026-11-06');
    expect(() =>
      updateFreezes(prior, { type: 'save', id, range: period }, at('2026-12-01')),
    ).toThrow('outside the editable');
  });

  it('ends after today and retains only completed Monday–Sunday coverage', () => {
    const saved = schedule('2026-11-29'),
      id = saved[0].id;
    const ended = updateFreezes(saved, { type: 'end', id }, at('2026-11-18'));
    expect(ended[0].end).toBe('2026-11-18');
    expect(
      [...restWeeks(ended[0])].map((week) => freezeWeekCoverage(ended[0], week).protected),
    ).toEqual([true, false]);
    expect(freezeStatus(ended[0], '2026-11-19')).toBe('Previous');
    expect(mergeFreezes(ended, saved)).toEqual(ended);
    const sunday = updateFreezes(saved, { type: 'end', id }, at('2026-11-22'));
    expect(
      [...restWeeks(sunday[0])].every((week) => freezeWeekCoverage(sunday[0], week).protected),
    ).toBe(true);
    expect(() => updateFreezes(saved, { type: 'end', id }, now)).toThrow('active');
  });
});

describe('Strength Streak with planned rest', () => {
  function seeded(count: number) {
    const d = streakFixture(1);
    delete d.streak;
    for (let i = count; i > 0; i--) fillWeek(d, addDays(period.start, -7 * i));
    return syncStreaks(d, now);
  }

  it('carries 12 actual weeks through a rest week and adds only the next successful week', () => {
    let d = seeded(12);
    d.streak!.freezes = schedule();
    expect(calculateStreak(d, now).current).toBe(12);
    expect(calculateStreak(d, now).weeks.some((w) => w.status === 'frozen')).toBe(false);
    expect(calculateStreak(d, at(period.end)).currentWeek).toMatchObject({
      status: 'frozen',
      chosen: { completed: 0, success: false },
    });
    fillWeek(d, '2026-11-16');
    d = syncStreaks(d, at('2026-11-16'));
    const report = calculateStreak(d, at('2026-11-16'));
    expect(report.current).toBe(13);
    expect(report.longest).toBe(13);
    expect(report.earned.triple).toBe('2026-11-02');
    expect(report.earned.silver).toBeUndefined();
    expect(d.history).toHaveLength(13);
  });

  it('bridges consecutive covered weeks, including weeks absent from stored snapshots', () => {
    const d = seeded(2);
    d.streak!.freezes = schedule('2026-11-29');
    fillWeek(d, '2026-11-30');
    const report = calculateStreak(d, at('2026-11-30'));
    expect(report.weeks.filter((w) => w.status === 'frozen').map((w) => w.week)).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
    expect(report.current).toBe(3);
  });

  it('credits a qualifying week during planned rest, and recalculates after deleting that workout', () => {
    const d = seeded(2);
    d.streak!.freezes = schedule();
    fillWeek(d, period.start);
    const when = at(period.end);
    expect(calculateStreak(d, when)).toMatchObject({
      current: 3,
      currentWeek: { status: 'success', chosen: { completed: 1 } },
    });
    d.history.pop();
    expect(calculateStreak(d, when)).toMatchObject({
      current: 2,
      currentWeek: { status: 'frozen', chosen: { completed: 0 } },
    });
  });

  it('preserves legacy results and breaks a streak on uncovered, partial or cancelled weeks', () => {
    const d = seeded(2);
    const when = at('2026-11-16');
    d.streak!.freezes = updateFreezes(
      [],
      { type: 'save', range: { start: '2026-11-10', end: '2026-11-14' } },
      now,
    );
    expect(calculateStreak(d, when).current).toBe(0);
    d.streak!.freezes = schedule();
    d.streak!.freezes = updateFreezes(
      d.streak!.freezes,
      { type: 'cancel', id: d.streak!.freezes[0].id },
      now,
    );
    expect(calculateStreak(d, when).current).toBe(0);
    delete d.streak!.freezes;
    const legacy = parseData(JSON.parse(JSON.stringify(d)));
    expect(legacy.streak!.freezes).toBeUndefined();
    expect(calculateStreak(legacy, now).current).toBe(2);
    expect(calculateStreak(legacy, when)).toMatchObject({ current: 0, longest: 2 });
  });

  it('keeps the 52-week secret and crystal milestone locked until 52 actual qualifying weeks', () => {
    let d = seeded(51);
    d.streak!.freezes = schedule();
    d = syncStreaks(d, at(period.end));
    expect(secretUnlocked(calculateStreak(d, at(period.end)).longest)).toBe(false);
    expect(d.streak!.awards.some((a) => a.id === 'crystal' && a.valid)).toBe(false);
    fillWeek(d, '2026-11-16');
    d = syncStreaks(d, at('2026-11-16'));
    expect(secretUnlocked(calculateStreak(d, at('2026-11-16')).longest)).toBe(true);
    expect(d.streak!.awards.find((a) => a.id === 'crystal')).toMatchObject({
      earnedWeek: '2026-11-16',
      valid: true,
    });
  });

  it('protects a prior partial week and previews exactly the outstanding dates under its saved schedule', () => {
    const d = streakFixture(3);
    delete d.streak;
    fillWeek(d, '2026-11-16');
    const template = d.trainingProgram!.workouts[0].id;
    const mondayLog = completed(d, template, '2026-11-23');
    d.history.push(mondayLog);
    const thursday = at('2026-11-26');
    const range = { start: '2026-11-24', end: '2026-11-29' };
    let state = syncStreaks(d, thursday);
    const review = () =>
      previewRestPeriod(
        state,
        range,
        new Map(calculateStreak(state, thursday).weeks.map((w) => [w.week, w])),
        thursday,
      )[0];
    expect(review()).toMatchObject({ week: '2026-11-23', protected: true, uncovered: [] });
    expect(review().covered.map((day) => day.date)).toEqual(['2026-11-24', '2026-11-25']);
    state.history = state.history.filter((w) => w.id !== mondayLog.id);
    expect(review()).toMatchObject({ protected: false, uncovered: [{ date: '2026-11-23' }] });
    state.history.push(mondayLog);
    // Record the rest in the following week after an uncovered miss has already broken the streak.
    const nextMonday = at('2026-11-30');
    expect(calculateStreak(state, nextMonday).current).toBe(0);
    state.streak!.freezes = updateFreezes([], { type: 'save', range }, nextMonday);
    expect(calculateStreak(state, nextMonday)).toMatchObject({ current: 1, longest: 1 });
    expect(
      calculateStreak(state, nextMonday).weeks.find((w) => w.week === '2026-11-23')?.status,
    ).toBe('frozen');
    expect(calculateStreak(state, nextMonday).earned['first-plates']).toBeUndefined();
    state.history.push(
      completed(state, template, '2026-11-25'),
      completed(state, template, '2026-11-25'),
    );
    expect(calculateStreak(state, nextMonday).current).toBe(1);
    state.history.push(completed(state, template, '2026-11-26'));
    expect(calculateStreak(state, nextMonday)).toMatchObject({
      current: 2,
      earned: { 'first-plates': '2026-11-23' },
    });
    expect(
      calculateStreak(state, nextMonday).weeks.find((w) => w.week === '2026-11-23')?.status,
    ).toBe('success');
    const restored = parseData(JSON.parse(JSON.stringify(state)));
    expect(restored.streak!.freezes).toEqual(state.streak!.freezes);
    expect(calculateStreak(restored, nextMonday).current).toBe(2);
  });

  it('requires scheduled days and enough coverage when a manual target exceeds the schedule', () => {
    const when = at('2026-11-26');
    const range = { start: '2026-11-24', end: '2026-11-29' };
    let d = configureStreak(streakFixture(3), { target: 4, weekdays: [1, 3] }, when);
    d.streak!.freezes = updateFreezes([], { type: 'save', range }, when);
    expect(calculateStreak(d, when).currentWeek?.status).toBe('pending');
    d = configureStreak(d, { target: 2, weekdays: [1, 3] }, when);
    expect(calculateStreak(d, when).currentWeek?.status).toBe('frozen');
    d = configureStreak(d, { target: 2, weekdays: [] }, when);
    expect(calculateStreak(d, when).currentWeek?.status).toBe('pending');
  });

  it('round-trips periods, history and cancellations through full-database export and restore', async () => {
    const d = seeded(2);
    const recorded = at('2026-11-12');
    d.streak!.freezes = updateFreezes(
      [],
      { type: 'save', range: { start: period.start, end: '2026-11-12' } },
      recorded,
    );
    await saveData(d, 'freeze-source');
    const backup = await createDatabaseBackup(d, 'freeze-source');
    const preview = parseBackup(JSON.stringify(backup));
    const restored = await restoreDatabaseBackup(emptyData(), preview.source, true, 'freeze-dest');
    expect(restored.streak!.freezes).toEqual(d.streak!.freezes);
    expect(restored.history).toEqual(
      JSON.parse(JSON.stringify([...d.history].sort((a, b) => b.started - a.started))),
    );
    expect(calculateStreak(restored, at(period.end)).current).toBe(2);
    const reloaded = await loadData({ getItem: () => null }, 'freeze-dest');
    expect(reloaded.streak!.freezes).toEqual(d.streak!.freezes);
    restored.streak!.freezes = updateFreezes(
      restored.streak!.freezes!,
      { type: 'cancel', id: d.streak!.freezes[0].id },
      recorded,
    );
    expect(
      (await restoreDatabaseBackup(restored, preview.source, true, 'freeze-dest')).streak!.freezes,
    ).toEqual(restored.streak!.freezes);
  });

  it('refuses conflicting overlapping backup ranges before writing', async () => {
    const current = seeded(1);
    current.streak!.freezes = schedule();
    const incoming = structuredClone(current);
    incoming.streak!.freezes = schedule('2026-11-22');
    await saveData(current, 'freeze-overlap');
    await expect(restoreDatabaseBackup(current, incoming, true, 'freeze-overlap')).rejects.toThrow(
      'overlap',
    );
    expect((await loadData({ getItem: () => null }, 'freeze-overlap')).streak!.freezes).toEqual(
      current.streak!.freezes,
    );
  });
});
