import { createDatabaseBackup, parseBackup, restoreDatabaseBackup } from './backup';
import { parseProgram } from './importing/parser';
import { textDocument } from './importing/extraction';
import { applyProgram } from './importing/saving';
import { createWorkout } from './data';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  emptyData,
  mergeBackup,
  parseData,
  saveData,
  loadData,
  type Exercise,
  type Workout,
} from './data';
import { ensureController } from './controller';
import { exerciseIdentity } from './performance';
import {
  applyProgressionTarget,
  comparableSessions,
  defaultIncrement,
  confirmProgressionEffort,
  effortConfirmed,
  progressionConflicts,
  progressionIntensity,
  progressionSuggestion,
  progressionTimeline,
} from './progression';
import {
  assertProgressionPreferences,
  mergeProgressionPreferences,
  type ProgressionPreferences,
} from './progression-preferences';
import { offsetWeight } from './weight';
const prefs: ProgressionPreferences = { enabled: true, increments: {} };
function session(n: number, reps = 6, weight = '100', effort = ''): Workout {
  return ensureController({
    id: `w${n}`,
    name: 'Workout A',
    programId: 'p1',
    week: 'hard',
    started: n * 1000,
    finished: n * 1000 + 500,
    restEnd: 123,
    restSeconds: 90,
    exercises: [
      {
        id: 'bench',
        name: 'Bench Press',
        exerciseIntensity: 'HARD',
        rest: 90,
        sets: [0, 1].map((i) => ({
          id: `s${i}`,
          weight,
          reps: String(reps),
          done: true,
          prescription: {
            number: i + 1,
            minReps: 5,
            maxReps: 8,
            effort,
            source: 'Original target',
          },
        })),
      },
    ],
  });
}
function active() {
  const w = session(100);
  delete w.finished;
  w.exercises[0].sets.forEach((s) => {
    s.done = false;
    s.weight = '';
    s.reps = '';
  });
  return w;
}
const suggest = (history: Workout[], w = active(), p = prefs) =>
  progressionSuggestion(w, w.exercises[0], history, p);
function attested(n: number, reps = 8, weight = '100', effort = 'half fail') {
  const w = session(n, reps, weight, effort);
  delete w.finished;
  const result = confirmProgressionEffort(w, 'bench', true);
  result.finished = n * 1000 + 500;
  return result;
}
describe('conservative progression from saved comparable sessions', () => {
  it('adds one rep total inside the range, without altering actual logs or targets', () => {
    const h = [session(1)],
      w = active(),
      before = structuredClone([w, h]);
    const s = suggest(h, w);
    expect(s.action).toBe('reps');
    expect(s.targets.map((t) => [t.weight, t.reps])).toEqual([
      ['100', '7'],
      ['100', '6'],
    ]);
    expect([w, h]).toEqual(before);
  });
  it('maintains after only one top-range performance, increases weight after two', () => {
    expect(suggest([session(1, 8)]).action).toBe('maintain');
    const s = suggest([session(1, 8), session(2, 8)]);
    expect(s.action).toBe('weight');
    expect(s.targets.map((t) => [t.weight, t.reps])).toEqual([
      ['101', '5'],
      ['101', '5'],
    ]);
  });
  it('honors fractional custom increments, supported machines and conservative limits', () => {
    const w = active(),
      id = exerciseIdentity('Bench Press');
    const p = { enabled: true, increments: { [id]: '0.125' } };
    const s = suggest([session(1, 8, '7.75'), session(2, 8, '7.75')], w, p);
    expect(s.targets[0].weight).toBe('7.875');
    expect(suggest([session(1, 8, '7.75'), session(2, 8, '7.75')]).action).toBe('maintain');
    const h = [session(1, 8), session(2, 8)];
    [...h, w].forEach((w) => (w.exercises[0].name = 'Cable Curl'));
    expect(suggest(h, w).action).toBe('maintain');
    expect(
      suggest(h, w, { enabled: true, increments: { [exerciseIdentity('Cable Curl')]: '0.25' } })
        .targets[0].weight,
    ).toBe('100.25');
    [...h, w].forEach((w) => (w.exercises[0].name = 'Squat'));
    expect(suggest(h, w).targets[0].weight).toBe('102.5');
    let value = '8.125';
    for (let i = 0; i < 20; i++) value = offsetWeight(value, '0.125')!;
    expect(value).toBe('10.625');
    expect(offsetWeight('0.125', '0.25', -1)).toBeNull();
  });
  it('does not assume a default machine increment and treats weighted lunges as lower body', () => {
    const e = active().exercises[0];
    for (const name of [
      'Hack Squat',
      'Belt Squat',
      'Smith Bench Press',
      'Leg Press',
      'Unlabeled station',
    ])
      expect(defaultIncrement({ ...e, name })).toBeNull();
    expect(defaultIncrement({ ...e, name: 'Dumbbell Lunges' })).toBe('2.5');
  });
  it('keeps Easy and MID separate from Hard and never calls them failed progression', () => {
    const w = active(),
      easy = session(1, 6);
    easy.exercises[0].exerciseIntensity = 'EASY';
    expect(suggest([easy], w).action).toBe('insufficient');
    w.exercises[0].exerciseIntensity = 'EASY';
    expect(progressionIntensity(w, w.exercises[0])).toBe('easy');
    expect(suggest([easy, session(2, 8)], w).action).toBe('maintain');
    w.exercises[0].exerciseIntensity = 'MID';
    easy.exercises[0].exerciseIntensity = 'MID';
    expect(suggest([easy], w).action).toBe('maintain');
  });
  it('matches both session and exercise intensity when an exercise overrides its session', () => {
    const easy = session(1, 8),
      hard = session(2, 8),
      w = active();
    easy.week = 'easy';
    w.week = 'easy'; // The exercise itself remains HARD in both sessions.
    expect(comparableSessions(w, w.exercises[0], [hard])).toEqual([]);
    const result = suggest([easy, hard], w);
    expect(result.previous?.workout.id).toBe(easy.id);
    expect(result.action).toBe('maintain');
  });
  it('does not invent missing intensity, ranges or rep prescriptions', () => {
    for (const type of ['intensity', 'range', 'amrap']) {
      const h = session(1),
        w = active();
      for (const x of [h, w]) {
        if (type === 'intensity') {
          x.week = '';
          x.exercises[0].exerciseIntensity = '';
        } else
          x.exercises[0].sets.forEach((s) => {
            s.prescription!.minReps = null;
            s.prescription!.maxReps = null;
            s.prescription!.repsText = type === 'amrap' ? 'AMRAP' : null;
          });
      }
      expect(suggest([h], w).action).toBe('insufficient');
      expect(suggest([h], w).targets).toEqual([]);
    }
  });
  it('requires explicit matching effort evidence; prescriptions alone do not prove readiness', () => {
    const w = active();
    w.exercises[0].sets.forEach((s) => (s.prescription!.effort = 'half fail'));
    expect(
      suggest([session(1, 8, '100', 'half fail'), session(2, 8, '100', 'half fail')], w).action,
    ).toBe('maintain');
    expect(suggest([attested(1), attested(2)], w).action).toBe('weight');
    expect(suggest([session(1, 8, '100', 'half fail'), attested(2)], w).action).toBe('maintain');
    const h = attested(1, 6);
    expect(effortConfirmed(h.exercises[0])).toBe(true);
    expect(suggest([h], w).action).toBe('reps');
    h.exercises[0].sets[0].reps = '7';
    expect(effortConfirmed(h.exercises[0])).toBe(false);
    expect(suggest([h], w).action).toBe('maintain');
    expect(confirmProgressionEffort(h, 'bench', true)).toEqual(h); // Saved history cannot be attested retroactively.
  });
  it.each(['no fail', 'fail', 'half fail'])(
    'keeps %s intact and respects changed per-set effort',
    (effort) => {
      const w = active();
      w.exercises[0].sets.forEach((s) => (s.prescription!.effort = effort));
      expect(suggest([attested(1, 6, '100', effort)], w).action).toBe('reps');
      w.exercises[0].sets[0].prescription!.effort = 'different';
      expect(suggest([attested(1, 6, '100', effort)], w).action).toBe('insufficient');
    },
  );
  it('invalidates effort confirmation on edited prescriptions, or incomplete logging', () => {
    const h = attested(1);
    h.exercises[0].sets[0].prescription!.targetRir = 3;
    expect(effortConfirmed(h.exercises[0])).toBe(false);
    const w = active();
    w.exercises[0].sets[0].prescription!.effort = 'no fail';
    expect(confirmProgressionEffort(w, 'bench', true)).toEqual(w);
  });
  it('offers a small recovery reduction only after repeated decline, never one bad workout', () => {
    expect(suggest([session(1, 4)]).action).toBe('maintain');
    expect(suggest([session(1, 8), session(2, 7)]).action).toBe('reps');
    const s = suggest([session(1, 8), session(2, 7), session(3, 6)]);
    expect(s.action).toBe('recovery');
    expect(s.targets[0]).toMatchObject({ weight: '99', reps: '5' });
    expect(suggest([session(1, 5), session(2, 4), session(3, 4)]).action).toBe('recovery');
  });
  it('also recognizes repeated load decline without calling a load/rep tradeoff a failure', () => {
    const down = suggest([session(1, 6, '100'), session(2, 6, '99'), session(3, 6, '98')]);
    expect(down.action).toBe('recovery');
    expect(down.targets[0].weight).toBe('97');
    expect(suggest([session(1, 6, '100'), session(2, 7, '99'), session(3, 8, '98')]).action).toBe(
      'maintain',
    );
  });
  it('does not borrow from another program, range, count, equipment or unapproved rename', () => {
    for (const type of ['program', 'range', 'count', 'name', 'duplicate', 'rest']) {
      const h = session(1),
        w = active();
      if (type === 'program') h.programId = 'other';
      if (type === 'rest') h.exercises[0].rest = 30;
      if (type === 'range') h.exercises[0].sets[0].prescription!.maxReps = 12;
      if (type === 'count') h.exercises[0].sets.pop();
      if (type === 'name') h.exercises[0].name = 'Smith Bench Press';
      if (type === 'duplicate') h.exercises.push(structuredClone(h.exercises[0]));
      expect(suggest([h], w).action).toBe('insufficient');
    }
    const h = session(1),
      w = active();
    h.exercises[0].name = 'BENCH   PRESS';
    expect(suggest([h], w).action).toBe('reps');
    h.exercises[0].exerciseKey = w.exercises[0].exerciseKey = 'approved-alias';
    h.exercises[0].name = 'Approved old name';
    expect(suggest([h], w).action).toBe('reps');
  });
  it('excludes skipped, pending, invalid, unfinished and duplicate-number sessions', () => {
    for (const type of [
      'skipped',
      'exerciseSkipped',
      'pending',
      'invalid',
      'unfinished',
      'cancelled',
      'numbers',
    ]) {
      const h = session(1),
        e = h.exercises[0];
      if (type === 'skipped') e.sets[0].skipped = true;
      if (type === 'exerciseSkipped') e.skipped = true;
      if (type === 'pending') e.sets[0].needsLogging = true;
      if (type === 'invalid') e.sets[0].reps = '6.5';
      if (type === 'unfinished') delete h.finished;
      if (type === 'cancelled') h.cancelled = true;
      if (type === 'numbers') e.sets[1].prescription!.number = 1;
      expect(suggest([h]).action).toBe('insufficient');
    }
  });
  it('handles actual bodyweight, assistance and zero load without inventing resistance', () => {
    const h = session(1, 6, '0'),
      w = active();
    expect(suggest([h], w).action).toBe('insufficient');
    h.exercises[0].name = w.exercises[0].name = 'Push-ups';
    expect(suggest([h], w).targets[0]).toMatchObject({ weight: '0', reps: '7' });
    h.exercises[0].name = w.exercises[0].name = 'Assisted Pull-ups';
    expect(suggest([h], w).action).toBe('insufficient');
  });
  it('preserves fixed prescribed weights and does not relabel pounds as kilograms', () => {
    const h = session(1),
      w = active();
    for (const x of [h, w])
      x.exercises[0].sets.forEach(
        (s) => (s.prescription!.targetWeight = { value: 100, unit: 'kg' }),
      );
    expect(suggest([h], w).action).toBe('maintain');
    expect(suggest([h], w).targets[0].weight).toBe('100');
    for (const x of [h, w])
      x.exercises[0].sets.forEach((s) => (s.prescription!.targetWeight!.unit = 'lb'));
    expect(suggest([h], w).targets).toEqual([]);
  });
  it('recomputes after deletion, supports same-day sessions and deterministic ordering', () => {
    const h = [session(1, 8), session(2, 8)];
    expect(suggest(h).action).toBe('weight');
    expect(suggest(h.slice(1)).action).toBe('maintain');
    expect(suggest([]).action).toBe('insufficient');
    expect(comparableSessions(active(), active().exercises[0], h).map((s) => s.workout.id)).toEqual(
      ['w2', 'w1'],
    );
  });
});
describe('explicit target application and data safety', () => {
  it('fills blank fields, requires consent for entered values, skips completed and running sets', () => {
    const w = active(),
      s = suggest([session(1)], w),
      before = structuredClone(w);
    w.exercises[0].sets[0].weight = '7.';
    w.exercises[0].sets[0].reps = '3';
    expect(progressionConflicts(w, w.exercises[0], s)).toBe(1);
    const safe = applyProgressionTarget(w, 'bench', s);
    expect(safe.exercises[0].sets[0].weight).toBe('7.');
    expect(safe.exercises[0].sets[1].reps).toBe('6');
    expect(applyProgressionTarget(w, 'bench', s, true).exercises[0].sets[0].reps).toBe('7');
    w.exercises[0].sets[0].done = true;
    w.controller!.running = { exerciseId: 'bench', setId: 's1' };
    expect(applyProgressionTarget(w, 'bench', s, true)).toEqual(w);
    expect(w.controller!.rests).toEqual(before.controller!.rests);
  });
  it('keeps comparisons separate for two actual imported programs', () => {
    const a = parseProgram(textDocument('Program: Alpha\nWorkout A HARD\n- Bench Press 2x5-8'));
    const b = parseProgram(textDocument('Program: Beta\nWorkout B HARD\n- Bench Press 2x5-8'));
    let d = applyProgram(emptyData(), a, true);
    const old = createWorkout(a.workouts[0].id, 'hard', d.plan, 1000);
    old.programId = d.activeProgramId;
    old.finished = 2000;
    old.exercises[0].sets.forEach((s) =>
      Object.assign(s, { weight: '100', reps: '6', done: true }),
    );
    d.history = [old];
    d = applyProgram(d, b, true);
    const next = createWorkout(b.workouts[0].id, 'hard', d.plan, 3000);
    next.programId = d.activeProgramId;
    expect(progressionSuggestion(next, next.exercises[0], d.history, prefs).action).toBe(
      'insufficient',
    );
    expect(d.history).toEqual([old]);
  });
  it('retains increments and effort evidence through the real full-database backup path', async () => {
    const d = {
      ...emptyData(),
      history: [attested(1)],
      active: active(),
      progressionPreferences: {
        enabled: true,
        increments: { [exerciseIdentity('Bench Press')]: '0.125' },
      },
    };
    await saveData(d, 'progression-export');
    const backup = await createDatabaseBackup(d, 'progression-export');
    const preview = parseBackup(JSON.stringify(backup));
    expect(preview.data.progressionPreferences).toEqual(d.progressionPreferences);
    expect(preview.data.history).toEqual(d.history);
    const restored = await restoreDatabaseBackup(
      emptyData(),
      preview.source,
      true,
      'progression-restored',
    );
    expect(restored.progressionPreferences).toEqual(d.progressionPreferences);
    expect(restored.history).toEqual(d.history);
    expect(effortConfirmed(restored.history[0].exercises[0])).toBe(true);
  });
  it('never applies a target to a finished workout, even when it contains unfinished fields', () => {
    const w = active(),
      suggestion = suggest([session(1)], w);
    w.finished = w.started + 1000;
    expect(applyProgressionTarget(w, 'bench', suggestion, true)).toEqual(w);
  });
  it('does not touch timers, prescriptions, done flags, or input objects', () => {
    const w = active(),
      before = structuredClone(w),
      s = suggest([session(1)], w);
    const result = applyProgressionTarget(w, 'bench', s);
    expect(w).toEqual(before);
    expect(result.controller).toEqual(w.controller);
    expect(result.restEnd).toBe(w.restEnd);
    expect(result.exercises[0].sets.map((s) => s.prescription)).toEqual(
      w.exercises[0].sets.map((s) => s.prescription),
    );
    expect(result.exercises[0].sets.every((s) => !s.done)).toBe(true);
  });
  it('backs up and restores preferences, effort evidence, active data and old saved history', async () => {
    const d = {
      ...emptyData(),
      progressionPreferences: {
        enabled: true,
        increments: { [exerciseIdentity('Bench Press')]: '0.125' },
      },
      history: [attested(1)],
      active: active(),
    };
    const incoming = parseData(JSON.parse(JSON.stringify(d))),
      before = structuredClone(d);
    const restored = mergeBackup(emptyData(), incoming);
    expect(restored.history).toEqual(d.history);
    expect(restored.active).toEqual(d.active);
    expect(restored.progressionPreferences).toEqual(d.progressionPreferences);
    expect(d).toEqual(before);
    await saveData(d, 'progression-regression');
    const loaded = await loadData({ getItem: () => null }, 'progression-regression');
    expect(loaded.progressionPreferences).toEqual(d.progressionPreferences);
    expect(loaded.active).toEqual(d.active);
    expect(loaded.history).toEqual(d.history);
    expect(parseData(emptyData()).progressionPreferences).toBeUndefined();
    expect(
      mergeProgressionPreferences(
        { enabled: false, increments: { x: '0.25' } },
        { enabled: true, increments: { x: '1', y: '0.125' } },
      ),
    ).toEqual({ enabled: false, increments: { x: '0.25', y: '0.125' } });
  });
  it.each([
    null,
    { enabled: 'yes', increments: {} },
    { enabled: true, increments: { x: '-1' } },
    { enabled: true, increments: { x: '0.0001' } },
    { enabled: true, increments: [] },
    { enabled: true, increments: { x: 1 } },
  ])('rejects malformed preferences: %s', (p) => {
    expect(() => assertProgressionPreferences(p)).toThrow();
  });
  it('derives chronological events and PR labels solely from comparable actual workouts', () => {
    const h = [session(1, 6), session(2, 7), session(3, 7), session(4, 5, '101')];
    const before = structuredClone(h),
      timeline = progressionTimeline(h, exerciseIdentity('Bench Press'));
    expect(timeline.map((t) => t.label)).toEqual([
      'Insufficient comparable history',
      'Increased reps',
      'Maintained performance',
      'Increased weight',
    ]);
    expect(timeline[3].pr).toBe(true);
    expect(h).toEqual(before);
    expect(progressionTimeline(h.slice(1), exerciseIdentity('Bench Press'))).toHaveLength(3);
  });
});
