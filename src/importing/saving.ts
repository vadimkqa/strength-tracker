import type { Data } from '../data';
import type { Plan } from '../templates';
import { programProblems, assertProgram, type TrainingProgram } from './model';
export function compileProgram(program: TrainingProgram): Plan {
  return Object.fromEntries(
    program.workouts.map((w) => [
      w.id,
      w.exercises.map((e) => [
        e.name,
        e.setCount,
        e.sets[0]?.restSeconds ?? e.defaultTarget?.restSeconds ?? null,
        {
          reps:
            e.sets[0]?.repsText ||
            e.defaultTarget?.repsText ||
            (e.defaultTarget?.minReps != null
              ? `${e.defaultTarget.minReps}${e.defaultTarget.maxReps !== null && e.defaultTarget.maxReps !== e.defaultTarget.minReps ? `–${e.defaultTarget.maxReps}` : ''}`
              : ''),
          notes: e.notes,
          category: '',
          source: e.source.map((s) => s.text).join('\n'),
          exerciseId: e.identity,
          exerciseIntensity: e.intensity || '',
          optional: e.optional,
          alternatives: e.alternatives,
          groupId: e.groupId || undefined,
          groupLabel: w.groups.find((g) => g.id === e.groupId)?.name,
          setPrescriptions: e.sets.map((s) => ({
            number: s.number,
            minReps: s.minReps,
            maxReps: s.maxReps,
            effort: s.effort || '',
            source: s.source.text,
            targetWeight: s.weight,
            targetRpe: s.rpe,
            targetRir: s.rir,
            restSeconds: s.restSeconds,
            repsText: s.repsText,
          })),
        },
      ]),
    ]),
  ) as Plan;
}
export function applyProgram(current: Data, program: TrainingProgram, confirmed: boolean): Data {
  if (confirmed !== true)
    throw Error('Explicit confirmation is required before replacing templates.');
  assertProgram(program);
  const problems = programProblems(program);
  if (problems.length) throw Error(problems.join(' '));
  const copy = structuredClone(program);
  return {
    ...current,
    trainingProgram: copy,
    plan: { ...current.plan, ...compileProgram(copy) },
    rotation: undefined,
    rotationWeek: copy.rotation?.weeks[0] || copy.workouts[0].week,
    carouselWorkout: copy.workouts[0].slotId,
    difficultyOverride: undefined,
  };
}
/** Keep the normalized source of truth and its compatibility index aligned after Settings edits. */
export function resizeTemplateSets(data: Data, key: string, index: number, count: number): Data {
  const exercise = data.trainingProgram?.workouts.find((w) => w.id === key)?.exercises[index];
  if (!exercise) {
    data.plan[key][index][1] = count;
    return data;
  }
  exercise.setCount = count;
  exercise.sets = Array.from(
    { length: count },
    (_, i) =>
      exercise.sets[i] || {
        ...(exercise.defaultTarget || {}),
        number:
          Math.max(0, ...exercise.sets.map((s) => s.number ?? 0)) + i - exercise.sets.length + 1,
        minReps: exercise.defaultTarget?.minReps ?? null,
        maxReps: exercise.defaultTarget?.maxReps ?? null,
        repsText: exercise.defaultTarget?.repsText ?? null,
        weight: exercise.defaultTarget?.weight ?? null,
        rpe: exercise.defaultTarget?.rpe ?? null,
        rir: exercise.defaultTarget?.rir ?? null,
        effort: exercise.defaultTarget?.effort ?? null,
        restSeconds: exercise.defaultTarget?.restSeconds ?? null,
        source: { line: 0, text: 'Set added in Settings' },
      },
  );
  data.plan[key] = compileProgram(data.trainingProgram!)[key];
  return data;
}
