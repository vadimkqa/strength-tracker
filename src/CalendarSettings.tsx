import { useState } from 'react';
import type { Data } from './data';
import { currentProgram } from './programs';
import { scheduleMetadata } from './program-schedule';
import { configureCalendar } from './auto-selection';
import { WEEKDAYS } from './calendar';
export function CalendarSettings({
  data,
  change,
}: {
  data: Data;
  change: (fn: (d: Data) => Data) => void;
}) {
  const p = currentProgram(data)!;
  return (
    <CalendarProgramSettings
      key={`${p.id}:${JSON.stringify(p.calendar)}`}
      data={data}
      change={change}
    />
  );
}
function CalendarProgramSettings({
  data,
  change,
}: {
  data: Data;
  change: (fn: (d: Data) => Data) => void;
}) {
  const p = currentProgram(data)!,
    metadata = scheduleMetadata(p);
  const [date, setDate] = useState(p.calendar?.anchorDate || ''),
    [week, setWeek] = useState(p.calendar?.anchorWeek || metadata.cycles[0]?.week || 1),
    [enabled, setEnabled] = useState(p.calendar?.enabled ?? true),
    [days, setDays] = useState<Record<string, number>>(p.calendar?.days || {}),
    [error, setError] = useState('');
  return (
    <section className="card calendar-settings" aria-label="Calendar workout selection">
      <h2>Calendar workout selection</h2>
      <p className="muted">
        {p.name} · {data.streak?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone}
      </p>
      <p className="muted">
        Choose a date inside a known program week. Its Monday anchors the repeating calendar
        rotation. Weekdays come from your plan; missing assignments require your review.
      </p>
      <label className="checkbox-label">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Automatically suggest workouts
      </label>
      <label htmlFor="calendar-anchor">ROTATION ANCHOR DATE</label>
      <input
        id="calendar-anchor"
        type="date"
        value={date}
        min="1900-01-01"
        max="2199-12-31"
        onChange={(e) => setDate(e.target.value)}
      />
      <label htmlFor="calendar-anchor-week">PROGRAM WEEK CONTAINING THIS DATE</label>
      <select
        id="calendar-anchor-week"
        value={week}
        onChange={(e) => setWeek(Number(e.target.value))}
      >
        {metadata.cycles.map((c) => (
          <option key={c.week} value={c.week}>
            {metadata.explicitWeeks ? `Week ${c.week}` : 'Program schedule'}
          </option>
        ))}
      </select>
      <details>
        <summary>Review weekday assignments</summary>
        {metadata.cycles.flatMap((c) =>
          c.sessions.map((s) => (
            <label key={`${c.week}:${s.key}`}>
              {metadata.cycles.length > 1 ? `Week ${c.week} · ` : ''}
              {s.name}
              <select
                aria-label={`Weekday for week ${c.week} ${s.name}`}
                value={days[s.templateIds[0]] ?? s.day ?? ''}
                onChange={(e) => {
                  const next = { ...days };
                  for (const id of s.templateIds) {
                    if (e.target.value === '') delete next[id];
                    else next[id] = Number(e.target.value);
                  }
                  setDays(next);
                }}
              >
                <option value="">Unspecified</option>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )),
        )}
      </details>
      <p className="muted">
        Timezone is shared with PRs → Strength Streak. Corrections apply to current/future
        suggestions and streak requirements, never past saved requirements. Catch-up sessions remain
        in their original program cycle; streaks use the actual completion week.
      </p>
      {p.review && (
        <p className="notice">
          Review this program's ownership before enabling automatic selection.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="full"
        disabled={!!p.review || !metadata.cycles.length || !!data.active}
        onClick={() => {
          try {
            const config = {
              version: 1 as const,
              enabled,
              anchorDate: date,
              anchorWeek: week,
              days,
            };
            configureCalendar(data, config);
            change((d) => configureCalendar(d, config));
            setError('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Save calendar selection
      </button>
      {data.active && (
        <p className="muted">
          Finish or discard the active workout before changing its calendar anchor.
        </p>
      )}
    </section>
  );
}
