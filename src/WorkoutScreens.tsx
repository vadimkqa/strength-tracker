import { TimerBubble } from './TimerBubble';
import { useRef, type ReactNode } from 'react';
import type { Workout } from './data';
import { findSet, pendingLogs, startSet, stopSet, stopwatch } from './controller';
interface Props {
  workout: Workout;
  now: number;
  change: (fn: (w: Workout) => Workout) => void;
  finish: () => void;
  children: ReactNode;
}
export function WorkoutScreens({ workout: w, now, change, finish, children }: Props) {
  const c = w.controller!;
  const origin = useRef<{ x: number; y: number } | null>(null);
  const busy = useRef(0);
  const screen = (value: 'exercises' | 'timer') =>
    change((w) => {
      w.controller!.screen = value;
      return w;
    });
  const pointer = c.phase === 'set' ? c.running : c.selected;
  const ex = w.exercises.find((e) => e.id === pointer?.exerciseId);
  const set = findSet(w, pointer);
  const index = ex?.sets.findIndex((s) => s.id === pointer?.setId) ?? -1;
  const pending = pendingLogs(w);
  const label =
    c.phase === 'set'
      ? 'STOP SET'
      : pending.length && !c.selected
        ? 'COMPLETE LOGGING'
        : !c.selected
          ? 'FINISH WORKOUT'
          : set?.done || set?.skipped
            ? 'SELECT UNFINISHED SET'
            : c.phase === 'warmup'
              ? 'START SET'
              : 'START NEXT SET';
  return (
    <div
      className="workout-controller"
      onPointerDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            'input,textarea,select,button,a,summary,[contenteditable=true]',
          )
        ) {
          origin.current = null;
          return;
        }
        origin.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerCancel={() => (origin.current = null)}
      onPointerUp={(e) => {
        const p = origin.current;
        origin.current = null;
        if (!p) return;
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4)
          screen(dx < 0 ? 'timer' : 'exercises');
      }}
    >
      <div className="workout-screen-tabs" role="tablist" aria-label="Workout screens">
        {(['exercises', 'timer'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            id={`workout-tab-${s}`}
            aria-controls={`workout-panel-${s}`}
            aria-selected={c.screen === s}
            onClick={() => screen(s)}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>
      {pending.length > 0 && (
        <aside className="notice" role="alert">
          Set timing saved. Enter valid weight and positive reps for {pending.length} stopped set
          {pending.length === 1 ? '' : 's'} to complete logging.
          <button
            onClick={() => {
              screen('exercises');
              requestAnimationFrame(() =>
                document.querySelector('.needs-logging')?.scrollIntoView({ block: 'center' }),
              );
            }}
          >
            Enter missing weight/reps
          </button>
        </aside>
      )}
      <section
        key={c.screen}
        className="workout-panel"
        role="tabpanel"
        id={`workout-panel-${c.screen}`}
        aria-labelledby={`workout-tab-${c.screen}`}
      >
        {c.screen === 'exercises' ? (
          children
        ) : (
          <div className="timer-screen">
            <p className="eyebrow" aria-label="Current phase">
              {c.phase === 'warmup' ? 'Warm-up' : c.phase === 'set' ? 'Set' : 'Rest'}
            </p>
            <div className="stopwatch" role="timer" aria-label="Phase stopwatch">
              {stopwatch(now - c.phaseStarted)}
            </div>
            <h2>{ex?.name || 'All sets finished'}</h2>
            <p className="muted">
              {set
                ? `Set ${set.prescription ? (set.prescription.number ?? '?') : index + 1}`
                : 'Finish when you are ready'}
            </p>
            <p className="eyebrow">TOTAL WORKOUT</p>
            <strong className="total-stopwatch" aria-label="Total workout duration">
              {stopwatch(now - w.started)}
            </strong>
            <p className="muted">
              {c.phase === 'rest'
                ? 'Rest counts up until you start the next set.'
                : set?.done || set?.skipped
                  ? 'SELECT UNFINISHED SET'
                  : c.phase === 'warmup'
                    ? 'Warm up at your own pace. Start when ready.'
                    : 'Stop when this set is finished.'}
            </p>
          </div>
        )}
      </section>
      {c.screen === 'exercises' && (
        <TimerBubble
          controller={c}
          now={now}
          save={(position) =>
            change((w) => {
              w.controller!.bubblePosition = position;
              return w;
            })
          }
        />
      )}
      <div className="workout-floating-action">
        <button
          className="primary"
          onClick={() => {
            if (label === 'FINISH WORKOUT') {
              finish();
              return;
            }
            const time = Date.now();
            if (time - busy.current < 650) return;
            busy.current = time;

            if (label === 'COMPLETE LOGGING' || label === 'SELECT UNFINISHED SET') {
              screen('exercises');
              return;
            }
            change((w) => (w.controller!.phase === 'set' ? stopSet(w, time) : startSet(w, time)));
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
