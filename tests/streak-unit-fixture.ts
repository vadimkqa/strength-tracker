import { emptyData, createWorkout, type Data, type Workout } from '../src/data';
import { applyProgram } from '../src/importing/saving';
import { parseProgram } from '../src/importing/parser';
import { textDocument } from '../src/importing/extraction';
import { programIssues } from '../src/importing/model';
import { addDays } from '../src/calendar';
const at = (date: string) => Date.parse(date + 'T12:00:00Z');
export function streakFixture(count = 3, second?: number, scheduled = true): Data {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const text =
    `Program: Strength ${count}\n` +
    [count, ...(second ? [second] : [])]
      .map(
        (n, index) =>
          `${second ? `Week ${index + 1}\n` : ''}` +
          Array.from(
            { length: n },
            (_, i) =>
              `${scheduled ? days[i] + ': ' : ''}Workout ${String.fromCharCode(65 + i)}:\n- Exercise ${i + 1} 2x8 rest 90s`,
          ).join('\n'),
      )
      .join('\n');
  const p = parseProgram(textDocument(text));
  programIssues(p).forEach((i) => (i.reviewed = true));
  return applyProgram(emptyData(), p, true);
}
export function completed(d: Data, template: string, date: string): Workout {
  const w = createWorkout(template, 'heavy', d.plan, at(date) - 600000, [], {
    displayName: 'Saved workout',
    cycleWeek: d.trainingProgram!.workouts.find((t) => t.id === template)!.week,
  });
  w.programId = d.activeProgramId;
  w.finished = at(date);
  w.exercises.forEach((e) =>
    e.sets.forEach((s) => Object.assign(s, { weight: '50', reps: '8', done: true })),
  );
  return w;
}
export function fillWeek(d: Data, date: string, cycle = 1) {
  d.trainingProgram!.workouts.filter((w) => w.week === cycle).forEach((w, i) =>
    d.history.push(completed(d, w.id, addDays(date, i))),
  );
}
