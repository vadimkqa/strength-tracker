import { ExerciseCard } from './ExerciseCard';
import { syncExerciseCards } from './exercise-cards';
import { BackupPanel } from './BackupPanel';
import { BACKUP_FILENAME, restoreDatabaseBackup } from './backup';
import { resizeTemplateSets } from './importing/saving';
import type { TrainingProgram } from './importing/model';
import { carouselIndex, chooseWorkout, chooseWeek, workoutDifficulty } from './carousel-selection';
import { useKeyboardViewport } from './useKeyboardViewport';
import { WorkoutScreens } from './WorkoutScreens';
import { ensureController, reconcile, finalizeLogging, pendingLogs } from './controller';
import { saveImportedPlan } from './plan-storage';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  loadData,
  saveData,
  createWorkout,
  finishWorkout,
  newSet,
  formatTime,
  type Data,
  type Workout,
} from './data';
import { workouts, carouselWorkouts, templateLabel } from './workouts';
import { WorkoutCarousel, type CarouselHandle } from './WorkoutCarousel';
import { PlanImporter } from './PlanImporter';
import type { PlanDraft } from './plan-import';
import './style.css';

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
  useKeyboardViewport();
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<Tab>('Train'),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(''),
    [fatal, setFatal] = useState(''),
    [pending, setPending] = useState(0),
    [restoring, setRestoring] = useState(false),
    [planKey, setPlanKey] = useState<string>(workouts[0].key);
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
        if (d.active) {
          const repaired = ensureController(d.active);
          if (JSON.stringify(repaired) !== JSON.stringify(d.active)) {
            d.active = repaired;
            await saveData(d);
          }
        }
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
              'Strength Trainer is already open in another tab. Close that tab, then reload here to protect your workout data.',
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
    change((d) => ({
      ...d,
      active: d.active
        ? (() => {
            const w = ensureController(fn(ensureController(d.active)));
            finalizeLogging(w);
            reconcile(w);
            const focused = document.activeElement;
            const editing = focused?.matches('input,textarea,select')
              ? focused.closest<HTMLElement>('[data-exercise-id]')?.dataset.exerciseId
              : undefined;
            return syncExerciseCards(d.active, w, editing);
          })()
        : null,
    }));
  }
  function exportData() {
    if (!current.current) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = BACKUP_FILENAME;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function importData(source: unknown) {
    if (!current.current || importing.current) throw Error('Wait for the current save to finish.');
    importing.current = true;
    setRestoring(true);
    try {
      await queue.current;
      const next = await restoreDatabaseBackup(current.current!, source, true);
      current.current = next;
      setData(next);
      setError('');
    } finally {
      importing.current = false;
      setRestoring(false);
    }
  }
  async function applyPlan(draft: PlanDraft | TrainingProgram) {
    if (!current.current || importing.current) throw Error('Wait for the current save to finish.');
    importing.current = true;
    setRestoring(true);
    try {
      await queue.current;
      const next = await saveImportedPlan(current.current, draft, true);
      current.current = next;
      setData(next);
      if (next.rotation?.sessions[0]) setPlanKey(next.rotation.sessions[0].key);
      else if (next.trainingProgram?.workouts[0]) setPlanKey(next.trainingProgram.workouts[0].id);
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
        <h1>Strength Trainer</h1>
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
  const cards = carouselWorkouts(data.rotation, data.rotationWeek, data.trainingProgram, data.week);
  const index = carouselIndex(data);
  const programTemplate = data.trainingProgram?.workouts.find(
    (w) => w.id === cards[index]?.templateKey,
  );
  const rotationSession = programTemplate
    ? {
        key: programTemplate.id,
        day: programTemplate.day || 'Unscheduled',
        intensity: programTemplate.intensity,
        week: programTemplate.week,
      }
    : data.rotation?.sessions.find(
        (s) => s.week === (data.rotationWeek || 1) && s.workout === cards[index].key,
      );
  const selectedIntensity = workoutDifficulty(data, index);
  return (
    <>
      <main
        inert={restoring}
        className={tab === 'Train' ? (active ? 'active-workout' : 'home-screen') : undefined}
      >
        <header>
          <div className="brand">
            <img
              className="brand-mark"
              src={`${import.meta.env.BASE_URL}icon-st-v2-192.png`}
              alt="Strength Trainer sT dumbbell logo"
              width="44"
              height="44"
            />
            <span className="brand-owner">VADIMKQA</span>
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-wordmark">
              <span>STRENGTH</span>
              <b>TRAINER</b>
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
                    <br /> <em>rep count.</em>
                  </h1>
                  <p>Choose your focus. Set your pace.</p>
                </div>
                <div className="section-title">
                  <h2>Your workout</h2>
                  <span>
                    {String(index + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
                  </span>
                </div>
                {(data.rotation || data.trainingProgram?.rotation) && (
                  <div className="rotation-selection">
                    <label htmlFor="rotation-week">TRAINING ROTATION</label>
                    <select
                      id="rotation-week"
                      value={data.rotationWeek || 1}
                      onChange={(e) => change((d) => chooseWeek(d, Number(e.target.value)))}
                    >
                      {(data.rotation?.weeks || data.trainingProgram?.rotation?.weeks || []).map(
                        (w) => (
                          <option key={w} value={w}>
                            Week {w}
                          </option>
                        ),
                      )}
                    </select>
                    <p className="muted">
                      {rotationSession
                        ? `${rotationSession.day} · ${rotationSession.intensity ? (/^(hard|heavy)$/i.test(rotationSession.intensity) ? 'Hard' : /^easy$/i.test(rotationSession.intensity) ? 'Easy' : rotationSession.intensity) : 'Intensity unspecified'} session`
                        : 'No session scheduled for this workout in this week.'}
                    </p>
                  </div>
                )}
                <WorkoutCarousel
                  ref={carousel}
                  selected={index}
                  onSelect={(i, wrap = 0) => change((d) => chooseWorkout(d, i, wrap))}
                  plan={data.plan}
                  week={selectedIntensity}
                  program={data.trainingProgram}
                  preferredIntensity={data.week}
                  rotation={data.rotation}
                  rotationWeek={data.rotationWeek || 1}
                />
                <div className="pagination" aria-label="Choose workout">
                  {cards.map((c, i) => (
                    <button
                      key={c.key}
                      aria-label={`Select ${c.name}`}
                      aria-current={index === i ? 'true' : undefined}
                      className={index === i ? 'selected' : ''}
                      onClick={() => carousel.current?.select(i)}
                    />
                  ))}
                </div>
                <div className="intensity">
                  <span className="eyebrow">TRAINING INTENSITY</span>
                  <div className="segmented" role="group" aria-label="Training intensity">
                    {['easy', 'heavy'].map((w) => (
                      <button
                        key={w}
                        aria-pressed={selectedIntensity === w}
                        className={selectedIntensity === w ? 'chosen' : ''}
                        onClick={() =>
                          change((d) =>
                            d.trainingProgram?.source.format === 'legacy-txt'
                              ? { ...d, week: w, difficultyOverride: undefined }
                              : rotationSession
                                ? {
                                    ...d,
                                    difficultyOverride: { key: rotationSession.key, value: w },
                                  }
                                : { ...d, week: w },
                          )
                        }
                      >
                        {w === 'heavy' ? 'HARD' : 'EASY'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="primary start"
                  disabled={
                    (!!data.rotation || !!programTemplate) &&
                    (!rotationSession || !data.plan[rotationSession.key])
                  }
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      active: rotationSession
                        ? createWorkout(
                            rotationSession.key,
                            selectedIntensity,
                            d.plan,
                            Date.now(),
                            d.history,
                            programTemplate && !programTemplate.legacyKey
                              ? {
                                  displayName: programTemplate.name,
                                  cycleWeek: programTemplate.week,
                                }
                              : undefined,
                          )
                        : createWorkout(cards[index].key, d.week, d.plan, Date.now(), d.history),
                    }))
                  }
                >
                  START WORKOUT <span>→</span>
                </button>
                <p className="footnote">Your training. Your data. Always with you.</p>
              </>
            ) : (
              <>
                <div className="section-title">
                  <div>
                    <p className="eyebrow">
                      {active.week
                        ? active.week === 'heavy'
                          ? 'HARD'
                          : active.week.toUpperCase()
                        : 'INTENSITY UNSPECIFIED'}{' '}
                      · IN SESSION
                    </p>
                    <h1>
                      {active.displayName ||
                        data.trainingProgram?.workouts.find(
                          (w) => w.id === active.name && !w.legacyKey,
                        )?.name ||
                        label(active.name)}
                    </h1>
                  </div>
                  <div className="active-workout-tools">
                    {' '}
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
                </div>
                <p className="workout-duration muted">
                  Workout duration: {formatTime((now - active.started) / 1000)}
                </p>
                <WorkoutScreens
                  workout={active}
                  now={now}
                  change={activeChange}
                  finish={() => {
                    if (confirm('Finish and save this workout?')) {
                      change((d) => finishWorkout(d));
                      setTab('Progress');
                    }
                  }}
                >
                  <h2 className="visually-hidden">Exercises</h2>
                  {active.exercises.map((ex) => (
                    <ExerciseCard
                      key={ex.id}
                      exercise={ex}
                      workout={active}
                      change={activeChange}
                    />
                  ))}
                  <button
                    className="primary full"
                    disabled={active.controller?.phase === 'set' || pendingLogs(active).length > 0}
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
                </WorkoutScreens>
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
                    ·{' '}
                    {w.week
                      ? w.week === 'heavy'
                        ? 'HARD'
                        : w.week.toUpperCase()
                      : 'INTENSITY UNSPECIFIED'}
                  </p>
                  <h3>
                    {w.displayName ||
                      data.trainingProgram?.workouts.find((t) => t.id === w.name && !t.legacyKey)
                        ?.name ||
                      label(w.name)}
                  </h3>
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
            <BackupPanel data={data} ready={!pending && !restoring} onRestore={importData} />
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
                    {data.trainingProgram?.workouts.find((w) => w.id === k && !w.legacyKey)?.name ||
                      label(k)}
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
                            return resizeTemplateSets(
                              d,
                              d.plan[planKey] ? planKey : Object.keys(d.plan)[0],
                              i,
                              Math.max(1, (ex[1] ?? 0) - 1),
                            );
                          })
                        }
                      >
                        −
                      </button>
                      <button
                        aria-label={`More sets ${name}`}
                        disabled={count !== null && count >= (data.trainingProgram ? 100 : 12)}
                        onClick={() =>
                          change((d) => {
                            const ex =
                              d.plan[d.plan[planKey] ? planKey : Object.keys(d.plan)[0]][i];
                            return resizeTemplateSets(
                              d,
                              d.plan[planKey] ? planKey : Object.keys(d.plan)[0],
                              i,
                              (ex[1] ?? 0) + 1,
                            );
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
            <p className="footnote">STRENGTH TRAINER 2.0 · LOCAL FIRST</p>
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
