import { describe, expect, it } from 'vitest';
import type { Exercise, SetEntry, Workout } from './data';
import { exerciseIdentity } from './performance';
import {
  chartPoints,
  estimatedOneRM,
  exerciseRecords,
  rangeStart,
  savedIntensity,
  selectRecords,
} from './records';
const at = Date.parse('2026-11-15T12:00:00Z');
const set = (weight: string | number, reps = 5, extra: Partial<SetEntry> = {}): SetEntry => ({
  weight: String(weight),
  reps: String(reps),
  done: true,
  ...extra,
});
function workout(
  name = 'Bench Press',
  sets = [set(60)],
  day = 0,
  extra: Partial<Exercise> = {},
): Workout {
  return {
    id: crypto.randomUUID(),
    name: 'Imported session',
    week: 'heavy',
    started: at + day * 86400000 - 3600000,
    finished: at + day * 86400000,
    restEnd: null,
    restSeconds: null,
    exercises: [{ id: crypto.randomUUID(), name, rest: 90, sets, ...extra }],
  };
}
describe('per-exercise records', () => {
  it('breaks weight ties by reps and separately identifies weight, same-load rep and estimated strength PRs', () => {
    const history = [
      workout('Bench Press', [set(60, 5)], -3),
      workout('Bench Press', [set(60, 6)], -2),
      workout('Bench Press', [set(70, 2)], -1),
      workout('Bench Press', [set(65, 10)]),
    ];
    const before = structuredClone(history),
      r = exerciseRecords(history)[0];
    expect(r.best).toMatchObject({ weight: 70, reps: 2 });
    expect(r.history.map((p) => p.prs)).toEqual([
      { weight: false, reps: false, strength: false },
      { weight: false, reps: true, strength: true },
      { weight: true, reps: false, strength: true },
      { weight: false, reps: false, strength: true },
    ]);
    expect(r.estimated).toMatchObject({ weight: 65, reps: 10 });
    expect(r.volume?.volume).toBe(650);
    expect(r.byReps.map((p) => [p.reps, p.weight])).toEqual([
      [2, 70],
      [5, 60],
      [6, 60],
      [10, 65],
    ]);
    expect(history).toEqual(before);
  });
  it('excludes skipped exercises, unfinished/cancelled sessions, and skipped, unlogged, invalid or unfinished sets', () => {
    const good = workout('Bench Press', [
      set(70),
      set(999, 5, { done: false }),
      set(999, 5, { skipped: true }),
      set(999, 5, { needsLogging: true }),
      set(''),
      set('-1'),
      set('NaN'),
      set('Infinity'),
      set(80, 0),
      set(80, 1.5),
    ]);
    const unfinished = workout();
    delete unfinished.finished;
    const cancelled = { ...workout(), cancelled: true },
      abandoned = { ...workout(), abandoned: true },
      status = { ...workout(), status: 'unfinished' };
    const result = exerciseRecords([
      good,
      unfinished,
      cancelled,
      abandoned,
      status,
      workout('Bench Press', [set(999)], 0, { skipped: true }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].history).toHaveLength(1);
    expect(result[0].best.weight).toBe(70);
  });
  it('normalizes orthography only and never conflates machines, variants or punctuation', () => {
    const r = exerciseRecords(
      [
        'Bench Press',
        '  bench   press  ',
        'Smith Bench Press',
        'Machine Bench Press',
        'Bench-Press',
        'Leg Press',
      ].map((n) => workout(n)),
    );
    expect(r).toHaveLength(5);
    expect(r.find((x) => x.id === exerciseIdentity('Bench Press'))?.history).toHaveLength(2);
  });
  it('uses explicit saved identity for aliases and keeps distinct explicit keys separate', () => {
    const r = exerciseRecords([
      workout('BB Bench', [set(50)], -2, { exerciseKey: 'bench-barbell' }),
      workout('Barbell Bench Press', [set(60)], -1, { exerciseKey: 'bench-barbell' }),
      workout('Barbell Bench Press', [set(200)], 0, { exerciseKey: 'different-machine' }),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].best.weight).toBe(60);
    expect(r[0].names).toEqual(['BB Bench', 'Barbell Bench Press']);
  });
  it('retains legacy history without exercise IDs or saved preferences', () => {
    const w = workout();
    delete w.exercises[0].exerciseKey;
    expect(exerciseRecords([w])[0].id).toBe(exerciseIdentity('Bench Press'));
  });
  it('orders unsorted history chronologically without rewriting it', () => {
    const history = [
      workout('Curl', [set(20)], 0),
      workout('Curl', [set(10)], -30),
      workout('Curl', [set(15)], -5),
    ];
    expect(exerciseRecords(history)[0].history.map((p) => p.weight)).toEqual([10, 15, 20]);
    expect(history[0].exercises[0].sets[0].weight).toBe('20');
  });
  it('never infers body mass, estimates or resistance from zero/assisted/bodyweight logs', () => {
    const rows = exerciseRecords([
      workout('Pull-up', [set(0, 8), set(10, 6)]),
      workout('Assisted Dip', [set(30, 8), set(40, 8), set(20, 8)]),
      workout('Curl', [set(0, 8)]),
    ]);
    expect(rows[0].estimated).toBeNull();
    expect(rows[0].volume?.volume).toBe(60);
    expect(rows[1].estimated).toBeNull();
    expect(rows[1].volume).toBeNull();
    expect(rows[1].history.some((p) => p.prs.weight || p.prs.strength)).toBe(false);
    expect(rows[1].byReps[0].weight).toBe(20);
    expect(chartPoints(rows[1], 'weight')).toEqual([]);
    expect(chartPoints(rows[1], 'volume')).toEqual([]);
    expect(rows[2].estimated).toBeNull();
    expect(rows[2].volume?.volume).toBe(0);
  });
});
describe('estimates and real observation charts', () => {
  it('uses Epley only within sensible rep and load limits', () => {
    expect(estimatedOneRM(100, 1)).toBe(100);
    expect(estimatedOneRM(60, 10)).toBe(80);
    expect(estimatedOneRM(60, 5)).toBe(70);
    for (const reps of [0, -1, 1.5, 11, 30, Infinity]) expect(estimatedOneRM(60, reps)).toBeNull();
    for (const load of [0, -1, NaN, Infinity]) expect(estimatedOneRM(load, 5)).toBeNull();
    expect(estimatedOneRM(30, 8, 'assisted')).toBeNull();
    expect(estimatedOneRM(30, 8, 'bodyweight')).toBeNull();
  });
  it('aggregates max weight and estimate, but sums actual volume per session without filling missing weeks', () => {
    const a = workout('Bench Press', [set(50, 10), set(60, 5)], -90),
      b = workout('Bench Press', [set(70, 5), set(0, 10)], -2),
      r = exerciseRecords([b, a])[0];
    expect(chartPoints(r, 'weight', 'all', at).map((p) => p.value)).toEqual([60, 70]);
    expect(chartPoints(r, 'volume', 'all', at).map((p) => p.value)).toEqual([800, 350]);
    expect(chartPoints(r, 'estimate', 'all', at).map((p) => p.value)).toEqual([
      70,
      70 * (1 + 5 / 30),
    ]);
    expect(chartPoints(r, 'weight', '1', at)).toHaveLength(1);
    expect(chartPoints(r, 'weight', '3', at)).toHaveLength(2);
    expect(chartPoints(r, 'volume', 'all', at).map((p) => p.at)).toEqual([a.finished, b.finished]);
  });
  it('supports all five ranges and excludes future points', () => {
    const r = exerciseRecords(
      [-500, -300, -150, -60, -10, 2].map((day) => workout('Curl', [set(20)], day)),
    )[0];
    expect(
      (['1', '3', '6', '12', 'all'] as const).map(
        (range) => chartPoints(r, 'weight', range, at).length,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
  });
  it('clamps calendar-month boundaries instead of overflowing February', () => {
    expect(new Date(rangeStart('1', new Date(2026, 2, 31, 12).getTime())).getDate()).toBe(28);
  });
});
describe('intensity, filters and sorting', () => {
  it('uses saved exercise intensity over legacy workout intensity and preserves unknown sessions', () => {
    const hard = workout(),
      easy = workout('Bench Press', [set(40)], -1, { exerciseIntensity: 'EASY' }),
      unknown = { ...workout('Bench Press', [set(80)], -2), week: 'unspecified' };
    expect(savedIntensity(hard, hard.exercises[0])).toBe('hard');
    expect(exerciseRecords([hard, easy, unknown], 'easy')[0].best.weight).toBe(40);
    expect(exerciseRecords([hard, easy, unknown], 'hard')[0].best.weight).toBe(60);
    expect(exerciseRecords([hard, easy, unknown])[0].history).toHaveLength(3);
    expect(exerciseRecords([unknown], 'easy')).toEqual([]);
  });
  const rows = () =>
    exerciseRecords([
      workout('Leg Press', [set(300)], -20),
      workout('Bench Press', [set(60)], -10),
      workout('Biceps Curl', [set(15)], -5),
      workout('Bench Press', [set(70)], -2),
    ]);
  it('defaults to alphabetic, prioritizes manual favorite order and never ranks absolute loads', () => {
    const r = rows(),
      favorites = [exerciseIdentity('Biceps Curl'), exerciseIdentity('Bench Press')];
    expect(selectRecords(r, [], 'all', 'alphabetical', '', at).map((x) => x.name)).toEqual([
      'Bench Press',
      'Biceps Curl',
      'Leg Press',
    ]);
    for (const sort of ['alphabetical', 'trained', 'achieved'] as const)
      expect(selectRecords(r, favorites, 'all', sort, '', at).map((x) => x.name)).toEqual([
        'Biceps Curl',
        'Bench Press',
        'Leg Press',
      ]);
    expect(selectRecords(r, favorites, 'favorites', 'trained', '', at)).toHaveLength(2);
  });
  it('filters recent improvements, searches aliases and sorts recency with deterministic fallbacks', () => {
    const r = rows();
    expect(selectRecords(r, [], 'recent', 'alphabetical', '', at).map((x) => x.name)).toEqual([
      'Bench Press',
    ]);
    expect(selectRecords(r, [], 'all', 'trained', '', at).map((x) => x.name)).toEqual([
      'Bench Press',
      'Biceps Curl',
      'Leg Press',
    ]);
    expect(selectRecords(r, [], 'all', 'achieved', '', at)[0].name).toBe('Bench Press');
    expect(selectRecords(r, [], 'all', 'alphabetical', '  CURL ', at).map((x) => x.name)).toEqual([
      'Biceps Curl',
    ]);
    expect(selectRecords(r, [], 'all', 'alphabetical', 'nonexistent', at)).toEqual([]);
    const alias = exerciseRecords([
      workout('Bench', [set(60)], 0, { exerciseKey: 'alias' }),
      workout('BB Press', [set(65)], 0, { exerciseKey: 'alias' }),
    ]);
    expect(selectRecords(alias, [], 'all', 'alphabetical', 'BB Press', at)).toHaveLength(1);
  });
});
