import { useState, useEffect } from 'react';
import type { Data } from './data';
import { currentProgram, programWeeks } from './programs';
import {
  STREAK_LEVELS,
  calculateStreak,
  levelFor,
  configureStreak,
  STREAK_TIME_ZONE,
} from './streak';
import { WEEKDAYS } from './calendar';
import { scheduleMetadata } from './program-schedule';
import { TrainingWeekCalendar } from './TrainingWeekCalendar';
import { StreakIcon, SecretStreakIcon } from './StreakIcon';
import { artworkFor, secretUnlocked, SECRET_WEEKS } from './streak-artwork';
interface Props {
  data: Data;
  now: number;
  busy: boolean;
  change: (fn: (d: Data) => Data) => void;
}
export function StreakDashboard({ data, now, busy, change }: Props) {
  const s = data.streak!,
    report = calculateStreak(data, now),
    current = report.currentWeek,
    goal = current?.chosen;
  const active = currentProgram(data),
    last = s.policies.at(-1),
    cycles = active ? programWeeks(active) : [];
  const cycle =
    current?.goals.filter((g) => g.goal.programId === active?.id).at(-1)?.goal.cycleWeek ||
    cycles[0] ||
    1;
  const [target, setTarget] = useState(String(s.targets[active?.id || ''] || '')),
    [override, setOverride] = useState(s.targets[active?.id || ''] !== undefined),
    [customDays, setCustomDays] = useState(s.trainingDays?.[active?.id || ''] !== undefined),
    [selectedDays, setDays] = useState<number[]>(
      s.trainingDays?.[active?.id || ''] || goal?.goal.weekdays || [],
    ),
    [selectedCycle, setCycle] = useState(cycle),
    [error, setError] = useState(''),
    [historyLimit, setHistoryLimit] = useState(12);
  const planCycle = active
    ? scheduleMetadata(active).cycles.find((c) => c.week === cycle)
    : undefined;
  const planDays = planCycle?.sessions.every((s) => s.day !== null)
    ? [...new Set(planCycle.sessions.map((s) => s.day!))]
    : null;
  useEffect(() => {
    setCycle(cycle);
    setTarget(String(s.targets[active?.id || ''] || ''));
    setOverride(s.targets[active?.id || ''] !== undefined);
    setCustomDays(s.trainingDays?.[active?.id || ''] !== undefined);
    setDays(s.trainingDays?.[active?.id || ''] || goal?.goal.weekdays || []);
  }, [cycle, active?.id]);
  const level = levelFor(report.current),
    next = STREAK_LEVELS.find((l) => l.weeks > report.longest),
    secret = secretUnlocked(report.longest);
  return (
    <div
      className="streak-dashboard"
      role="tabpanel"
      id="prs-streak-panel"
      aria-labelledby="prs-streak-tab"
    >
      <div className="page-title">
        <p className="eyebrow">CONSISTENCY BUILDS STRENGTH</p>
        <h1>Strength Streak.</h1>
        <p>Monday–Sunday · {s.timeZone}</p>
      </div>
      <section className="card streak-hero" aria-label="Current Strength Streak">
        <div
          className="streak-art-frame"
          data-shape={['basic', 'first-plates', 'growing'].includes(level.id) ? 'square' : 'wide'}
        >
          <StreakIcon level={level} />
        </div>
        <h2 className="streak-achievement-name">{artworkFor(level).name}</h2>
        <strong className="streak-count" aria-label="Current streak">
          {report.current}
          <small>{report.current === 1 ? ' week' : ' weeks'}</small>
        </strong>
        <p className="streak-longest">
          <span>Longest verified streak</span>
          <b data-testid="longest-streak">
            {report.longest} {report.longest === 1 ? 'week' : 'weeks'}
          </b>
        </p>
        {next ? (
          <div className="streak-next">
            <div className="streak-next-heading">
              <span>Next milestone</span>
              <span className="streak-next-target">{next.weeks}w</span>
            </div>
            <progress
              max={next.weeks}
              value={report.current}
              aria-label={`Progress toward ${artworkFor(next).name}`}
            />
            <p className="streak-next-name">{artworkFor(next).name}</p>
            <p className="streak-next-copy">
              {next.weeks - report.current} qualifying{' '}
              {next.weeks - report.current === 1 ? 'week' : 'weeks'} to go
            </p>
          </div>
        ) : (
          <p className="streak-next-copy">All achievements are in your collection.</p>
        )}
      </section>
      <section className="card" aria-label="This week's streak progress">
        <p className="eyebrow">THIS WEEK · {current?.week || ''}</p>
        <h2>{goal?.goal.name || active?.name || 'Choose a program'}</h2>
        <strong className="weekly-progress" data-testid="weekly-progress">
          {goal?.completed || 0} / {goal?.goal.target ?? 'Target needed'}
        </strong>
        <p className="muted">
          {current?.status === 'success'
            ? 'Week complete. Your streak has increased.'
            : goal?.goal.target === null
              ? 'Configure a weekly target below; none has been invented.'
              : 'An unfinished current week does not break your streak.'}
        </p>
        {last?.mode === 'scheduled' &&
          current?.goals.some((g) => g.goal.programId === active?.id && g.goal.showCycle) && (
            <p className="muted">
              Streak schedule uses program Week {cycle}. The home carousel remains under your
              control.
            </p>
          )}
        {goal && <TrainingWeekCalendar days={goal.days} />}
        <p className="muted training-calendar-note">
          One saved training day per date. Rest-day and make-up workouts count toward the same
          weekly target.
        </p>
      </section>
      <details className="card streak-settings">
        <summary>Streak settings and rotation</summary>
        <p className="muted">
          Active program: {active?.name}. Schedule changes apply to this week onward; past
          requirements stay saved. This week's latest target applies to all completed dates.
        </p>
        <p className="muted">
          Monday–Sunday · <b>{STREAK_TIME_ZONE}</b>. Summer/winter time is handled automatically.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          Override the program's weekly target
        </label>
        <label htmlFor="streak-target">WEEKLY TRAINING-DAY TARGET</label>
        <input
          id="streak-target"
          type="number"
          min="1"
          max="7"
          disabled={!override}
          value={target}
          placeholder={String((customDays ? selectedDays.length : planDays?.length) || '')}
          onChange={(e) => setTarget(e.target.value)}
        />
        <p className="muted">
          {override
            ? 'Choose 1–7 distinct training dates per week.'
            : customDays
              ? `Selected weekdays: ${selectedDays.length} training days per week.`
              : planDays?.length
                ? `Program schedule: ${planDays.length} training days in this cycle week.`
                : 'Select training weekdays or set an explicit target; unspecified frequency is not invented.'}
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!customDays}
            onChange={(e) => {
              setCustomDays(!e.target.checked);
              if (e.target.checked) setDays(planDays || []);
            }}
          />
          Use the program's training weekdays
        </label>
        <div className="streak-weekday-controls" role="group" aria-label="Training weekdays">
          {WEEKDAYS.map((day, index) => (
            <label key={day}>
              <input
                type="checkbox"
                aria-label={day}
                checked={selectedDays.includes(index)}
                onChange={(e) => {
                  setCustomDays(true);
                  setDays(
                    e.target.checked
                      ? [...selectedDays, index].sort((a, b) => a - b)
                      : selectedDays.filter((d) => d !== index),
                  );
                }}
              />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
        <p className="muted">
          All other days are rest days. A missed planned date can be made up on any other date in
          the same week. These reminders do not change workout templates or carousel scheduling.
        </p>
        {cycles.length > 1 && (
          <>
            <label htmlFor="streak-cycle">THIS CALENDAR WEEK USES PROGRAM WEEK</label>
            <select
              id="streak-cycle"
              value={selectedCycle}
              onChange={(e) => setCycle(Number(e.target.value))}
            >
              {cycles.map((n) => (
                <option key={n} value={n}>
                  Week {n}
                </option>
              ))}
            </select>
          </>
        )}
        {active?.review && (
          <p className="notice">
            This plan needs review in Settings. You can still set an explicit weekly target;
            completed-day credit does not require program ownership.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="full"
          disabled={busy}
          onClick={() => {
            if (
              override &&
              (!Number.isInteger(Number(target)) || Number(target) < 1 || Number(target) > 7)
            ) {
              setError('Set a weekly target of 1–7 training days.');
              return;
            }
            setError('');
            change((d) =>
              configureStreak(
                d,
                {
                  target: override ? Number(target) : null,
                  weekdays: customDays ? selectedDays : null,
                  cycleWeek: selectedCycle !== cycle ? selectedCycle : undefined,
                },
                now,
              ),
            );
          }}
        >
          Save streak settings
        </button>
      </details>
      <section className="card" aria-label="Achievement evolution collection">
        <h2>Achievement evolution</h2>
        <p className="muted">
          Milestones stay earned after missed weeks. Corrected history is rechecked.
        </p>
        <div className="achievement-collection">
          {STREAK_LEVELS.map((l) => {
            const award = s.awards.find((a) => a.id === l.id),
              unlocked = l.weeks === 0 || !!award?.valid,
              name = artworkFor(l).name;
            return (
              <article
                key={l.id}
                className={`achievement-tile ${unlocked ? 'unlocked' : 'locked'}`}
                aria-label={`${name} · ${unlocked ? 'Unlocked' : 'Locked'}`}
                title={award ? `Earned week ${award.earnedWeek}` : name}
              >
                <StreakIcon level={l} />
                <h3>{name}</h3>
                <span>{l.weeks ? `${l.weeks} weeks` : 'Starting equipment'}</span>
                <small>
                  {unlocked
                    ? award
                      ? 'Unlocked'
                      : 'Starter'
                    : award
                      ? 'History corrected'
                      : 'Not yet unlocked'}
                </small>
              </article>
            );
          })}
        </div>
      </section>
      <section
        className={`card secret-achievement ${secret ? 'unlocked' : 'locked'}`}
        aria-label="Secret achievement"
        data-unlocked={secret}
      >
        <h2>Secret achievement</h2>
        <SecretStreakIcon longest={report.longest} />
        <p className="eyebrow">{secret ? 'UNLOCKED' : 'LOCKED'}</p>
        <p className="muted">
          {secret
            ? 'Earned with a verified 52-week streak. Yours to keep after missed weeks.'
            : `${SECRET_WEEKS} consecutive qualifying training weeks. The reward stays hidden until earned.`}
        </p>
      </section>
      <section className="card streak-history" aria-label="Weekly streak history">
        <h2>Previous weeks</h2>
        {[...report.weeks]
          .reverse()
          .slice(0, historyLimit)
          .map((w) => (
            <details key={w.week} className="streak-week">
              <summary>
                <span>
                  {w.week} — {w.chosen?.completed || 0}/{w.chosen?.goal.target ?? '?'}
                </span>
                <b className={`week-status ${w.status}`}>
                  {w.status === 'success'
                    ? 'Complete'
                    : w.status === 'pending'
                      ? 'In progress'
                      : w.status === 'failed'
                        ? 'Missed'
                        : 'Target unspecified'}
                </b>
              </summary>
              {(w.chosen ? [w.chosen] : []).map((g) => (
                <div key={g.goal.id} className="week-goal">
                  <p>
                    <b>{g.goal.name}</b>
                    {g.goal.showCycle ? ` · Program Week ${g.goal.cycleWeek}` : ''} · {g.completed}/
                    {g.goal.target ?? 'Unspecified'}
                  </p>
                  <TrainingWeekCalendar days={g.days} />
                  <p className="muted">
                    {g.goal.target === null
                      ? 'Weekly target not specified.'
                      : `${Math.max(0, g.goal.target - g.completed)} more distinct training days needed.`}
                  </p>
                </div>
              ))}
            </details>
          ))}
        {historyLimit < report.weeks.length && (
          <button className="full" onClick={() => setHistoryLimit((n) => n + 12)}>
            Show 12 more weeks
          </button>
        )}
        <p className="muted">
          Recent calendar weeks and all older recorded training weeks are retained. Empty calendar
          gaps break the streak; their requirements are covered by saved schedule periods.
        </p>
      </section>
      <details className="card">
        <summary>How Strength Streak works</summary>
        <p className="muted">
          Each properly finished, saved workout qualifies unless excluded as practice/test,
          cancelled or abandoned. Exercise names, templates, skipped sets and changed prescriptions
          are not checked. Multiple workouts on one date earn one training-day credit.
        </p>
        <p className="muted">
          Completion date determines the Monday–Sunday week in Europe/Vienna. Meet the weekly target
          using any distinct dates, including rest days or make-ups. Rest days alone add no credit.
          A missed past week breaks the streak; an unfinished current week preserves it.
        </p>
        <p className="muted">
          Existing history is recalculated under these rules without changing records.{' '}
          {report.ignored} saved records are currently excluded, unfinished or missing a valid
          completion time.
        </p>
      </details>
    </div>
  );
}
