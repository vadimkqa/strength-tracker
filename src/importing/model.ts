/** Version 1 stores prescriptions only. Completed performance belongs to workout history. */
export interface SourceRef {
  line: number;
  text: string;
  page?: number;
  sheet?: string;
  row?: number;
}
export interface ImportIssue {
  id: string;
  message: string;
  source?: SourceRef;
  reviewed: boolean;
}
export interface TargetSet {
  number: number | null;
  minReps: number | null;
  maxReps: number | null;
  repsText: string | null;
  weight: { value: number; unit: string } | null;
  rpe: number | null;
  rir: number | null;
  effort: string | null;
  restSeconds: number | null;
  source: SourceRef;
}
export interface ProgramExercise {
  id: string;
  identity: string;
  name: string;
  order: number;
  intensity: string | null;
  setCount: number | null;
  defaultTarget?: TargetSet;
  sets: TargetSet[];
  optional: boolean;
  alternatives: string[];
  groupId: string | null;
  notes: string;
  source: SourceRef[];
  issues: ImportIssue[];
}
export interface ProgramWorkout {
  id: string;
  legacyKey?: string;
  slotId: string;
  name: string;
  week: number;
  day: string | null;
  order: number;
  intensity: string | null;
  exercises: ProgramExercise[];
  groups: { id: string; name: string; type: 'superset' | 'circuit'; rounds: number | null }[];
  source: SourceRef[];
}
export interface TrainingProgram {
  schemaVersion: 1;
  id: string;
  name: string;
  source: { name: string; format: string; text: string };
  workouts: ProgramWorkout[];
  rotation: { weeks: number[]; repeat: boolean } | null;
  issues: ImportIssue[];
}
export const stableId = (text: string) => {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
};
export function issue(message: string, source?: SourceRef): ImportIssue {
  return {
    id: `issue-${stableId(message + JSON.stringify(source))}`,
    message,
    source,
    reviewed: false,
  };
}
export function programIssues(program: TrainingProgram) {
  return [
    ...program.issues,
    ...program.workouts.flatMap((w) => w.exercises.flatMap((e) => e.issues)),
  ];
}
export function programProblems(program: TrainingProgram): string[] {
  const errors: string[] = [];
  if (!program.name.trim()) errors.push('Program name is required.');
  if (!program.workouts.length)
    errors.push('No supported workout templates were found. Add a workout or revise the source.');
  const ids = new Set<string>();
  for (const w of program.workouts) {
    if (!w.name.trim()) errors.push('Every workout needs a name.');
    if (ids.has(w.id)) errors.push('Workout identifiers must be unique.');
    ids.add(w.id);
    if (!Number.isInteger(w.week) || w.week < 1) errors.push('Week must be a positive integer.');
    if (!w.exercises.length) errors.push(`${w.name}: include at least one exercise.`);
    for (const e of w.exercises) {
      if (!e.name.trim()) errors.push(`${w.name}: exercise name is required.`);
      if (
        e.setCount !== null &&
        (!Number.isInteger(e.setCount) || e.setCount < 1 || e.setCount > 100)
      )
        errors.push(`${e.name}: sets must be unspecified or 1–100.`);
      if (e.setCount !== null && e.sets.length !== e.setCount)
        errors.push(`${e.name}: set count does not match prescriptions.`);
      for (const s of [
        ...e.sets,
        ...(e.defaultTarget && !e.sets.length ? [e.defaultTarget] : []),
      ]) {
        if (s.number !== null && (!Number.isInteger(s.number) || s.number < 1))
          errors.push(`${e.name}: set numbers must be positive integers or unspecified.`);
        if (s.weight && !s.weight.unit.trim())
          errors.push(`${e.name}: a specified target weight needs a unit.`);
        for (const value of [s.minReps, s.maxReps, s.rpe, s.rir, s.restSeconds, s.weight?.value])
          if (value != null && (!Number.isFinite(value) || value < 0))
            errors.push(`${e.name}: targets must be nonnegative numbers or unspecified.`);
        if (s.minReps !== null && s.maxReps !== null && s.minReps > s.maxReps)
          errors.push(`${e.name}: minimum reps exceed maximum reps.`);
        if (s.rpe !== null && s.rpe > 10) errors.push(`${e.name}: RPE exceeds 10.`);
      }
    }
  }
  const unresolved = programIssues(program).filter((i) => !i.reviewed);
  if (unresolved.length)
    errors.push(`Review ${unresolved.length} unresolved source or missing-information warnings.`);
  return [...new Set(errors)];
}
/** Structural validation for backups; does not require warnings to be resolved again. */
export function assertProgram(value: unknown): asserts value is TrainingProgram {
  const p = value as TrainingProgram;
  const ref = (r: SourceRef) => r && Number.isFinite(r.line) && typeof r.text === 'string';
  const issues = (items: ImportIssue[]) =>
    Array.isArray(items) &&
    items.every(
      (i) =>
        i &&
        typeof i.id === 'string' &&
        typeof i.message === 'string' &&
        typeof i.reviewed === 'boolean',
    );
  const nullableNumber = (n: unknown) =>
    n === null || (typeof n === 'number' && Number.isFinite(n));
  const target = (s: TargetSet) =>
    s &&
    ref(s.source) &&
    [s.number, s.minReps, s.maxReps, s.rpe, s.rir, s.restSeconds].every(nullableNumber) &&
    (s.weight === null ||
      (s.weight &&
        typeof s.weight.value === 'number' &&
        Number.isFinite(s.weight.value) &&
        typeof s.weight.unit === 'string'));
  const exercise = (e: ProgramExercise) =>
    e &&
    typeof e.id === 'string' &&
    typeof e.identity === 'string' &&
    typeof e.name === 'string' &&
    (e.setCount === null ||
      (Number.isInteger(e.setCount) && e.setCount > 0 && e.setCount <= 100)) &&
    Array.isArray(e.alternatives) &&
    e.alternatives.every((a) => typeof a === 'string') &&
    Array.isArray(e.source) &&
    e.source.every(ref) &&
    issues(e.issues) &&
    Array.isArray(e.sets) &&
    e.sets.every(target) &&
    (e.defaultTarget === undefined || target(e.defaultTarget));
  const workout = (w: ProgramWorkout) =>
    w &&
    typeof w.id === 'string' &&
    typeof w.slotId === 'string' &&
    typeof w.name === 'string' &&
    Number.isInteger(w.week) &&
    w.week > 0 &&
    (w.day === null || typeof w.day === 'string') &&
    (w.intensity === null || typeof w.intensity === 'string') &&
    Array.isArray(w.source) &&
    w.source.every(ref) &&
    Array.isArray(w.groups) &&
    w.groups.every(
      (g) =>
        g &&
        typeof g.id === 'string' &&
        typeof g.name === 'string' &&
        ['superset', 'circuit'].includes(g.type),
    ) &&
    Array.isArray(w.exercises) &&
    w.exercises.every(exercise);
  if (
    !p ||
    p.schemaVersion !== 1 ||
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    !p.source ||
    typeof p.source.text !== 'string' ||
    typeof p.source.format !== 'string' ||
    !Array.isArray(p.workouts) ||
    !p.workouts.length ||
    !p.workouts.every(workout) ||
    !issues(p.issues) ||
    (p.rotation !== null &&
      (!p.rotation ||
        !Array.isArray(p.rotation.weeks) ||
        !p.rotation.weeks.length ||
        !p.rotation.weeks.every((n) => Number.isInteger(n) && n > 0) ||
        typeof p.rotation.repeat !== 'boolean'))
  )
    throw Error('Unsupported or invalid training-program backup. Saved data has not been changed.');
}
