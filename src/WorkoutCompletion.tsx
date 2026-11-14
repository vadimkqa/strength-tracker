import { useEffect, useRef } from 'react';
import type { Data } from './data';
import { formatTime } from './data';
import { workoutCompletion } from './workout-completion';
import { loggedSet } from './workout-results';
import { exerciseComplete } from './exercise-cards';
import { levelFor, STREAK_TIME_ZONE } from './streak';
import { artworkFor } from './streak-artwork';
import { StreakIcon, SecretStreakIcon } from './StreakIcon';

export function WorkoutCompletion({
  data,
  id,
  done,
}: {
  data: Data;
  id: string;
  done: () => void;
}) {
  const receipt = workoutCompletion(data, id),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [id]);
  if (!receipt) return null;
  const { workout: w, streak } = receipt;
  const intensity =
    w.week === 'heavy' || w.week === 'hard'
      ? 'Hard'
      : w.week === 'easy'
        ? 'Easy'
        : w.week || 'Intensity unspecified';
  const date = new Intl.DateTimeFormat(undefined, {
    timeZone: STREAK_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(w.finished!);
  const weekDate = new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(streak.week + 'T12:00:00Z'));
  return (
    <section className="workout-completion" aria-labelledby="completion-title">
      <div className="completion-heading">
        <span className="completion-seal" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path d="m8 16 5 5 11-11" />
          </svg>
        </span>
        <p className="eyebrow">SAVED ON THIS DEVICE</p>
        <h1 id="completion-title" tabIndex={-1} ref={heading}>
          Workout Complete
        </h1>
        <p className="completion-workout-name">{receipt.name}</p>
        <p className="completion-date">
          <time dateTime={new Date(w.finished!).toISOString()}>{date}</time>
          <span className="completion-intensity">{intensity}</span>
        </p>
      </div>
      <dl className="completion-stats" aria-label="Workout statistics">
        <div>
          <dt>Duration</dt>
          <dd data-testid="completion-duration">{formatTime(receipt.duration / 1000)}</dd>
        </div>
        <div>
          <dt>Completed sets</dt>
          <dd data-testid="completion-sets">{receipt.sets}</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd data-testid="completion-volume">
            {receipt.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <small>kg</small>
          </dd>
        </div>
      </dl>
      <section className="card completion-exercises" aria-label="Completed exercises">
        <details>
          <summary>
            <span>
              <b>
                {receipt.exercises} / {w.exercises.length} exercises completed
              </b>
              <small>Review your logged sets</small>
            </span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="completion-exercise-list">
            {w.exercises.map((e) => (
              <article key={e.id}>
                <h3>
                  {e.name} {e.exerciseIntensity && <small>· {e.exerciseIntensity}</small>}
                </h3>
                <p className="muted">
                  {exerciseComplete(w, e)
                    ? 'Completed'
                    : e.skipped
                      ? 'Skipped'
                      : 'Partially completed / unfinished'}
                </p>
                <ul>
                  {e.sets.map((s, i) => (
                    <li key={s.id || i}>
                      <span>Set {s.prescription?.number ?? i + 1}</span>
                      <b>
                        {loggedSet(e, s)
                          ? `${s.weight} kg × ${s.reps}`
                          : e.skipped || s.skipped
                            ? 'Skipped'
                            : s.needsLogging
                              ? 'Logging unresolved'
                              : 'Not completed'}
                      </b>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </details>
      </section>
      <section className="card completion-prs" aria-labelledby="completion-prs-title">
        <div className="completion-section-heading">
          <svg className="completion-pr-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 17 12-12M7 5h10v10" />
          </svg>
          <h2 id="completion-prs-title">Personal records</h2>
        </div>
        {receipt.records.length ? (
          <ul>
            {receipt.records.map((r) => (
              <li key={r.name}>
                <div>
                  <b>{r.name}</b>
                  <small>
                    Previous best: {r.previous.weight} kg × {r.previous.reps}
                  </small>
                </div>
                <strong>
                  {r.weight} kg <span>× {r.reps}</span>
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No new PRs this session. Every logged set builds your baseline.</p>
        )}
      </section>
      <section
        className={`card completion-streak ${streak.weeklyUnlocked ? 'week-unlocked' : ''}`}
        aria-labelledby="completion-streak-title"
      >
        <div className="completion-section-heading">
          <h2 id="completion-streak-title">Strength Streak</h2>
          <span className="completion-week-count" aria-label="Weekly workout progress">
            {streak.completed}/{streak.target ?? '—'}
          </span>
        </div>
        <p className="completion-week-label">At completion · Week of {weekDate} · Monday–Sunday</p>
        {streak.target !== null && (
          <progress
            max={streak.target}
            value={streak.completed}
            aria-label="Weekly target progress"
          />
        )}
        <p className="muted">{streak.message}</p>
        {streak.weeklyUnlocked && (
          <p className="completion-week-success">
            ✓ Weekly target complete · {streak.current} {streak.current === 1 ? 'week' : 'weeks'}{' '}
            strong
          </p>
        )}
        {streak.achievements.map((level) => (
          <div className="completion-unlock" key={level.id}>
            <div className="streak-art-frame">
              <StreakIcon level={level} />
            </div>
            <div>
              <small>ACHIEVEMENT UNLOCKED</small>
              <h3>{artworkFor(level).name}</h3>
              <p>{level.weeks} consecutive qualifying weeks</p>
            </div>
          </div>
        ))}
        {streak.secret && (
          <div className="completion-unlock completion-secret">
            <div className="streak-art-frame">
              <SecretStreakIcon longest={streak.longest} />
            </div>
            <div>
              <small>SECRET ACHIEVEMENT UNLOCKED</small>
              <h3>A year of strength</h3>
              <p>52 consecutive qualifying weeks</p>
            </div>
          </div>
        )}
        {streak.weeklyUnlocked && !streak.achievements.length && !streak.secret && (
          <div className="completion-week-art">
            <StreakIcon level={levelFor(streak.current)} />
          </div>
        )}
      </section>
      <p className="completion-footnote">
        Volume uses logged load × reps. Bodyweight sets logged at 0 kg add no load to volume.
      </p>
      <button className="primary full completion-done" onClick={done}>
        Done
      </button>
    </section>
  );
}
