import { useState, useEffect } from 'react';
import type { Data } from './data';
import { currentProgram, programWeeks } from './programs';
import { STREAK_LEVELS, calculateStreak, levelFor, configureStreak, validTimeZone } from './streak';
import { StreakIcon } from './StreakIcon';
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
  const [zone, setZone] = useState(s.timeZone),
    [target, setTarget] = useState(String(s.targets[active?.id || ''] || '')),
    [selectedCycle, setCycle] = useState(cycle),
    [error, setError] = useState(''),
    [historyLimit, setHistoryLimit] = useState(12);
  useEffect(() => setCycle(cycle), [cycle, active?.id]);
  const level = levelFor(report.current),
    next = STREAK_LEVELS.find((l) => l.weeks > report.longest);
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
        <StreakIcon level={level} />
        <p className="eyebrow">{level.name}</p>
        <strong className="streak-count" aria-label="Current streak">
          {report.current}
          <small>{report.current === 1 ? ' week' : ' weeks'}</small>
        </strong>
        <p className="muted">
          Longest verified streak:{' '}
          <b data-testid="longest-streak">
            {report.longest} {report.longest === 1 ? 'week' : 'weeks'}
          </b>
        </p>
        {next ? (
          <>
            <progress
              max={next.weeks}
              value={report.current}
              aria-label={`Progress toward ${next.name}`}
            />
            <p className="muted">
              {next.weeks - report.current} more successful{' '}
              {next.weeks - report.current === 1 ? 'week' : 'weeks'} to {next.name} · {next.weeks}w
            </p>
          </>
        ) : (
          <p className="muted">All achievements are in your collection.</p>
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
        {current?.goals.length && current.goals.length > 1 ? (
          <p className="muted">
            This week has saved alternative requirements. Fully complete one goal; partial plans do
            not combine.
          </p>
        ) : null}
      </section>
      <details className="card streak-settings">
        <summary>Streak settings and rotation</summary>
        <p className="muted">
          Active program: {active?.name}. Schedule changes apply to this week onward; past
          requirements stay frozen. Existing current-week goals remain eligible.
        </p>
        <label htmlFor="streak-zone">CALENDAR TIMEZONE</label>
        <input
          id="streak-zone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          list="streak-zones"
        />
        <datalist id="streak-zones">
          {[
            ...new Set([
              s.timeZone,
              'Europe/Vienna',
              'UTC',
              'America/New_York',
              'Europe/London',
              'Asia/Tokyo',
            ]),
          ].map((z) => (
            <option value={z} key={z} />
          ))}
        </datalist>
        <p className="muted">
          Changing timezone reassigns workout completion dates to calendar weeks. Saved weekly
          requirements remain fixed.
        </p>
        {last?.mode === 'manual' && (
          <>
            <label htmlFor="streak-target">WEEKLY WORKOUT TARGET</label>
            <input
              id="streak-target"
              type="number"
              min="1"
              max="14"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <p className="muted">
              No weekly frequency is specified in this program. Count distinct workout/day
              occurrences; repeating the same session on the same date counts once. Earlier
              unconfigured weeks stay unconfigured.
            </p>
          </>
        )}
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
            Review program ownership in Settings before enabling its streak goal.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="full"
          disabled={busy}
          onClick={() => {
            if (!validTimeZone(zone)) {
              setError('Enter a valid IANA timezone, such as Europe/Vienna.');
              return;
            }
            if (
              last?.mode === 'manual' &&
              (!Number.isInteger(Number(target)) || Number(target) < 1 || Number(target) > 14)
            ) {
              setError('Set a weekly target of 1–14 workouts.');
              return;
            }
            if (
              zone !== s.timeZone &&
              !confirm(
                'Recalculate calendar-week membership in this timezone? Weekly requirements remain saved; corrected streaks and achievements will be revalidated.',
              )
            )
              return;
            setError('');
            change((d) =>
              configureStreak(
                d,
                {
                  timeZone: zone,
                  target: last?.mode === 'manual' ? Number(target) : undefined,
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
              unlocked = l.weeks === 0 || !!award?.valid;
            return (
              <article
                key={l.id}
                className={`achievement-tile ${unlocked ? 'unlocked' : 'locked'}`}
                aria-label={`${l.name} · ${unlocked ? 'Unlocked' : 'Locked'}`}
                title={award ? `Earned week ${award.earnedWeek}` : l.name}
              >
                <StreakIcon level={l} />
                <h3>{l.name}</h3>
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
              {w.goals.map((g) => (
                <div key={g.goal.id} className="week-goal">
                  <p>
                    <b>{g.goal.name}</b>
                    {g.goal.showCycle ? ` · Program Week ${g.goal.cycleWeek}` : ''} · {g.completed}/
                    {g.goal.target ?? 'Unspecified'}
                  </p>
                  {g.goal.mode === 'scheduled' ? (
                    <ul>
                      {g.sessions.map((v, i) => (
                        <li key={i}>
                          {v.complete ? '✓' : '○'} {v.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <p className="muted">
                        {g.goal.target === null
                          ? 'Weekly target not specified.'
                          : `${Math.max(0, g.goal.target - g.completed)} qualifying workouts remaining.`}
                      </p>
                      <ul>
                        {g.sessions.map((v, i) => (
                          <li key={i}>✓ {v.name}</li>
                        ))}
                      </ul>
                    </>
                  )}
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
          A saved workout counts only after every required exercise and set has a valid completed
          log. Optional exercises may be skipped. Required skips, unfinished sets, test/practice
          exclusions, abandoned sessions and unsaved active sessions do not count. Completion time
          determines the Monday–Sunday week in your configured timezone.
        </p>
        <p className="muted">
          Scheduled sessions must each be completed once; repeats and extra workouts cannot replace
          a missing session. For unscheduled targets, the same workout on the same local day counts
          once. A missed past week breaks the streak; the current unfinished week does not. Full
          completion of either plan qualifies during a plan-switch week. Requirements are saved
          separately from the editable plan.
        </p>
        <p className="muted">
          Earlier history is matched by program ID or an unambiguous exact template ID and uses
          retained program schedules. Ambiguous legacy ownership is excluded. {report.ignored}{' '}
          historical records currently have invalid logs, explicit exclusions or unresolved
          ownership.
        </p>
      </details>
    </div>
  );
}
