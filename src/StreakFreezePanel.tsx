import { useState } from 'react';
import { addDays, monday, validDate, WEEKDAYS } from './calendar';
import type { Data } from './data';
import type { WeekProgress } from './streak';
import {
  freezeCoverage,
  freezeStatus,
  updateFreezes,
  STREAK_TIME_ZONE,
  type FreezeChange,
  type RestRange,
} from './streak-freeze';

const monthLabel = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: 'UTC' });
const shortLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const dateValue = (date: string) => new Date(date + 'T12:00:00Z');
const short = (date: string) => shortLabel.format(dateValue(date));
export const restRangeLabel = (range: RestRange) => `${short(range.start)} – ${short(range.end)}`;

function shiftMonth(month: string, delta: number) {
  const date = dateValue(month);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}
function coverageLabel(range: RestRange) {
  const coverage = freezeCoverage(range);
  if (!coverage.protected) return 'No full weeks covered';
  return restRangeLabel({
    start: coverage.protectedFrom,
    end: addDays(coverage.protectedThrough, 6),
  });
}

export function StreakFreezePanel({
  data,
  today,
  weeks,
  busy,
  change,
}: {
  data: Data;
  today: string;
  weeks: WeekProgress[];
  busy: boolean;
  change: (fn: (d: Data) => Data) => void;
}) {
  const [draft, setDraft] = useState<RestRange | null>(null);
  const [editing, setEditing] = useState<string>();
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [review, setReview] = useState(false);
  const [decision, setDecision] = useState<{ type: 'end' | 'cancel'; id: string }>();
  const periods = (data.streak?.freezes || [])
    .filter((p) => !p.cancelled)
    .sort((a, b) => b.start.localeCompare(a.start));
  const coverage = draft?.end ? freezeCoverage(draft) : null;
  const overlaps =
    draft?.end &&
    periods.some((p) => p.id !== editing && p.start <= draft.end && draft.start <= p.end);
  const nextMonth = shiftMonth(month, 1);
  const firstDay = monday(month);
  const days: string[] = [];
  if (draft) {
    for (let d = firstDay; d <= addDays(nextMonth, -1); d = addDays(d, 1)) days.push(d);
    while (days.length % 7) days.push(addDays(days.at(-1)!, 1));
  }

  function open(range?: RestRange & { id: string }) {
    setEditing(range?.id);
    setDraft(range ? { start: range.start, end: range.end } : { start: '', end: '' });
    setMonth((range?.start || today).slice(0, 7) + '-01');
    setReview(false);
    setDecision(undefined);
  }

  function apply(action: FreezeChange) {
    change((d) => {
      if (!d.streak) throw Error('Strength Streak is unavailable.');
      const freezes = updateFreezes(d.streak.freezes || [], action, Date.now());
      setDraft(null);
      setDecision(undefined);
      setReview(false);
      return { ...d, streak: { ...d.streak, freezes } };
    });
  }
  function pick(date: string) {
    setDraft((range) =>
      !range?.start || range.end
        ? { start: date, end: '' }
        : date < range.start
          ? { start: date, end: range.start }
          : { start: range.start, end: date },
    );
    setReview(false);
  }
  return (
    <section className="card streak-freeze" aria-labelledby="streak-freeze-title">
      <h2 id="streak-freeze-title">Streak Freeze</h2>
      <p className="muted">
        Plan a rest period to carry your streak through full Monday–Sunday weeks. Each completed
        weekly target still adds a qualifying week.
      </p>
      {!draft && (
        <button disabled={busy} onClick={() => open()}>
          Plan rest period
        </button>
      )}
      {draft && (
        <div className="freeze-picker" aria-label="Rest period date range">
          <div className="freeze-endpoints">
            <div>
              <small>Start date</small>
              <strong>{draft.start ? short(draft.start) : 'Choose a date'}</strong>
            </div>
            <div>
              <small>End date</small>
              <strong>{draft.end ? short(draft.end) : 'Choose a date'}</strong>
            </div>
          </div>
          <div className="freeze-month">
            <button
              aria-label="Previous month"
              disabled={month <= today.slice(0, 7) + '-01'}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <strong aria-live="polite">{monthLabel.format(dateValue(month))}</strong>
            <button
              aria-label="Next month"
              disabled={!validDate(nextMonth)}
              onClick={() => setMonth(nextMonth)}
            >
              ›
            </button>
          </div>
          <div className="freeze-calendar" role="group" aria-label="Choose dates in Europe/Vienna">
            {WEEKDAYS.map((day) => (
              <small key={day} aria-label={day}>
                {day.slice(0, 2)}
              </small>
            ))}
            {days.map((day) => {
              const selected =
                day === draft.start ||
                day === draft.end ||
                (day > draft.start && day < draft.end && !!draft.start);
              const edge = day === draft.start || day === draft.end;
              return day.slice(0, 7) === month.slice(0, 7) ? (
                <button
                  key={day}
                  disabled={day < today || !validDate(day)}
                  aria-label={dayLabel.format(dateValue(day))}
                  aria-pressed={selected}
                  data-edge={edge || undefined}
                  aria-current={day === today ? 'date' : undefined}
                  onClick={() => pick(day)}
                >
                  {Number(day.slice(-2))}
                </button>
              ) : (
                <span key={day} aria-hidden="true" />
              );
            })}
          </div>
          <p className="muted" aria-live="polite">
            {!draft.start || draft.end
              ? 'Select a start date, then an end date.'
              : 'Select the last day of your rest period.'}{' '}
            Both dates are included in Europe/Vienna.
          </p>
          {coverage && (
            <div className="freeze-coverage" role="status">
              <strong>
                {coverage.touched} calendar {coverage.touched === 1 ? 'week' : 'weeks'} affected ·{' '}
                {coverage.protected} fully covered
              </strong>
              <p>Protected weeks: {coverageLabel(draft)}.</p>
              {coverage.touched > coverage.protected && (
                <p className="muted">
                  Partial weeks keep their normal training target and can still break a streak. Your
                  dates will be saved as selected.
                </p>
              )}
              {overlaps && <p className="notice">This range overlaps a saved rest period.</p>}
            </div>
          )}
          {review && (
            <p>
              Save {restRangeLabel(draft)}? Fully covered weeks preserve your streak when the weekly
              target is unmet.
            </p>
          )}
          <div className="freeze-actions">
            <button
              className="primary"
              disabled={busy || !coverage || !!overlaps || draft.start < today}
              onClick={() =>
                review ? apply({ type: 'save', range: draft, id: editing }) : setReview(true)
              }
            >
              {review ? 'Confirm rest period' : 'Review rest period'}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setReview(false);
              }}
            >
              Close picker
            </button>
          </div>
        </div>
      )}
      {periods.length > 0 && (
        <ul className="freeze-periods" aria-label="Saved rest periods">
          {periods.map((period) => {
            const status = freezeStatus(period, today);
            const coverage = freezeCoverage(period);
            const used = weeks.filter(
              (w) =>
                w.week >= coverage.protectedFrom &&
                w.week <= coverage.protectedThrough &&
                w.status === 'frozen' &&
                addDays(w.week, 6) < today,
            ).length;
            return (
              <li key={period.id}>
                <strong>
                  {status === 'Active' && (
                    <span className="freeze-flake" aria-hidden="true">
                      ❄{' '}
                    </span>
                  )}
                  {status}
                </strong>
                <span>{restRangeLabel(period)}</span>
                <small>
                  {coverage.protected} full {coverage.protected === 1 ? 'week' : 'weeks'} covered
                  {used > 0 ? ` · ${used} protected so far` : ''}
                </small>
                {decision?.id === period.id ? (
                  <>
                    <p>
                      {decision.type === 'end'
                        ? `Keep this rest period through ${short(today)} and resume normal streak rules tomorrow? Only full Monday–Sunday weeks still inside the shortened range will be protected. Weeks covered after the change: ${coverageLabel({ start: period.start, end: today })}. Any uncovered week needs its usual target.`
                        : 'Cancel this upcoming rest period? Its weeks will follow the normal streak rules.'}
                    </p>
                    <div className="freeze-actions">
                      <button disabled={busy} onClick={() => apply(decision)}>
                        {decision.type === 'end' ? 'Confirm early end' : 'Confirm cancellation'}
                      </button>
                      <button disabled={busy} onClick={() => setDecision(undefined)}>
                        Keep rest period
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="freeze-actions">
                    {status === 'Upcoming' && (
                      <>
                        <button disabled={busy} onClick={() => open(period)}>
                          Edit dates
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setDraft(null);
                            setDecision({ type: 'cancel', id: period.id });
                          }}
                        >
                          Cancel rest period
                        </button>
                      </>
                    )}
                    {status === 'Active' && today < period.end && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setDraft(null);
                          setDecision({ type: 'end', id: period.id });
                        }}
                      >
                        End after today
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
