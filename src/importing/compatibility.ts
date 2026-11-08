import type { PlanDraft } from '../plan-import';
import type { Plan } from '../templates';
import { workouts, type RotationSession } from '../workouts';
import { exerciseIdentity } from '../performance';
import { issue, stableId, type TrainingProgram } from './model';
/** Adapter for the established TXT parser. Stable template keys keep previous-performance matches. */
export function legacyProgram(
  draft: PlanDraft,
  plan: Plan,
  sessions: RotationSession[],
): TrainingProgram {
  return {
    schemaVersion: 1,
    id: `program-${stableId(draft.source)}`,
    name: 'Imported training plan',
    source: {
      name: 'Training plan',
      format: draft.rotation ? 'txt' : 'legacy-txt',
      text: draft.source,
    },
    rotation: draft.rotation
      ? { weeks: [...new Set(sessions.map((s) => s.week))], repeat: true }
      : null,
    issues: draft.notices.map((n) => ({ ...issue(n), reviewed: true })),
    workouts: sessions.map((s, order) => ({
      id: s.key,
      legacyKey: s.key,
      slotId: s.workout,
      name: workouts.find((w) => w.key === s.workout)!.name,
      week: s.week,
      day: s.day || null,
      order,
      intensity: s.intensity,
      groups: [],
      source: [],
      exercises: (plan[s.key] || []).map(([name, count, rest, meta], index) => {
        const original = draft.rows.filter(
          (r) =>
            !r.excluded &&
            r.workout === s.workout &&
            r.week === s.week &&
            r.intensity === s.intensity,
        )[index];
        const ref = { line: original?.line || 0, text: meta?.source || name };
        return {
          id: `entry-${stableId(s.key + index + name)}`,
          identity: exerciseIdentity(name),
          name,
          order: index,
          intensity: meta?.exerciseIntensity || null,
          setCount: count,
          sets: Array.from({ length: count || 0 }, (_, i) => {
            const set = meta?.setPrescriptions?.[i];
            const reps = /^(\d+)(?:[–-](\d+))?$/.exec(meta?.reps || '');
            return {
              number: set?.number ?? (set ? null : i + 1),
              minReps: set?.minReps ?? (reps ? Number(reps[1]) : null),
              maxReps: set?.maxReps ?? (reps ? Number(reps[2] || reps[1]) : null),
              repsText: meta?.reps || null,
              weight: null,
              rpe: null,
              rir: null,
              effort: set?.effort || null,
              restSeconds: rest,
              source: ref,
            };
          }),
          optional: meta?.optional || false,
          alternatives: meta?.alternatives || [],
          groupId: null,
          notes: meta?.notes || '',
          source: [ref],
          issues: (original?.warnings || []).map((m) => ({
            ...issue(m, ref),
            reviewed: original?.reviewed || false,
          })),
        };
      }),
    })),
  };
}
