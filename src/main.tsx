import { exerciseIdentity, addPerformanceSet, setNumber } from './performance';
import { repsLabel } from './prescriptions';
import { saveImportedPlan } from './plan-storage';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  loadData,
  saveData,
  restoreBackup,
  createWorkout,
  completeSet,
  finishWorkout,
  newSet,
  formatTime,
  type Data,
  type Workout,
} from './data';
import { workouts, templateLabel } from './workouts';
import { WorkoutCarousel, type CarouselHandle } from './WorkoutCarousel';
import { PlanImporter } from './PlanImporter';
import type { PlanDraft } from './plan-import';
import './style.css';
const cards = workouts;
const label = templateLabel;
type Tab = 'Train' | 'Progress' | 'PRs' | 'Settings';
function Icon({ name }: { name: Tab }) {
  const paths = {
    Train: (
      <>
        <path d="M3 9v6m3-9v12m12-12v12m3-9v6M6 12h12" />
      </>
    ),
    Progress: (
      <>
        <path d="M4 19V5m0 14h16M8 15l4-5 4 2 4-7" />
      </>
    ),
    PRs: (
      <>
        <path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8" />
      </>
    ),
    Settings: (
      <>
        <path d="m9 3-1 3-3 1 1 4-1 4 3 1 1 3h6l1-3 3-1-1-4 1-4-3-1-1-3Z" />
        <circle cx="12" cy="11" r="3" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function App() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<Tab>('Train'),
    [index, setIndex] = useState(0),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(''),
    [fatal, setFatal] = useState(''),
    [pending, setPending] = useState(0),
    [restoring, setRestoring] = useState(false),
    [planKey, setPlanKey] = useState<string>(cards[0].key);
  const current = useRef<Data | null>(null),
    queue = useRef(Promise.resolve()),
    importing = useRef(false),
    carousel = useRef<CarouselHandle>(null);
  useEffect(() => {
    let alive = true;
    let release: (() => void) | undefined;
    const initialize = async () => {
      try {
        const d = await loadData();
        if (alive) {
          current.current = d;
          setData(d);
        }
      } catch (e) {
        if (alive) setFatal(String(e));
      }
    };
    // Only one tab edits this device's store at a time, preventing stale-tab overwrites.
    if (navigator.locks) {
      navigator.locks.request('strength-tracker-editor', { ifAvailable: true }, async (lock) => {
        if (!alive) return;
        if (!lock) {
          if (alive)
            setFatal(
              'Strength Tracker is already open in another tab. Close that tab, then reload here to protect your workout data.',
            );
          return;
        }
        await new Promise<void>((resolve) => {
          release = resolve;
          void initialize();
        });
      });
    } else void initialize();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch((e) => setError('Offline support could not start: ' + e.message));
    }
    return () => {
      alive = false;
      clearInterval(timer);
      release?.();
    };
  }, []);
  function change(fn: (d: Data) => Data) {
    if (!current.current || importing.current) return;
    try {
      const next = fn(structuredClone(current.current));
      current.current = next;
      setData(next);
      setPending((n) => n + 1);
      queue.current = queue.current
        .catch(() => {})
        .then(() => saveData(next))
        .then(() => setError(''))
        .catch((e) =>
          setError(
            'Changes are not saved. Keep this tab open, export a backup, and retry saving. ' +
              String(e),
          ),
        )
        .finally(() => setPending((n) => n - 1));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function activeChange(fn: (w: Workout) => Workout) {
    change((d) => ({ ...d, active: d.active ? fn(d.active) : null }));
  }
  function exportData() {
    if (!current.current) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `strength-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function importData(file: File) {
    try {
      const obj = JSON.parse(await file.text());
      if (
        !confirm(
          'Restore this backup’s plan and preferences and merge its history? All current workouts will be kept.',
        )
      )
        return;
      importing.current = true;
      setRestoring(true);
      await queue.current;
      const next = await restoreBackup(current.current!, obj);
      current.current = next;
      setData(next);
      setError('');
    } catch (e) {
      setError('Backup not imported: ' + (e as Error).message);
    } finally {
      importing.current = false;
      setRestoring(false);
    }
  }
  async function applyPlan(draft: PlanDraft) {
    if (!current.current || importing.current) throw Error('Wait for the current save to finish.');
    importing.current = true;
    setRestoring(true);
    try {
      await queue.current;
      const next = await saveImportedPlan(current.current, draft, true);
      current.current = next;
      setData(next);
      if (next.rotation?.sessions[0]) setPlanKey(next.rotation.sessions[0].key);
      setError('');
    } finally {
      importing.current = false;
      setRestoring(false);
    }
  }
  if (fatal)
    return (
      <main>
        <h1>Your data comes first.</h1>
        <p role="alert">{fatal}</p>
        <p>
          No stored data has been replaced. Export the original localStorage data from your previous
          app or resolve storage access before continuing.
        </p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (!data)
    return (
      <main>
        <h1>Strength Tracker</h1>
        <p>Opening your training journal…</p>
      </main>
    );
  const active = data.active,
    completed = data.history.reduce(
      (n, w) => n + w.exercises.reduce((t, e) => t + e.sets.filter((s) => s.done).length, 0),
      0,
    );
  const records = new Map<string, { weight: number; reps: number }>();
  for (const w of data.history)
    for (const e of w.exercises)
      for (const s of e.sets)
        if (s.done) {
          const old = records.get(e.name);
          if (
            !old ||
            Number(s.weight) > old.weight ||
            (Number(s.weight) === old.weight && Number(s.reps) > old.reps)
          )
            records.set(e.name, { weight: Number(s.weight), reps: Number(s.reps) });
        }
  const rotationSession = data.rotation?.sessions.find(
    (s) => s.week === (data.rotationWeek || 1) && s.workout === cards[index].key,
  );
  const selectedIntensity = rotationSession
    ? rotationSession.intensity === 'hard'
      ? 'heavy'
      : 'easy'
    : data.week;
  return (
    <>
      <main inert={restoring} className={tab === 'Train' && !active ? 'home-screen' : undefined}>
        <header>
          <div className="brand">
            <span className="brand-mark">
              ST<span>◆</span>
            </span>
            <span>
              STRENGTH
              <br />
              <b>TRACKER</b>
            </span>
          </div>
          <span className="edition">
            2.0 <span>●</span>
          </span>
        </header>
        {error && (
          <aside role="alert" className="notice">
            {error}
            <button onClick={() => change((d) => d)}>Retry saving</button>
            <button onClick={exportData}>Export backup</button>
          </aside>
        )}
        {tab === 'Train' && (
          <>
            {!active ? (
              <>
                <div className="page-title">
                  <p className="eyebrow">BUILD YOUR STRONGER SELF</p>
                  <h1>
                    Make every
                    <br />
                    <em>rep count.</em>
                  </h1>
                  <p>Choose your focus. Set your pace.</p>
                </div>
                <div className="section-title">
                  <h2>Your workout</h2>
                  <span>{String(index + 1).padStart(2, '0')} / 04</span>
                </div>
                {data.rotation && (
                  <div className="rotation-selection">
                    <label htmlFor="rotation-week">TRAINING ROTATION</label>
                    <select
                      id="rotation-week"
                      value={data.rotationWeek || 1}
                      onChange={(e) =>
                        change((d) => ({ ...d, rotationWeek: Number(e.target.value) }))
                      }
                    >
                      {data.rotation.weeks.map((w) => (
                        <option key={w} value={w}>
                          Week {w}
                        </option>
                      ))}
                    </select>
                    <p className="muted">
                      {rotationSession
                        ? `${rotationSession.day} · ${rotationSession.intensity === 'hard' ? 'Hard' : 'Easy'} session`
                        : 'No session scheduled for this workout in this week.'}
                    </p>
                  </div>
                )}
                <WorkoutCarousel
                  ref={carousel}
                  selected={index}
                  onSelect={setIndex}
                  plan={data.plan}
                  week={selectedIntensity}
                  rotation={data.rotation}
                  rotationWeek={data.rotationWeek || 1}
                />
                <div className="intensity">
                  <span className="eyebrow">TRAINING INTENSITY</span>
                  <div className="segmented" role="group" aria-label="Training intensity">
                    {['easy', 'heavy'].map((w) => (
                      <button
                        key={w}
                        aria-pressed={selectedIntensity === w}
                        className={selectedIntensity === w ? 'chosen' : ''}
                        disabled={
                          !!data.rotation &&
                          !data.rotation.sessions.some(
                            (s) =>
                              s.workout === cards[index].key &&
                              s.intensity === (w === 'heavy' ? 'hard' : 'easy'),
                          )
                        }
                        onClick={() =>
                          change((d) => {
                            if (d.rotation) {
                              const matching = d.rotation.sessions.find(
                                (s) =>
                                  s.workout === cards[index].key &&
                                  s.intensity === (w === 'heavy' ? 'hard' : 'easy'),
                              );
                              return matching ? { ...d, rotationWeek: matching.week } : d;
                            }
                            return { ...d, week: w };
                          })
                        }
                      >
                        {w === 'heavy' ? 'HARD' : 'EASY'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="primary start"
                  disabled={!!data.rotation && !rotationSession}
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      active: rotationSession
                        ? createWorkout(
                            rotationSession.key,
                            rotationSession.intensity === 'hard' ? 'heavy' : 'easy',
                            d.plan,
                            Date.now(),
                            d.history,
                          )
                        : createWorkout(cards[index].key, d.week, d.plan, Date.now(), d.history),
                    }))
                  }
                >
                  START WORKOUT <span>→</span>
                </button>
                <div className="pagination" aria-label="Choose workout">
                  {cards.map((c, i) => (
                    <button
                      key={c.name}
                      aria-label={`Select ${c.name}`}
                      aria-current={index === i ? 'true' : undefined}
                      className={index === i ? 'selected' : ''}
                      onClick={() => carousel.current?.select(i)}
                    />
                  ))}
                </div>
                <p className="footnote">Your training. Your data. Always with you.</p>
              </>
            ) : (
              <>
                <div className="section-title">
                  <div>
                    <p className="eyebrow">
                      {active.week === 'easy' ? 'EASY' : 'HARD'} · IN SESSION
                    </p>
                    <h1>{label(active.name)}</h1>
                  </div>
                  <span className="live-dot">●</span>
                </div>
                <section className="card session-metrics">
                  <div>
                    <span className="eyebrow">DURATION</span>
                    <strong className="time">{formatTime((now - active.started) / 1000)}</strong>
                  </div>
                  <div>
                    <span className="eyebrow">COMPLETED</span>
                    <strong>
                      {active.exercises.reduce(
                        (n, e) => n + e.sets.filter((s) => s.done).length,
                        0,
                      )}
                      <small>
                        {' '}
                        / {active.exercises.reduce((n, e) => n + e.sets.length, 0)} sets
                      </small>
                    </strong>
                  </div>
                </section>
                <section className="card">
                  <div className="row">
                    <div>
                      <p className="eyebrow">REST TIMER</p>
                      <strong className="time purple" aria-label="Rest countdown">
                        {formatTime(active.restEnd ? Math.ceil((active.restEnd - now) / 1000) : 0)}
                      </strong>
                      <p className="muted">
                        {active.restEnd
                          ? active.restEnd > now
                            ? 'Resting'
                            : 'Rest complete'
                          : active.exercises.some(
                                (e) => e.rest === null && e.sets.some((s) => s.done),
                              )
                            ? 'Rest unspecified — choose a timer if needed'
                            : 'Starts after a set'}
                      </p>
                    </div>
                    <button onClick={() => activeChange((w) => ({ ...w, restEnd: null }))}>
                      Skip
                    </button>
                  </div>
                  <div className="rest-controls">
                    {[60, 120, 180, 240].map((t) => (
                      <button
                        key={t}
                        onClick={() =>
                          activeChange((w) => ({
                            ...w,
                            restEnd: Date.now() + t * 1000,
                            restSeconds: t,
                          }))
                        }
                      >
                        {t / 60} min
                      </button>
                    ))}
                  </div>
                </section>
                <div className="section-title">
                  <h2>Exercises</h2>
                  <button
                    onClick={() => {
                      const name = prompt('New exercise name');
                      if (name?.trim())
                        activeChange((w) => ({
                          ...w,
                          exercises: [
                            ...w.exercises,
                            {
                              id: crypto.randomUUID(),
                              name: name.trim(),
                              rest: data.restDefault,
                              sets: [newSet(), newSet(), newSet()],
                            },
                          ],
                        }));
                    }}
                  >
                    + Add
                  </button>
                </div>
                {active.exercises.map((ex, i) => {
                  return (
                    <section className="card exercise" key={ex.id || i}>
                      <div className="row">
                        <div>
                          <h3>{ex.name}</h3>
                          <p className="muted">
                            {ex.rest === null ? 'Rest unspecified' : `${ex.rest}s rest`}
                          </p>
                        </div>
                        <button
                          aria-label={`Edit ${ex.name}`}
                          onClick={() => {
                            const name = prompt('Exercise name', ex.name);
                            if (name === null) return;
                            const rest = prompt(
                              'Rest between sets (seconds)',
                              ex.rest === null ? '' : String(ex.rest),
                            );
                            activeChange((w) => {
                              w.exercises[i].name = name.trim() || ex.name;
                              if (
                                exerciseIdentity(w.exercises[i].name) !== exerciseIdentity(ex.name)
                              ) {
                                w.exercises[i].exerciseKey = exerciseIdentity(w.exercises[i].name);
                                delete w.exercises[i].previousPerformance;
                              }
                              if (rest && Number.isFinite(Number(rest)) && Number(rest) > 0)
                                w.exercises[i].rest = Math.min(3600, Math.round(Number(rest)));
                              return w;
                            });
                          }}
                        >
                          Edit
                        </button>
                      </div>
                      {(ex.exerciseIntensity || ex.optional) && (
                        <p className="eyebrow">
                          {ex.exerciseIntensity}
                          {ex.optional ? ' · OPTIONAL' : ''}
                        </p>
                      )}
                      {ex.alternatives?.length ? (
                        <p className="muted">Alternatives: {ex.alternatives.join(' OR ')}</p>
                      ) : null}
                      {ex.sets.length === 0 && (
                        <p className="muted">
                          Set count unspecified. Add sets only as you choose to perform them.
                        </p>
                      )}
                      {ex.targetReps && (
                        <p className="muted prescription">Target: {ex.targetReps} reps</p>
                      )}
                      {ex.notes && (
                        <details className="prescription-notes">
                          <summary>Plan notes</summary>
                          <p>{ex.notes}</p>
                        </details>
                      )}
                      <div className="setrow performance-row set-head">
                        <span>SET</span>
                        <span className="last-heading">LAST TIME</span>
                        <span>KG</span>
                        <span>REPS</span>
                        <span>DONE</span>
                      </div>
                      {ex.sets.map((s, j) => (
                        <div className={`setrow performance-row ${s.done ? 'done' : ''}`} key={j}>
                          <span>
                            {s.prescription
                              ? (s.prescription.number ?? '?')
                              : String(j + 1).padStart(2, '0')}
                          </span>
                          <span className="previous-set">
                            {(() => {
                              const n = setNumber(s, j);
                              const last = n === null ? undefined : ex.previousPerformance?.sets[n];
                              return last
                                ? `Last: ${last.weight} kg × ${last.reps}`
                                : 'No previous performance';
                            })()}
                          </span>
                          {(['weight', 'reps'] as const).map((field) => (
                            <input
                              key={field}
                              aria-label={`${field === 'weight' ? 'Weight' : 'Reps'} ${ex.name} set ${j + 1}`}
                              type="number"
                              inputMode={field === 'weight' ? 'decimal' : 'numeric'}
                              min="0"
                              step={field === 'weight' ? '0.5' : '1'}
                              value={s[field]}
                              onChange={(e) =>
                                activeChange((w) => {
                                  w.exercises[i].sets[j][field] = e.target.value;
                                  return w;
                                })
                              }
                            />
                          ))}
                          <button
                            className={s.done ? 'check done' : 'check'}
                            aria-label={`${s.done ? 'Undo' : 'Complete'} ${ex.name} set ${j + 1}`}
                            aria-pressed={s.done}
                            onClick={() => activeChange((w) => completeSet(w, i, j))}
                          >
                            {s.done ? '✓' : '○'}
                          </button>
                          {s.prescription && (
                            <small className="prescription-per-set">
                              Set {s.prescription.number ?? '?'}: {repsLabel(s.prescription)} reps ·{' '}
                              {s.prescription.effort}
                            </small>
                          )}
                        </div>
                      ))}
                      <div className="set-adjust compact-set-adjust">
                        <div>
                          <button
                            aria-label={`Remove set from ${ex.name}`}
                            disabled={ex.sets.length <= 1}
                            onClick={() => {
                              if (
                                ex.sets.at(-1)?.done &&
                                !confirm('Remove the last completed set?')
                              )
                                return;
                              activeChange((w) => {
                                w.exercises[i].sets.pop();
                                return w;
                              });
                            }}
                          >
                            −
                          </button>
                          <button
                            aria-label={`Add set to ${ex.name}`}
                            disabled={ex.sets.length >= 12}
                            onClick={() =>
                              activeChange((w) => {
                                const exercise = w.exercises[i];
                                addPerformanceSet(exercise);
                                return w;
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </section>
                  );
                })}
                <button
                  className="primary full"
                  onClick={() => {
                    if (confirm('Finish and save this workout?')) {
                      change((d) => finishWorkout(d));
                      setTab('Progress');
                    }
                  }}
                >
                  Finish & save workout
                </button>
                <button
                  className="danger full"
                  onClick={() => {
                    if (confirm('Discard this active workout? Saved history will be kept.'))
                      change((d) => ({ ...d, active: null }));
                  }}
                >
                  Discard workout
                </button>
              </>
            )}
          </>
        )}
        {tab === 'Progress' && (
          <>
            <div className="page-title">
              <p className="eyebrow">THE WORK ADDS UP</p>
              <h1>Your progress.</h1>
              <p>Every session is a step forward.</p>
            </div>
            <div className="stats">
              <section className="card">
                <strong>{data.history.length}</strong>
                <span>WORKOUTS</span>
              </section>
              <section className="card">
                <strong>{completed}</strong>
                <span>SETS COMPLETED</span>
              </section>
            </div>
            <div className="section-title">
              <h2>Workout history</h2>
              <span>ALL TIME</span>
            </div>
            {!data.history.length ? (
              <section className="card empty">
                <Icon name="Progress" />
                <h3>Your story starts here.</h3>
                <p>Finish your first workout to see it here.</p>
                <button onClick={() => setTab('Train')}>Go to Train →</button>
              </section>
            ) : (
              data.history.map((w, i) => (
                <section className="card" key={w.id + ':' + i}>
                  <p className="eyebrow">
                    {new Date(w.started).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    · {w.week === 'easy' ? 'EASY' : 'HARD'}
                  </p>
                  <h3>{label(w.name)}</h3>
                  <p className="muted">
                    {w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} sets
                    ·{' '}
                    {w.finished
                      ? formatTime((w.finished - w.started) / 1000)
                      : 'Imported unfinished session'}
                  </p>
                  <details>
                    <summary>View sets</summary>
                    {w.exercises.map((e, j) => (
                      <div className="history-ex" key={j}>
                        <b>{e.name}</b>
                        <p className="muted">
                          {e.sets
                            .filter((s) => s.done)
                            .map((s) => `${s.weight || 0} kg × ${s.reps}`)
                            .join(' · ') || 'No completed sets'}
                        </p>
                      </div>
                    ))}
                  </details>
                  <button
                    className="danger"
                    onClick={() => {
                      if (
                        confirm(
                          'Delete this saved workout? Export a backup first if you want to keep it.',
                        )
                      )
                        change((d) => ({ ...d, history: d.history.filter((_, j) => j !== i) }));
                    }}
                  >
                    Delete session
                  </button>
                </section>
              ))
            )}
          </>
        )}
        {tab === 'PRs' && (
          <>
            <div className="page-title">
              <p className="eyebrow">PROOF OF YOUR EFFORT</p>
              <h1>Personal records.</h1>
              <p>Your best completed sets, by exercise.</p>
            </div>
            {records.size === 0 ? (
              <section className="card empty">
                <Icon name="PRs" />
                <h3>Great things take reps.</h3>
                <p>Log a set and finish your workout to earn your first record.</p>
                <button onClick={() => setTab('Train')}>Start training →</button>
              </section>
            ) : (
              [...records].map(([name, r]) => (
                <section className="card row" key={name}>
                  <div>
                    <p className="eyebrow">BEST WEIGHT</p>
                    <h3>{name}</h3>
                    <p className="muted">{r.reps} reps</p>
                  </div>
                  <strong className="record">
                    {r.weight}
                    <small> kg</small>
                  </strong>
                </section>
              ))
            )}
          </>
        )}
        {tab === 'Settings' && (
          <>
            <div className="page-title">
              <p className="eyebrow">MAKE IT YOURS</p>
              <h1>Settings.</h1>
              <p>A plan that moves with you.</p>
            </div>
            <PlanImporter onApply={applyPlan} />
            <section className="card">
              <h2>Workout plan</h2>
              <p className="muted">Set counts apply to future workouts.</p>
              <label htmlFor="plan">WORKOUT TEMPLATE</label>
              <select
                id="plan"
                value={data.plan[planKey] ? planKey : Object.keys(data.plan)[0]}
                onChange={(e) => setPlanKey(e.target.value)}
              >
                {Object.keys(data.plan).map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
              {(data.plan[planKey] || data.plan[Object.keys(data.plan)[0]]).map(
                ([name, count, rest], i) => (
                  <div className="plan-row" key={name}>
                    <div>
                      <b>{name}</b>
                      <p className="muted">
                        {count ?? 'Unspecified'} sets ·{' '}
                        {rest === null ? 'Rest unspecified' : `${rest}s rest`}
                      </p>
                    </div>
                    <div className="stepper">
                      <button
                        aria-label={`Fewer sets ${name}`}
                        disabled={count === null || count <= 1}
                        onClick={() =>
                          change((d) => {
                            const ex =
                              d.plan[d.plan[planKey] ? planKey : Object.keys(d.plan)[0]][i];
                            ex[1] = Math.max(1, (ex[1] ?? 0) - 1);
                            return d;
                          })
                        }
                      >
                        −
                      </button>
                      <button
                        aria-label={`More sets ${name}`}
                        disabled={count !== null && count >= 12}
                        onClick={() =>
                          change((d) => {
                            const ex =
                              d.plan[d.plan[planKey] ? planKey : Object.keys(d.plan)[0]][i];
                            ex[1] = (ex[1] ?? 0) + 1;
                            return d;
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                ),
              )}
            </section>
            <section className="card">
              <h2>Rest preferences</h2>
              <label htmlFor="default-rest">DEFAULT REST FOR NEW EXERCISES</label>
              <select
                id="default-rest"
                value={data.restDefault}
                onChange={(e) => change((d) => ({ ...d, restDefault: Number(e.target.value) }))}
              >
                {[...new Set([60, 90, 120, 180, 240, data.restDefault])]
                  .sort((a, b) => a - b)
                  .map((t) => (
                    <option key={t} value={t}>
                      {t} seconds
                    </option>
                  ))}
              </select>
            </section>
            <section className="card">
              <h2>Your data belongs to you.</h2>
              <p className="muted">
                Saved on this device in IndexedDB. Export regularly. Restoring a backup merges
                history and keeps your current sessions. Your original v1 localStorage data is left
                untouched.
              </p>
              <button className="primary full" onClick={exportData}>
                Export JSON backup ↓
              </button>
              <label className="file-label" htmlFor="backup">
                Restore & merge backup ↑
              </label>
              <input
                id="backup"
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importData(file);
                  e.target.value = '';
                }}
              />
            </section>
            <p className="footnote">STRENGTH TRACKER 2.0 · LOCAL FIRST</p>
          </>
        )}
        <p className="save-status" aria-live="polite">
          {pending ? 'Saving…' : error ? 'Check saving status above' : 'Saved on this device'}
        </p>
      </main>
      {restoring && (
        <div className="restore-overlay" role="status">
          Merging your backup safely…
        </div>
      )}
      <nav aria-label="Main navigation">
        {(['Train', 'Progress', 'PRs', 'Settings'] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => setTab(t)}
          >
            <Icon name={t} />
            <span>{t}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
