import type { Plan } from '../templates';
import type { TrainingProgram } from './model';
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
