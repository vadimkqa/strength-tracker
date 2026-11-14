import { removeLiveSet } from './live-sets';
import { useState } from 'react';
import type { Exercise, Workout } from './data';
import { cardExpanded, exerciseComplete, toggleExerciseCard } from './exercise-cards';
import { positions, selectSet, skipSet, reconcile, validLog } from './controller';
import { exerciseIdentity, addPerformanceSet, setNumber } from './performance';
import { repsLabel } from './prescriptions';
import type { ExerciseSortControls } from './SortableWorkout';
interface Props {
  sort?: ExerciseSortControls;
  workout: Workout;
  exercise: Exercise;
  change: (fn: (w: Workout) => Workout) => void;
}
const photos: Record<string, string> = {
  [exerciseIdentity('Bench Press')]: 'bench',
  [exerciseIdentity('Pull-ups')]: 'pullups',
  [exerciseIdentity('Leg Press')]: 'legs',
};
export function ExerciseCard({ workout: w, exercise: e, change, sort }: Props) {
  const open = cardExpanded(w, e),
    complete = exerciseComplete(w, e),
    running = w.controller?.running?.exerciseId === e.id;
  const selected =
    (w.controller?.running?.exerciseId || w.controller?.selected?.exerciseId) === e.id;
  const skipped = e.skipped || e.sets.some((s) => s.skipped);
  const image =
    e.imageUrl ||
    (photos[exerciseIdentity(e.name)]
      ? `${import.meta.env.BASE_URL}photos/${photos[exerciseIdentity(e.name)]}.jpg`
      : undefined);
  const [brokenImage, setBrokenImage] = useState('');
  const bodyId = `exercise-body-${e.id}`;
  function modify(fn: (exercise: Exercise, w: Workout) => void) {
    change((w) => {
      const exercise = w.exercises.find((x) => x.id === e.id);
      if (!exercise) throw Error('Exercise no longer exists.');
      fn(exercise, w);
      return w;
    });
  }
  function set(
    id: string,
    fn: (set: Exercise['sets'][number], exercise: Exercise, w: Workout) => void,
  ) {
    modify((e, w) => {
      const s = e.sets.find((s) => s.id === id);
      if (!s) throw Error('Set no longer exists.');
      fn(s, e, w);
    });
  }
  const toggle = () => change((w) => toggleExerciseCard(w, e.id));
  function edit() {
    const name = prompt('Exercise name', e.name);
    if (name === null) return;
    const rest = prompt('Rest between sets (seconds)', e.rest === null ? '' : String(e.rest));
    modify((e) => {
      const next = name.trim() || e.name;
      if (exerciseIdentity(next) !== exerciseIdentity(e.name)) {
        e.exerciseKey = exerciseIdentity(next);
        delete e.previousPerformance;
      }
      e.name = next;
      if (rest !== null && rest.trim() !== '' && Number.isFinite(Number(rest)) && Number(rest) >= 0)
        e.rest = Math.min(3600, Math.round(Number(rest)));
    });
  }
  function logSet(id: string) {
    set(id, (s, e, w) => {
      if (w.controller?.running?.setId === s.id) throw Error('Use STOP SET to preserve timing.');
      if (!s.done && !validLog(s))
        throw Error(
          'Enter valid weight (use 0 for bodyweight) and positive whole-number reps first.',
        );
      s.done = !s.done;
      s.needsLogging = false;
      s.skipped = false;
      if (s.done && w.controller!.selected?.setId === s.id)
        w.controller!.selected = positions(w)[0] || null;
      if (!s.done) selectSet(w, { exerciseId: e.id, setId: s.id! });
    });
  }
  return (
    <section
      className={`card exercise exercise-card ${selected ? 'active-exercise' : ''} ${complete ? 'exercise-completed' : ''}`}
      data-exercise-id={e.id}
    >
      <div className="exercise-card-header">
        <h3 className="exercise-heading" aria-label={e.name}>
          <button
            {...sort?.attributes}
            {...sort?.listeners}
            ref={sort?.ref}
            className={`exercise-toggle ${sort ? 'sortable-exercise-title' : ''}`}
            title={sort ? 'Hold to reorder. Keyboard move controls are in Set options.' : undefined}
            onContextMenu={sort ? (event) => event.preventDefault() : undefined}
            aria-label={`${e.name} details`}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
          >
            {image && brokenImage !== image && (
              <img
                className="exercise-thumbnail"
                src={image}
                alt=""
                onError={() => setBrokenImage(image)}
                loading="lazy"
                draggable={false}
              />
            )}
            <span className="exercise-card-title">
              <span className="exercise-card-name">{e.name}</span>
              <span className="exercise-card-meta">
                {e.sets.length ? `${e.sets.length} Sets` : 'Sets unspecified'}
                {e.rest !== null ? ` · ${e.rest}s rest` : ''}
                {e.exerciseIntensity ? ` · ${e.exerciseIntensity}` : ''}
                {e.optional ? ' · Optional' : ''}
              </span>
            </span>
            {complete ? (
              <span className="exercise-completion" role="img" aria-label={`${e.name} completed`}>
                ✓
              </span>
            ) : skipped ? (
              <span
                className="exercise-skipped"
                role="img"
                aria-label={`${e.name} has skipped sets`}
              >
                ↷
              </span>
            ) : null}
          </button>
        </h3>
        <button className="exercise-edit" aria-label={`Edit ${e.name}`} onClick={edit}>
          Edit
        </button>
        <button
          className="exercise-chevron"
          aria-label={`${open ? 'Collapse' : 'Expand'} ${e.name}`}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={open ? 'chevron-open' : ''}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      <div
        id={bodyId}
        className={`exercise-collapse ${open ? 'expanded' : ''}`}
        inert={!open}
        aria-hidden={!open}
      >
        <div className="exercise-content">
          <div
            className="setrow performance-row set-head"
            aria-label={`${e.name} set logging columns`}
          >
            <span>SET</span>
            <span>REPS</span>
            <span>WEIGHT (KG)</span>
            <span>ACTION</span>
          </div>
          {e.sets.map((s, index) => {
            const active = running && w.controller!.running!.setId === s.id;
            const chosen = w.controller!.selected?.setId === s.id || active;
            const previousNumber = setNumber(s, index),
              previous =
                previousNumber === null ? undefined : e.previousPerformance?.sets[previousNumber];
            return (
              <div
                className={`setrow performance-row ${s.done ? 'done' : ''} ${s.skipped ? 'skipped' : ''} ${s.needsLogging ? 'needs-logging' : ''} ${chosen ? 'active-set' : ''}`}
                key={s.id}
                data-set-id={s.id}
              >
                <span className="set-number">
                  {s.prescription ? (s.prescription.number ?? '?') : index + 1}
                </span>
                {(['reps', 'weight'] as const).map((field) => (
                  <input
                    className="set-input"
                    key={field}
                    aria-label={`${field === 'weight' ? 'Weight' : 'Reps'} ${e.name} set ${index + 1}`}
                    type="number"
                    inputMode={field === 'weight' ? 'decimal' : 'numeric'}
                    min="0"
                    step={field === 'weight' ? '0.5' : '1'}
                    value={s[field]}
                    onChange={(event) =>
                      set(s.id!, (s) => {
                        s[field] = event.target.value;
                        if (s.done && !validLog(s)) {
                          s.done = false;
                          s.needsLogging = true;
                        }
                      })
                    }
                    onBlur={() => requestAnimationFrame(() => change((w) => w))}
                  />
                ))}
                <button
                  className={`check set-action ${active ? 'in-progress' : s.done ? 'done' : s.skipped ? 'set-skipped' : 'pending'}`}
                  aria-label={`${active ? 'In progress' : s.done ? 'Undo' : s.skipped ? 'Include' : 'Select'} ${e.name} set ${index + 1}`}
                  aria-busy={active || undefined}
                  aria-pressed={!active && !s.done && !s.skipped ? chosen : undefined}
                  onClick={() => {
                    if (active) {
                      change((w) => {
                        w.controller!.screen = 'timer';
                        return w;
                      });
                      return;
                    }
                    if (s.done) {
                      logSet(s.id!);
                      return;
                    }
                    set(s.id!, (s, e, w) => {
                      s.skipped = false;
                      selectSet(w, { exerciseId: e.id, setId: s.id! });
                    });
                  }}
                >
                  {active ? (
                    <span className="set-spinner" role="status" aria-label="Set in progress" />
                  ) : s.done ? (
                    '✓'
                  ) : s.skipped ? (
                    '↷'
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m8 5 11 7-11 7Z" />
                    </svg>
                  )}
                </button>
                <div className="set-details">
                  <span className="previous-set">
                    {previous
                      ? `Last: ${previous.weight} kg × ${previous.reps}`
                      : 'No previous performance'}
                  </span>
                  {s.skipped && <small className="set-skip-label">Skipped · not completed</small>}
                  {s.prescription && (
                    <small className="prescription-per-set">
                      Set {s.prescription.number ?? '?'}: {repsLabel(s.prescription)} reps
                      {s.prescription.effort ? ` · ${s.prescription.effort}` : ''}
                      {s.prescription.targetWeight &&
                        ` · ${s.prescription.targetWeight.value} ${s.prescription.targetWeight.unit}`}
                      {s.prescription.targetRpe != null && ` · RPE ${s.prescription.targetRpe}`}
                      {s.prescription.targetRir != null && ` · RIR ${s.prescription.targetRir}`}
                      {s.prescription.restSeconds != null &&
                        ` · Rest ${s.prescription.restSeconds}s`}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
          {!e.sets.length && (
            <p className="muted">
              Set count unspecified. Add sets only as you choose to perform them.
            </p>
          )}
          {e.targetReps && <p className="muted prescription">Target: {e.targetReps} reps</p>}
          {e.groupLabel && <p className="eyebrow">{e.groupLabel}</p>}
          {e.alternatives?.length ? (
            <p className="muted">Alternatives: {e.alternatives.join(' OR ')}</p>
          ) : null}
          <div className="exercise-card-footer">
            {e.notes && (
              <details className="prescription-notes">
                <summary>Plan notes</summary>
                <p>{e.notes}</p>
              </details>
            )}
            <details className="set-options">
              <summary aria-label={`Set options for ${e.name}`}>Set options</summary>
              <div className="exercise-tools">
                {sort && (
                  <>
                    <button
                      disabled={sort.index === 0}
                      aria-label={`Move ${e.name} up`}
                      onClick={() => sort.move(-1)}
                    >
                      Move up
                    </button>
                    <button
                      disabled={sort.index === sort.count - 1}
                      aria-label={`Move ${e.name} down`}
                      onClick={() => sort.move(1)}
                    >
                      Move down
                    </button>
                  </>
                )}
                <button
                  onClick={() =>
                    modify((e, w) => {
                      const target =
                        e.sets.find((s) => !s.done && !s.skipped && !s.needsLogging) || e.sets[0];
                      if (target) selectSet(w, { exerciseId: e.id, setId: target.id! });
                    })
                  }
                >
                  Select exercise
                </button>
                <button
                  onClick={() =>
                    modify((e, w) => {
                      if (w.controller?.running?.exerciseId === e.id)
                        throw Error('Stop the active set first.');
                      e.skipped = !e.skipped;
                      for (const s of e.sets)
                        if (!s.done) {
                          s.skipped = e.skipped;
                          s.needsLogging = false;
                        }
                      w.controller!.selected = positions(w)[0] || null;
                      if (!e.skipped && e.sets.length)
                        w.controller!.selected = {
                          exerciseId: e.id,
                          setId: (e.sets.find((s) => !s.done)?.id || e.sets[0]?.id)!,
                        };
                      reconcile(w);
                    })
                  }
                >
                  {e.skipped ? 'Include exercise' : 'Skip exercise'}
                </button>
              </div>
              {e.sets.map((s, index) => (
                <div className="set-option-row" key={s.id}>
                  <span>Set {s.prescription ? (s.prescription.number ?? '?') : index + 1}</span>
                  <button
                    aria-label={`${s.done ? 'Mark incomplete' : 'Complete'} ${e.name} set ${index + 1}`}
                    disabled={running && w.controller?.running?.setId === s.id}
                    onClick={() => logSet(s.id!)}
                  >
                    {s.done ? 'Undo' : 'Mark logged'}
                  </button>
                  <button
                    className="skip-set"
                    aria-label={`${s.skipped ? 'Include' : 'Skip'} ${e.name} set ${index + 1}`}
                    disabled={running && w.controller?.running?.setId === s.id}
                    onClick={() =>
                      set(s.id!, (s, e, w) => {
                        if (s.skipped) {
                          s.skipped = false;
                          selectSet(w, { exerciseId: e.id, setId: s.id! });
                        } else skipSet(w, { exerciseId: e.id, setId: s.id! });
                      })
                    }
                  >
                    {s.skipped ? 'Include' : 'Skip'}
                  </button>
                </div>
              ))}
            </details>
          </div>
          <div className="set-adjust compact-set-adjust live-set-controls">
            <button
              aria-label={`Remove set from ${e.name}`}
              disabled={e.sets.length <= 1}
              onClick={() => {
                const last = e.sets.at(-1)!;
                const protectedSet =
                  last.done || last.needsLogging || w.controller?.running?.setId === last.id;
                if (
                  protectedSet &&
                  !confirm(
                    'Remove this logged or active set? A running set will be stopped. Its log and timing will remain in the session backup.',
                  )
                )
                  return;
                change((w) => removeLiveSet(w, e.id, true));
              }}
            >
              − Remove set
            </button>
            <button
              aria-label={`Add set to ${e.name}`}
              disabled={e.sets.length >= 12}
              onClick={() =>
                modify((e, w) => {
                  addPerformanceSet(e);
                  const added = e.sets.at(-1)!;
                  added.id = crypto.randomUUID();
                  if (!w.controller!.selected)
                    w.controller!.selected = { exerciseId: e.id, setId: added.id };
                })
              }
            >
              + Add set
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
