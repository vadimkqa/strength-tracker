import type { Data } from '../data';
import { addProgram, rememberProgram, currentProgram } from '../programs';
import { compileProgram } from './compilation';
export { compileProgram } from './compilation';
import { programProblems, assertProgram, type TrainingProgram } from './model';
export function applyProgram(current: Data, program: TrainingProgram, confirmed: boolean): Data {
  if (confirmed !== true)
    throw Error('Explicit confirmation is required before saving an independent program.');
  assertProgram(program);
  const problems = programProblems(program);
  if (problems.length) throw Error(problems.join(' '));
  const copy = structuredClone(program);
  return addProgram(current, {
    id: crypto.randomUUID(),
    name: copy.name,
    program: copy,
    templates: compileProgram(copy),
  });
}
/** Keep the normalized source of truth and its compatibility index aligned after Settings edits. */
export function resizeTemplateSets(data: Data, key: string, index: number, count: number): Data {
  const normalized = data.programs
    ? currentProgram(data)?.program
      ? data.trainingProgram
      : undefined
    : data.trainingProgram;
  const exercise = normalized?.workouts.find((w) => w.id === key)?.exercises[index];
  if (!exercise) {
    data.plan[key][index][1] = count;
    return rememberProgram(data);
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
  return rememberProgram(data);
}
