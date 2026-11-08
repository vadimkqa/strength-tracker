import { useState } from 'react';
import {
  issue,
  programIssues,
  programProblems,
  type TrainingProgram,
  type ProgramExercise,
  type TargetSet,
} from './model';
import { exerciseIdentity } from '../performance';
interface Props {
  program: TrainingProgram;
  change: (p: TrainingProgram) => void;
  onApply: (p: TrainingProgram) => Promise<void>;
  cancel: () => void;
  stale: boolean;
}
export function ProgramReview({ program: p, change, onApply, cancel, stale }: Props) {
  const [selected, setSelected] = useState(p.workouts[0]?.id || ''),
    [week, setWeek] = useState(p.workouts[0]?.week || 1),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const weeks = [...new Set(p.workouts.map((w) => w.week))].sort((a, b) => a - b),
    w = p.workouts.find((w) => w.id === selected),
    problems = programProblems(p);
  function edit(fn: (copy: TrainingProgram) => void) {
    const copy = structuredClone(p);
    fn(copy);
    change(copy);
    setConfirmed(false);
    setSaved(false);
  }
  function exercise(id: string, fn: (e: ProgramExercise) => void) {
    edit((copy) =>
      fn(
        copy.workouts
          .flatMap((w) => w.exercises)
          .find(
            (e) =>
              e.id === id && copy.workouts.find((w) => w.id === selected)?.exercises.includes(e),
          )!,
      ),
    );
  }
  function set(id: string, i: number, patch: Partial<TargetSet>) {
    exercise(id, (e) => Object.assign(e.sets[i] || e.defaultTarget!, patch));
  }
  function acknowledge(id: string, checked: boolean) {
    edit((copy) => {
      programIssues(copy)
        .filter((i) => i.id === id)
        .forEach((i) => (i.reviewed = checked));
    });
  }
  return (
    <div aria-label="Editable program preview" className="program-review">
      <h3>Review training program</h3>
      <label>
        PROGRAM NAME
        <input value={p.name} onChange={(e) => edit((p) => (p.name = e.target.value))} />
      </label>
      <p className="import-stats" role="status">
        {weeks.length} weeks · {p.workouts.length} sessions ·{' '}
        {p.workouts.reduce((n, w) => n + w.exercises.length, 0)} exercises ·{' '}
        {programIssues(p).filter((i) => !i.reviewed).length} unresolved warnings
      </p>
      {p.issues.length > 0 && (
        <details open>
          <summary>Unsupported sections and document warnings ({p.issues.length})</summary>
          {p.issues.map((i) => (
            <div key={i.id}>
              <p className="import-warning">{i.message}</p>
              {i.source && (
                <small>
                  Line {i.source.line}
                  {i.source.page && ` · Page ${i.source.page}`}
                  {i.source.sheet && ` · Sheet ${i.source.sheet}`}: {i.source.text}
                </small>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={i.reviewed}
                  onChange={(e) => acknowledge(i.id, e.target.checked)}
                />
                I reviewed this section; keep unsupported content as source notes only
              </label>
            </div>
          ))}
        </details>
      )}
      <div className="import-grid review-selectors">
        <label>
          WEEK
          <select
            value={week}
            onChange={(e) => {
              const week = Number(e.target.value);
              setWeek(week);
              setSelected(p.workouts.find((w) => w.week === week)?.id || '');
            }}
          >
            {weeks.map((week) => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </select>
        </label>
        <label>
          WORKOUT
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {p.workouts
              .filter((w) => w.week === week)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <button
        onClick={() => {
          const id = crypto.randomUUID();
          edit((p) =>
            p.workouts.push({
              id,
              slotId: id,
              name: '',
              week,
              day: null,
              order: p.workouts.length,
              intensity: null,
              groups: [],
              source: [],
              exercises: [],
            }),
          );
          setSelected(id);
        }}
      >
        Add workout
      </button>
      {w && (
        <>
          <details>
            <summary>Edit workout / schedule</summary>
            <label>
              WORKOUT NAME
              <input
                value={w.name}
                onChange={(e) =>
                  edit((p) => (p.workouts.find((x) => x.id === w.id)!.name = e.target.value))
                }
              />
            </label>
            <div className="import-grid">
              <label>
                WEEK NUMBER
                <input
                  type="number"
                  min="1"
                  value={w.week}
                  onChange={(e) => {
                    const week = Number(e.target.value);
                    edit((p) => {
                      p.workouts.find((x) => x.id === w.id)!.week = week;
                      const weeks = [...new Set(p.workouts.map((w) => w.week))].sort(
                        (a, b) => a - b,
                      );
                      p.rotation = weeks.length > 1 ? { weeks, repeat: true } : null;
                    });
                    setWeek(week);
                  }}
                />
              </label>
              <label>
                WEEKDAY (OPTIONAL)
                <input
                  value={w.day || ''}
                  onChange={(e) =>
                    edit(
                      (p) => (p.workouts.find((x) => x.id === w.id)!.day = e.target.value || null),
                    )
                  }
                />
              </label>
            </div>
            <label>
              SESSION INTENSITY (OPTIONAL)
              <input
                value={w.intensity || ''}
                onChange={(e) =>
                  edit(
                    (p) =>
                      (p.workouts.find((x) => x.id === w.id)!.intensity = e.target.value || null),
                  )
                }
              />
            </label>
          </details>
          <button
            onClick={() => {
              const remaining = p.workouts.filter((x) => x.id !== w.id);
              edit((p) => {
                p.workouts = p.workouts.filter((x) => x.id !== w.id);
                const weeks = [...new Set(p.workouts.map((w) => w.week))].sort((a, b) => a - b);
                p.rotation = weeks.length > 1 ? { weeks, repeat: true } : null;
              });
              setSelected(remaining[0]?.id || '');
              setWeek(remaining[0]?.week || 1);
            }}
          >
            Remove workout from preview
          </button>
          {w.exercises.map((e, index) => (
            <details className="review-exercise" key={`${index}-${e.id}`}>
              <summary>
                <div className="review-exercise-title">
                  <strong>
                    {index + 1}. {e.name || 'Unnamed exercise'}
                  </strong>
                  <span>
                    {e.intensity || 'Intensity unspecified'}
                    {e.optional ? ' · Optional' : ''}
                    {e.groupId
                      ? ` · ${w.groups.find((g) => g.id === e.groupId)?.name || 'Group'}`
                      : ''}
                  </span>
                  <span className="compact-prescription">
                    {e.setCount ?? '?'} sets ·{' '}
                    {e.sets
                      .map(
                        (s) =>
                          `${s.number ?? '?'}: ${s.minReps ?? s.repsText ?? '?'}${s.maxReps !== null && s.maxReps !== s.minReps ? `–${s.maxReps}` : ''} ${s.effort || ''}`,
                      )
                      .join(' · ')}
                  </span>
                  {e.issues.some((i) => !i.reviewed) && (
                    <span className="compact-warning">Review missing or ambiguous information</span>
                  )}
                </div>
              </summary>
              {e.issues.map((i) => (
                <label key={i.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={i.reviewed}
                    onChange={(x) => acknowledge(i.id, x.target.checked)}
                  />
                  {i.message}
                </label>
              ))}
              <details className="exercise-editor">
                <summary>Edit exercise details</summary>
                <label>
                  EXERCISE NAME
                  <input
                    value={e.name}
                    onChange={(x) =>
                      exercise(e.id, (e) => {
                        e.identity = exerciseIdentity(x.target.value);
                        e.name = x.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  WORKOUT ASSIGNMENT
                  <select
                    value={w.id}
                    onChange={(x) =>
                      edit((p) => {
                        const origin = p.workouts.find((a) => a.id === w.id)!,
                          target = p.workouts.find((a) => a.id === x.target.value)!;
                        const [moved] = origin.exercises.splice(index, 1);
                        target.exercises.push(moved);
                      })
                    }
                  >
                    {p.workouts.map((w) => (
                      <option key={w.id} value={w.id}>
                        Week {w.week} · {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="import-grid">
                  <label>
                    EXERCISE INTENSITY
                    <input
                      value={e.intensity || ''}
                      onChange={(x) =>
                        exercise(e.id, (e) => (e.intensity = x.target.value || null))
                      }
                    />
                  </label>
                  <label>
                    SET COUNT
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={e.setCount ?? ''}
                      onChange={(x) =>
                        exercise(e.id, (e) => {
                          const count = x.target.value ? Number(x.target.value) : null;
                          e.setCount = count;
                          const ref = e.source[0] || { line: 0, text: 'Manually entered' };
                          e.sets = Array.from(
                            { length: Math.min(100, Math.max(0, count || 0)) },
                            (_, i) =>
                              e.sets[i] ||
                              (e.defaultTarget
                                ? { ...e.defaultTarget, number: i + 1 }
                                : {
                                    number: i + 1,
                                    minReps: null,
                                    maxReps: null,
                                    repsText: null,
                                    weight: null,
                                    rpe: null,
                                    rir: null,
                                    effort: null,
                                    restSeconds: null,
                                    source: ref,
                                  }),
                          );
                        })
                      }
                    />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={e.optional}
                    onChange={(x) => exercise(e.id, (e) => (e.optional = x.target.checked))}
                  />
                  Optional exercise
                </label>
                <label>
                  ALTERNATIVES (ONE PER LINE)
                  <textarea
                    value={e.alternatives.join('\n')}
                    onChange={(x) =>
                      exercise(
                        e.id,
                        (e) => (e.alternatives = x.target.value.split('\n').filter(Boolean)),
                      )
                    }
                  />
                </label>
                <label>
                  SUPERSET / CIRCUIT
                  <select
                    value={e.groupId || ''}
                    onChange={(x) => exercise(e.id, (e) => (e.groupId = x.target.value || null))}
                  >
                    <option value="">Ungrouped</option>
                    {w.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                {(e.sets.length ? e.sets : e.defaultTarget ? [e.defaultTarget] : []).map((s, i) => (
                  <fieldset key={i}>
                    <legend>
                      {e.setCount === null
                        ? 'Target (set count unspecified)'
                        : `Set ${s.number ?? '?'}`}
                    </legend>
                    <div className="import-grid">
                      {(['number', 'minReps', 'maxReps', 'rpe', 'rir', 'restSeconds'] as const).map(
                        (key) => (
                          <label key={key}>
                            {
                              {
                                number: 'Set number',
                                minReps: 'Min reps',
                                maxReps: 'Max reps',
                                rpe: 'RPE',
                                rir: 'RIR',
                                restSeconds: 'Rest seconds',
                              }[key]
                            }
                            <input
                              type="number"
                              aria-label={`Set ${i + 1} ${key}`}
                              value={s[key] ?? ''}
                              onChange={(x) =>
                                set(e.id, i, {
                                  [key]: x.target.value ? Number(x.target.value) : null,
                                })
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <div className="import-grid">
                      <label>
                        Target weight
                        <input
                          type="number"
                          value={s.weight?.value ?? ''}
                          onChange={(x) =>
                            set(e.id, i, {
                              weight: x.target.value
                                ? { value: Number(x.target.value), unit: s.weight?.unit || '' }
                                : null,
                            })
                          }
                        />
                      </label>
                      <label>
                        Weight unit
                        <input
                          value={s.weight?.unit || ''}
                          onChange={(x) =>
                            set(e.id, i, {
                              weight: s.weight ? { ...s.weight, unit: x.target.value } : null,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Reps text (e.g. AMRAP)
                      <input
                        value={s.repsText || ''}
                        onChange={(x) => set(e.id, i, { repsText: x.target.value || null })}
                      />
                    </label>
                    <label>
                      Effort
                      <input
                        value={s.effort || ''}
                        onChange={(x) => set(e.id, i, { effort: x.target.value || null })}
                      />
                    </label>
                  </fieldset>
                ))}
                <label>
                  NOTES
                  <textarea
                    value={e.notes}
                    onChange={(x) => exercise(e.id, (e) => (e.notes = x.target.value))}
                  />
                </label>
                <div className="row">
                  <button
                    disabled={index === 0}
                    onClick={() =>
                      edit((p) => {
                        const rows = p.workouts.find((x) => x.id === w.id)!.exercises;
                        [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
                        rows.forEach((e, i) => (e.order = i));
                      })
                    }
                  >
                    Move up
                  </button>
                  <button
                    onClick={() =>
                      edit((p) => p.workouts.find((x) => x.id === w.id)!.exercises.splice(index, 1))
                    }
                  >
                    Remove exercise
                  </button>
                </div>
              </details>
              <details>
                <summary>Original source</summary>
                {e.source.map((s, i) => (
                  <p key={i} className="muted">
                    Line {s.line}
                    {s.page && ` · Page ${s.page}`}
                    {s.sheet && ` · ${s.sheet}, row ${s.row}`}: {s.text}
                  </p>
                ))}
              </details>
            </details>
          ))}
          <button
            onClick={() =>
              edit((p) => {
                p.workouts
                  .find((x) => x.id === w.id)!
                  .exercises.push({
                    id: crypto.randomUUID(),
                    identity: '',
                    name: '',
                    order: w.exercises.length,
                    intensity: null,
                    setCount: null,
                    sets: [],
                    optional: false,
                    alternatives: [],
                    groupId: null,
                    notes: '',
                    source: [],
                    issues: [
                      issue('Review unspecified set count and targets for this manual exercise.'),
                    ],
                  });
              })
            }
          >
            Add exercise
          </button>
        </>
      )}
      {problems.length > 0 && (
        <ul className="import-warning">
          {problems.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      {stale && <p className="import-warning">Source changed. Reparse before applying.</p>}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!!problems.length || stale || busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm saving this independent program and making it active; preserve existing programs,
        history and unspecified values
      </label>
      <button
        className="primary full"
        disabled={!confirmed || !!problems.length || stale || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await onApply(p);
            setSaved(true);
            setConfirmed(false);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Apply imported program
      </button>
      {saved && (
        <p role="status" className="import-success">
          Plan applied. Saved as an independent program. Previous programs, history, PRs and active
          sessions were preserved.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="full" disabled={busy} onClick={cancel}>
        Cancel preview
      </button>
    </div>
  );
}
