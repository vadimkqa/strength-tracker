import { useState } from 'react';
import { addDays, monday, validDate, WEEKDAYS } from './calendar';
import type { Data } from './data';
import { previewRestPeriod, type WeekProgress } from './streak';
import {
  earliestRestDate,
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
type PreviewWeek = ReturnType<typeof previewRestPeriod>[number];

function WeekReview({ weeks }: { weeks: PreviewWeek[] }) {
  const canProtect = weeks.filter((w) => w.protected && !w.success).length;
  function weekRow(w: PreviewWeek) {
    const dates = (days: PreviewWeek['covered']) => days.map((d) => short(d.date)).join(', ');
    return (
      <li key={w.week}>
        <strong>{restRangeLabel({ start: w.week, end: addDays(w.week, 6) })}</strong>
        <span>
          {w.success
            ? 'Weekly target met'
            : w.protected
              ? 'Streak protected by these dates'
              : 'Streak not protected by these dates'}
        </span>
        <small>
          Scheduled days covered:{' '}
          {w.covered.length ? dates(w.covered) : w.scheduleKnown ? 'None' : 'No saved weekdays'}.
        </small>
        {!w.success && !w.protected && (
          <small>
            {w.uncovered.length > 0 &&
              `Unfinished training outside the range: ${dates(w.uncovered)}. `}
            {!w.scheduleKnown
              ? 'Without a weekly schedule and target, protection requires the full week.'
              : w.remaining! > w.uncovered.length
                ? 'Covered dates and completed workouts leave part of the weekly target unmet.'
                : null}
          </small>
        )}
      </li>
    );
  }
  return (
    <>
      <strong>
        {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} affected · {canProtect}{' '}
        {canProtect === 1 ? 'week' : 'weeks'} protected
      </strong>
      <ul className="freeze-review-weeks">{weeks.slice(0, 3).map(weekRow)}</ul>
      {weeks.length > 3 && (
        <details>
          <summary>Show {weeks.length - 3} more weeks</summary>
          <ul className="freeze-review-weeks">{weeks.slice(3).map(weekRow)}</ul>
        </details>
      )}
    </>
  );
}

export function StreakFreezePanel({
  data,
  today,
  now,
  weeks,
  busy,
  change,
}: {
  data: Data;
  today: string;
  now: number;
  weeks: WeekProgress[];
  busy: boolean;
  change: (fn: (d: Data) => Data) => void;
}) {
  const [draft, setDraft] = useState<RestRange | null>(null);
  const [editing, setEditing] = useState<string>();
  const [endpoint, setEndpoint] = useState<'start' | 'end'>('start');
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [review, setReview] = useState(false);
  const [decision, setDecision] = useState<{ type: 'end' | 'cancel'; id: string }>();
  const periods = (data.streak?.freezes || [])
    .filter((p) => !p.cancelled)
    .sort((a, b) => b.start.localeCompare(a.start));
  const earliest = earliestRestDate(today);
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  const preview = (range: RestRange) => previewRestPeriod(data, range, byWeek, now);
  const coverage = draft?.end ? preview(draft) : null;
  const original = periods.find((p) => p.id === editing);
  const validStart = !!draft && (draft.start >= earliest || draft.start === original?.start);
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
    setEndpoint('start');
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
  function chooseEndpoint(which: 'start' | 'end') {
    setEndpoint(which);
    const date = draft?.[which];
    if (date) setMonth(date.slice(0, 7) + '-01');
  }

  function pick(date: string) {
    if (!draft) return;
    if (endpoint === 'start') {
      setDraft({ start: date, end: draft.end >= date ? draft.end : '' });
      setEndpoint('end');
    } else {
      setDraft({ ...draft, end: date });
      setEndpoint('start');
    }
    setReview(false);
  }
  return (
    <section className="card streak-freeze" aria-labelledby="streak-freeze-title">
      <h2 id="streak-freeze-title">Streak Freeze</h2>
      <p className="muted">
        Plan time off for the current week, either of the previous two weeks, or future dates.
      </p>
      {!draft && (
        <button disabled={busy} onClick={() => open()}>
          Plan rest period
        </button>
      )}
      {draft && (
        <div className="freeze-picker" aria-label="Rest period date range">
          <div className="freeze-endpoints">
            <button aria-pressed={endpoint === 'start'} onClick={() => chooseEndpoint('start')}>
              <small>Start date</small>
              <strong>{draft.start ? short(draft.start) : 'Choose a date'}</strong>
            </button>
            <button
              disabled={!draft.start}
              aria-pressed={endpoint === 'end'}
              onClick={() => chooseEndpoint('end')}
            >
              <small>End date</small>
              <strong>{draft.end ? short(draft.end) : 'Choose a date'}</strong>
            </button>
          </div>
          <div className="freeze-month">
            <button
              aria-label="Previous month"
              disabled={month <= earliest.slice(0, 7) + '-01'}
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
                  disabled={
                    day < earliest || !validDate(day) || (endpoint === 'end' && day < draft.start)
                  }
                  data-day={day < today ? 'past' : day === today ? 'today' : 'future'}
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
          <p className="muted freeze-key">
            <span>Past dates</span>
            <span>Today</span>
            <span>Future dates</span>
          </p>
          <p className="muted" aria-live="polite">
            {endpoint === 'start'
              ? 'Choose a start date.'
              : 'Choose an end date on or after the start.'}{' '}
            Both dates are included in Europe/Vienna.
          </p>
          {coverage && (
            <div className="freeze-coverage" role="status">
              <p>Selected rest dates: {restRangeLabel(draft)}.</p>
              <WeekReview weeks={coverage} />
              <p className="muted">
                Protection follows the saved schedule and workouts. A completed weekly target still
                counts as a qualifying week.
              </p>
              {overlaps && <p className="notice">This range overlaps a saved rest period.</p>}
            </div>
          )}
          {review && (
            <p>
              Save the selected rest dates? Review the weekly protection above before confirming.
            </p>
          )}
          <div className="freeze-actions">
            <button
              className="primary"
              disabled={busy || !coverage || !!overlaps || !validStart}
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
            const coverage = preview(period);
            const protectedWeeks = coverage.filter((w) => w.protected && !w.success).length;
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
                  {protectedWeeks
                    ? `${protectedWeeks} ${protectedWeeks === 1 ? 'week' : 'weeks'} protected`
                    : 'No weeks protected by these dates'}
                </small>
                {decision?.id === period.id ? (
                  <>
                    {decision.type === 'end' ? (
                      <>
                        <p>
                          Keep this rest period through {short(today)}? Shortening it can remove
                          protection from weeks with outstanding training days.
                        </p>
                        <WeekReview weeks={preview({ start: period.start, end: today })} />
                      </>
                    ) : (
                      <p>
                        Cancel this rest period? Removing protection can break your streak if a
                        covered week missed its target.
                      </p>
                    )}
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
                    {period.end >= earliest && (
                      <button disabled={busy} onClick={() => open(period)}>
                        Edit dates
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => {
                        setDraft(null);
                        setDecision({ type: 'cancel', id: period.id });
                      }}
                    >
                      Cancel rest period
                    </button>
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
