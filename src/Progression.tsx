import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Data, Exercise, Workout } from './data';
import { recordIdentity } from './records';
import { templateLabel } from './workouts';
import { setNumber } from './performance';
import { normalizedWeight, weightValue } from './weight';
import {
  applyProgressionTarget,
  confirmProgressionEffort,
  effortConfirmed,
  hasEffortTarget,
  defaultIncrement,
  progressionConflicts,
  progressionLabels,
  progressionSuggestion,
  progressionTimeline,
} from './progression';
type Change = (fn: (d: Data) => Data) => void;
const Context = createContext<{ data: Data; change: Change } | null>(null);
export function ProgressionProvider({
  data,
  change,
  children,
}: {
  data: Data;
  change: Change;
  children: ReactNode;
}) {
  return <Context.Provider value={{ data, change }}>{children}</Context.Provider>;
}
function sessionName(w: Workout, data: Data) {
  return (
    w.displayName ||
    data.programs?.find((p) => p.id === w.programId)?.program?.workouts.find((t) => t.id === w.name)
      ?.name ||
    data.trainingProgram?.workouts.find((t) => t.id === w.name)?.name ||
    (/^program-.*:week-/.test(w.name) ? 'Saved workout' : templateLabel(w.name))
  );
}
function saveIncrement(change: Change, id: string, value: string | null) {
  change((d) => {
    const prefs = d.progressionPreferences || { enabled: false, increments: {} };
    const increments = { ...prefs.increments };
    if (value === null) delete increments[id];
    else increments[id] = value;
    return { ...d, progressionPreferences: { ...prefs, increments } };
  });
}
export function IncrementEditor({
  id,
  name,
  value,
  change,
  hint,
}: {
  id: string;
  name: string;
  value?: string;
  change: Change;
  hint?: string | null;
}) {
  const [draft, setDraft] = useState(value || ''),
    [error, setError] = useState('');
  return (
    <div className="progression-increment">
      <label>
        Weight increment for {name} (kg)
        <input
          aria-label={`Weight increment for ${name}`}
          inputMode="decimal"
          type="text"
          value={draft}
          placeholder={hint || 'Choose supported increment'}
          onChange={(e) => {
            setDraft(e.target.value);
            setError('');
          }}
        />
      </label>
      <div className="progression-actions">
        <button
          onClick={() => {
            const normalized = normalizedWeight(draft);
            if (normalized === null || !(weightValue(normalized)! > 0)) {
              setError('Use a positive increment with up to three decimal places.');
              return;
            }
            saveIncrement(change, id, normalized);
            setDraft(normalized);
            setError('Saved increment.');
          }}
        >
          Save increment
        </button>
        {value && (
          <button
            onClick={() => {
              saveIncrement(change, id, null);
              setDraft('');
              setError('Override removed.');
            }}
          >
            Use default
          </button>
        )}
      </div>
      {error && <p role="status">{error}</p>}
      <small>
        {value
          ? `Saved: ${value} kg.`
          : hint
            ? `Starting proposal: ${hint} kg.`
            : 'No equipment increment assumed.'}{' '}
        Confirm what your equipment supports.
      </small>
    </div>
  );
}
export function ProgressionSettings({ data, change }: { data: Data; change: Change }) {
  const items = new Map<string, Exercise>();
  for (const w of [...data.history, ...(data.active ? [data.active] : [])])
    for (const e of w.exercises) items.set(recordIdentity(e), e);
  for (const plan of [data.plan, ...(data.programs || []).map((p) => p.templates)])
    for (const rows of Object.values(plan))
      for (const [name, , , meta] of rows) {
        const e: Exercise = { id: '', name, exerciseKey: meta?.exerciseId, rest: null, sets: [] };
        if (!items.has(recordIdentity(e))) items.set(recordIdentity(e), e);
      }
  for (const id of Object.keys(data.progressionPreferences?.increments || {}))
    if (!items.has(id))
      items.set(id, { id: '', name: 'Saved exercise', exerciseKey: id, rest: null, sets: [] });
  return (
    <section className="card progression-settings">
      <h2>Smart Progressive Overload</h2>
      <label>
        Smart Progressive Overload
        <select
          aria-label="Smart Progressive Overload"
          value={data.progressionPreferences?.enabled ? 'on' : 'off'}
          onChange={(e) => {
            const enabled = e.target.value === 'on';
            change((d) => ({
              ...d,
              progressionPreferences: {
                enabled,
                increments: d.progressionPreferences?.increments || {},
              },
            }));
          }}
        >
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </label>
      <p className="muted">
        Optional proposals from comparable saved sessions. Targets never change a plan or count as
        completed sets. Default: Off.
      </p>
      <details>
        <summary>Exercise-specific weight increments</summary>
        {[...items]
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(([id, e]) => (
            <IncrementEditor
              key={`${id}:${data.progressionPreferences?.increments[id] || ''}`}
              id={id}
              name={e.name}
              value={data.progressionPreferences?.increments[id]}
              change={change}
              hint={defaultIncrement(e)}
            />
          ))}
      </details>
    </section>
  );
}
export function ExerciseProgression({
  workout: w,
  exercise: e,
}: {
  workout: Workout;
  exercise: Exercise;
}) {
  const context = useContext(Context);
  const suggestion = useMemo(
    () =>
      context?.data.progressionPreferences?.enabled
        ? progressionSuggestion(w, e, context.data.history, context.data.progressionPreferences)
        : null,
    [w, e, context?.data.history, context?.data.progressionPreferences],
  );
  const [message, setMessage] = useState('');
  if (!context || !suggestion) return null;
  const { data, change } = context,
    id = recordIdentity(e),
    previous = suggestion.previous;
  const applicable =
    !e.skipped &&
    suggestion.targets.some((t) =>
      e.sets.some(
        (s) =>
          s.id === t.setId &&
          !s.done &&
          !s.skipped &&
          !s.needsLogging &&
          w.controller?.running?.setId !== s.id,
      ),
    );
  return (
    <details className="exercise-progression">
      <summary>Progression</summary>
      <p className="muted">Optional suggestion · not a completed set</p>
      {previous ? (
        <div>
          <strong>Previous comparable performance</strong>
          <p>
            {new Date(previous.workout.finished!).toLocaleDateString()} ·{' '}
            {sessionName(previous.workout, data)}
          </p>
          <ul>
            {previous.exercise.sets.map((s, i) => (
              <li key={i}>
                Set {setNumber(s, i) ?? '?'}: {normalizedWeight(s.weight)} kg × {s.reps}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Not enough history</p>
      )}
      <strong>{progressionLabels[suggestion.action]}</strong>
      <p>{suggestion.reason}</p>
      {suggestion.targets.length > 0 && (
        <ul aria-label={`Suggested targets for ${e.name}`}>
          {suggestion.targets.map((t) => (
            <li key={t.setId}>
              Set {t.number}: {t.weight} kg × {t.reps} reps
            </li>
          ))}
        </ul>
      )}
      {applicable && (
        <button
          aria-label={`Use target for ${e.name}`}
          onClick={() => {
            setMessage('');
            const conflicts = progressionConflicts(w, e, suggestion);
            if (
              conflicts &&
              !confirm(
                `Replace entered weight/reps in ${conflicts} unfinished set(s) of ${e.name}? Completed, skipped and running sets stay unchanged.`,
              )
            )
              return;
            change((d) => {
              if (!d.active || d.active.id !== w.id || !d.progressionPreferences?.enabled) return d;
              const current = d.active.exercises.find((x) => x.id === e.id);
              if (!current) return d;
              const fresh = progressionSuggestion(
                d.active,
                current,
                d.history,
                d.progressionPreferences,
              );
              if (
                JSON.stringify(fresh.targets) !== JSON.stringify(suggestion.targets) ||
                JSON.stringify(current.sets) !== JSON.stringify(e.sets)
              )
                throw Error(
                  'Workout or history changed. Review the refreshed suggestion before applying.',
                );
              setMessage(
                'Target copied to eligible unfinished fields only. Log actual performance separately.',
              );
              return { ...d, active: applyProgressionTarget(d.active, e.id, fresh, conflicts > 0) };
            });
          }}
        >
          Use target
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {hasEffortTarget(e) && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            aria-label={`Confirm prescribed effort for ${e.name}`}
            checked={effortConfirmed(e)}
            disabled={
              e.skipped ||
              !e.sets.length ||
              e.sets.some((s) => !s.done || s.skipped || s.needsLogging)
            }
            onChange={(event) => {
              const checked = event.target.checked;
              change((d) =>
                d.active?.id === w.id
                  ? { ...d, active: confirmProgressionEffort(d.active, e.id, checked) }
                  : d,
              );
            }}
          />
          I kept the prescribed effort in this session (optional; confirm after logging all sets).
        </label>
      )}
      <IncrementEditor
        key={data.progressionPreferences?.increments[id] || 'default'}
        id={id}
        name={e.name}
        value={data.progressionPreferences?.increments[id]}
        hint={defaultIncrement(e)}
        change={change}
      />
    </details>
  );
}
export function ProgressionTimeline({
  data,
  id,
  workoutIds,
  change,
}: {
  data: Data;
  id: string;
  workoutIds: string[];
  change: Change;
}) {
  const rows = useMemo(() => progressionTimeline(data.history, id), [data.history, id]).filter(
    (r) => workoutIds.includes(r.workoutId),
  );
  if (!data.progressionPreferences?.enabled) return null;
  const exercise = data.history.flatMap((w) => w.exercises).find((e) => recordIdentity(e) === id);
  return (
    <section className="card progression-timeline" aria-label="Progression timeline">
      <h2>Progression timeline</h2>
      <p className="muted">
        Actual saved sessions, compared within the same program, intensity and prescription. No
        missing sessions filled.
      </p>
      <ol>
        {rows.map((r) => (
          <li key={r.workoutId}>
            <time>{new Date(r.at).toLocaleDateString()}</time>
            <strong>{r.label}</strong>
            <small>
              {sessionName(
                data.history.find((w) => w.id === r.workoutId)!,
                data,
              )}{' '}
              ·{' '}
              {r.intensity === 'unknown'
                ? 'Intensity not saved'
                : r.intensity === 'mid'
                  ? 'Mid'
                  : r.intensity === 'easy'
                    ? 'Easy'
                    : 'Hard'}
              {r.pr ? ' · New PR' : ''}
            </small>
          </li>
        ))}
      </ol>
      {exercise && (
        <IncrementEditor
          key={data.progressionPreferences?.increments[id] || 'default'}
          id={id}
          name={exercise.name}
          value={data.progressionPreferences?.increments[id]}
          hint={defaultIncrement(exercise)}
          change={change}
        />
      )}
    </section>
  );
}
