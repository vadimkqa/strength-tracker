import {
  calculateStreak,
  calendarWeek,
  levelFor,
  syncStreaks,
  STREAK_LEVELS,
  workoutStreakReason,
} from './streak';
import { initializeStreaks } from './streak-storage';
import { CalendarSettings } from './CalendarSettings';
import {
  applyAutomaticSelection,
  automaticSelectionKey,
  calendarStatus,
  matchesSuggestion,
  suggestWorkout,
} from './auto-selection';
import { StreakIcon, SecretStreakIcon } from './StreakIcon';
import { artworkFor, secretUnlocked } from './streak-artwork';
import { StreakDashboard } from './StreakDashboard';
import { SortableWorkout, SortableExercise } from './SortableWorkout';
import { syncExerciseCards } from './exercise-cards';
import { BackupPanel } from './BackupPanel';
import { BACKUP_FILENAME, restoreDatabaseBackup } from './backup';
import { ProgramEditor } from './ProgramEditor';
import { currentProgram } from './programs';
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
    [recordView, setRecordView] = useState<'weights' | 'streak'>('weights'),
    [savedData, setSavedData] = useState<Data | null>(null),
    [celebration, setCelebration] = useState<string | null>(null),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(''),
    [fatal, setFatal] = useState(''),
    [pending, setPending] = useState(0),
    [restoring, setRestoring] = useState(false);
  const committed = useRef<Data | null>(null),
    automaticKey = useRef<string | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<Data | null>(null),
    queue = useRef(Promise.resolve()),
    importing = useRef(false),
    carousel = useRef<CarouselHandle>(null);
  useEffect(() => {
    let alive = true;
    let release: (() => void) | undefined;
    const initialize = async () => {
      try {
        let d = await loadData();
        if (d.active) {
          const repaired = ensureController(d.active);
          if (JSON.stringify(repaired) !== JSON.stringify(d.active)) {
            d.active = repaired;
            await saveData(d);
          }
        }
        d = await initializeStreaks(d, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        if (alive) {
          committed.current = d;
          setSavedData(d);
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
    const refreshCalendar = () => setNow(Date.now());
    document.addEventListener('visibilitychange', refreshCalendar);
    window.addEventListener('pageshow', refreshCalendar);
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch((e) => setError('Offline support could not start: ' + e.message));
    }
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshCalendar);
      window.removeEventListener('pageshow', refreshCalendar);
      release?.();
    };
  }, []);
  useEffect(() => {
    const d = current.current;
    if (
      d?.streak &&
      !pending &&
      calendarWeek(now, d.streak.timeZone) > (d.streak.weeks.at(-1)?.week || '')
    )
      change((d) => d);
  }, [now, pending]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    // Only committed completions may affect suggestions. Leave manual choices alone until an event changes this key.
    const saved = committed.current;
    if (!saved || saved.active || current.current?.active || pending || error || restoring) return;
    const key = automaticSelectionKey(saved, now);
    if (automaticKey.current === key) return;
    automaticKey.current = key;
    const next = applyAutomaticSelection(saved, now);
    if (
      JSON.stringify([
        next.rotationWeek,
        next.carouselWorkout,
        next.week,
        next.difficultyOverride,
      ]) !==
      JSON.stringify([
        saved.rotationWeek,
        saved.carouselWorkout,
        saved.week,
        saved.difficultyOverride,
      ])
    )
      change((d) => applyAutomaticSelection(d, now, saved.history));
  }, [now, savedData, pending, error, restoring]);
  function acceptSaved(d: Data, animate = true) {
    const previous = committed.current;
    committed.current = d;
    setSavedData(d);
    if (!animate || !previous) return;
    const fresh = d.streak?.awards.filter(
      (a) => a.valid && !previous.streak?.awards.some((old) => old.id === a.id && old.valid),
    );
    const newest = STREAK_LEVELS.filter((l) => fresh?.some((a) => a.id === l.id)).at(-1);
    const secretJustUnlocked =
      secretUnlocked(calculateStreak(d).longest) &&
      !secretUnlocked(calculateStreak(previous).longest);
    if (newest || secretJustUnlocked) {
      setCelebration(secretJustUnlocked ? 'secret' : newest!.id);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setCelebration(null), 6000);
    }
  }
  function showStreak() {
    setRecordView('streak');
    setTab('PRs');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function change(fn: (d: Data) => Data) {
    if (!current.current || importing.current) return;
    try {
      const next = syncStreaks(fn(structuredClone(current.current)));
      current.current = next;
      setData(next);
      setPending((n) => n + 1);
      queue.current = queue.current
        .catch(() => {})
        .then(() => saveData(next))
        .then(() => {
          acceptSaved(next);
          setError('');
        })
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
      acceptSaved(next, false);
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
      acceptSaved(next, false);
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
  const cards = carouselWorkouts(
    data.rotation,
    data.rotationWeek,
    data.trainingProgram,
    data.week,
    currentProgram(data)?.calendar?.days,
  );
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
        (s) => s.week === (data.rotationWeek || 1) && s.workout === cards[index]?.key,
      );
  const selectedIntensity = workoutDifficulty(data, index);
  const suggestion = savedData ? suggestWorkout(savedData, now) : null;
  const context = matchesSuggestion(data, suggestion) ? suggestion?.kind : null;
  const streakReport = savedData ? calculateStreak(savedData, now) : null;
  const streakLevel = levelFor(streakReport?.current || 0);
  const celebrating = STREAK_LEVELS.find((l) => l.id === celebration);
  const celebratingSecret = celebration === 'secret' && secretUnlocked(streakReport?.longest || 0);
  return (
    <>
      <main
        inert={restoring}
        className={tab === 'Train' ? (active ? 'active-workout' : 'home-screen') : undefined}
      >
        <header className={tab === 'Train' && !active ? 'streak-home-header' : undefined}>
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
          {tab === 'Train' && !active && (
            <button
              className="streak-indicator"
              aria-label={`Strength Streak, ${streakReport?.current || 0} consecutive ${streakReport?.current === 1 ? 'week' : 'weeks'}`}
              onClick={showStreak}
            >
              <span className="streak-badge-art">
                <StreakIcon level={streakLevel} />
              </span>
              <strong>
                {streakReport?.current || 0}
                <small>w</small>
              </strong>
            </button>
          )}
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
              cards.length ? (
                <>
                  <h1 className="visually-hidden">
                    Train · {currentProgram(data)?.name || 'Strength Tracker'}
                  </h1>
                  {(data.rotation?.weeks || data.trainingProgram?.rotation?.weeks || []).length >
                    1 && (
                    <div className="rotation-selection">
                      <div
                        id="rotation-week"
                        className="segmented week-segments"
                        role="group"
                        aria-label="TRAINING ROTATION"
                        data-week={data.rotationWeek || 1}
                      >
                        {(data.rotation?.weeks || data.trainingProgram?.rotation?.weeks || []).map(
                          (w) => (
                            <button
                              key={w}
                              type="button"
                              aria-pressed={(data.rotationWeek || 1) === w}
                              className={(data.rotationWeek || 1) === w ? 'chosen' : ''}
                              onClick={() => {
                                if ((data.rotationWeek || 1) !== w) change((d) => chooseWeek(d, w));
                              }}
                            >
                              Week {w}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                  {(context || calendarStatus(data)) && (
                    <p
                      className="calendar-context"
                      role="status"
                      title={calendarStatus(data) || undefined}
                    >
                      {context ||
                        (currentProgram(data)?.calendar?.enabled === false
                          ? 'Calendar selection off'
                          : 'Calendar selection needs setup in Settings')}
                    </p>
                  )}
                  <WorkoutCarousel
                    dayOverrides={currentProgram(data)?.calendar?.days}
                    ref={carousel}
                    selected={index}
                    onSelect={(i, wrap = 0) => change((d) => chooseWorkout(d, i, wrap))}
                    plan={data.plan}
                    week={selectedIntensity}
                    program={data.trainingProgram}
                    preferredIntensity={data.week}
                    rotation={data.rotation}
                    rotationWeek={data.rotationWeek || 1}
                  >
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
                                ['legacy-txt', 'built-in'].includes(
                                  d.trainingProgram?.source.format || '',
                                )
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
                  </WorkoutCarousel>
                  {currentProgram(data)?.review && (
                    <p className="notice">
                      Review this program's ownership in Settings before starting it.
                    </p>
                  )}
                  <button
                    className="primary start"
                    disabled={
                      !!currentProgram(data)?.review ||
                      ((!!data.rotation || !!programTemplate) &&
                        (!rotationSession || !data.plan[rotationSession.key]))
                    }
                    onClick={() =>
                      change((d) => ({
                        ...d,
                        active: {
                          ...(rotationSession
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
                            : createWorkout(
                                cards[index]?.key,
                                d.week,
                                d.plan,
                                Date.now(),
                                d.history,
                              )),
                          programId: d.activeProgramId,
                          ...(matchesSuggestion(d, suggestion)
                            ? { scheduledFor: suggestion!.date }
                            : {}),
                        },
                      }))
                    }
                  >
                    START WORKOUT <span>→</span>
                  </button>
                </>
              ) : (
                <section className="card">
                  <h2>{currentProgram(data)?.name}</h2>
                  <p>This program has no workout sessions. Review its program notes in Settings.</p>
                  <button onClick={() => setTab('Settings')}>Open program editor</button>
                </section>
              )
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
                <SortableWorkout
                  key={active.id}
                  workout={active}
                  change={(fn) => change((d) => ({ ...d, active: d.active ? fn(d.active) : null }))}
                >
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
                      <SortableExercise
                        key={ex.id}
                        exercise={ex}
                        workout={active}
                        change={activeChange}
                      />
                    ))}
                    <details className="workout-streak-options">
                      <summary>Streak eligibility</summary>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={!!active.streakExcluded}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            activeChange((w) => ({ ...w, streakExcluded: checked }));
                          }}
                        />
                        Practice/test workout (exclude from Strength Streak)
                      </label>
                      <p className="muted">
                        This session will still be saved, without streak credit.
                      </p>
                    </details>
                    <button
                      className="primary full"
                      disabled={
                        active.controller?.phase === 'set' || pendingLogs(active).length > 0
                      }
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
                </SortableWorkout>
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
                  <p className="streak-eligibility muted">
                    {workoutStreakReason(w, now)
                      ? `Streak: ${workoutStreakReason(w, now)}`
                      : 'Saved completed session · counts once per Europe/Vienna date, regardless of exercises or template.'}
                  </p>
                  <label className="checkbox-label history-streak-exclusion">
                    <input
                      type="checkbox"
                      checked={!!w.streakExcluded}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        change((d) => ({
                          ...d,
                          history: d.history.map((item) =>
                            item.id === w.id ? { ...item, streakExcluded: checked } : item,
                          ),
                        }));
                      }}
                    />
                    Exclude from Strength Streak (test or practice)
                  </label>
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
            <div className="segmented record-tabs" role="tablist" aria-label="Record views">
              <button
                role="tab"
                id="prs-weights-tab"
                aria-controls="prs-weights-panel"
                aria-selected={recordView === 'weights'}
                className={recordView === 'weights' ? 'chosen' : ''}
                onClick={() => setRecordView('weights')}
              >
                Weight PRs
              </button>
              <button
                role="tab"
                id="prs-streak-tab"
                aria-controls="prs-streak-panel"
                aria-selected={recordView === 'streak'}
                className={recordView === 'streak' ? 'chosen' : ''}
                onClick={() => setRecordView('streak')}
              >
                Strength Streak
              </button>
            </div>
            {recordView === 'streak' && savedData?.streak ? (
              <StreakDashboard
                data={savedData}
                now={now}
                busy={!!pending || restoring}
                change={change}
              />
            ) : (
              <div role="tabpanel" id="prs-weights-panel" aria-labelledby="prs-weights-tab">
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
              </div>
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
            <ProgramEditor data={data} change={change} />
            <CalendarSettings data={data} change={change} />
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
        {(celebrating || celebratingSecret) && !active && (
          <aside className="streak-celebration" role="status">
            {celebratingSecret ? (
              <SecretStreakIcon longest={streakReport!.longest} />
            ) : (
              <StreakIcon level={celebrating!} />
            )}
            <div>
              <small>ACHIEVEMENT UNLOCKED</small>
              <strong>
                {celebratingSecret ? 'Secret achievement unlocked' : artworkFor(celebrating!).name}
              </strong>
            </div>
            <button
              aria-label="View unlocked streak achievement"
              onClick={() => {
                setCelebration(null);
                showStreak();
              }}
            >
              View
            </button>
          </aside>
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
