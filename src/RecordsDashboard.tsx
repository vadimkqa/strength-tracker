import { useEffect, useMemo, useRef, useState } from 'react';
import type { Data } from './data';
import { moveFavorite, toggleFavorite } from './record-preferences';
import {
  chartPoints,
  exerciseRecords,
  selectRecords,
  type ChartMetric,
  type ChartPoint,
  type ChartRange,
  type ExerciseRecord,
  type Performance,
  type RecordFilter,
  type RecordSort,
  type SessionFilter,
} from './records';
const number = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(n);
const date = (n: number) =>
  new Date(n).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
function load(p: Performance) {
  return `${number(p.weight)} kg${p.kind === 'assisted' ? ' assistance' : p.kind === 'bodyweight' ? ' added' : p.weight === 0 ? ' logged load' : ''} × ${p.reps} reps`;
}
function geometry(points: ChartPoint[], width: number, height: number, pad: number) {
  const first = points[0]?.at || 0,
    last = points.at(-1)?.at || first;
  const values = points.map((p) => p.value),
    low = Math.min(...values),
    high = Math.max(...values);
  return points.map((p) => ({
    x: last === first ? width / 2 : pad + ((p.at - first) / (last - first)) * (width - pad * 2),
    y:
      high === low
        ? height / 2
        : height - pad - ((p.value - low) / (high - low)) * (height - pad * 2),
  }));
}
function Sparkline({ record }: { record: ExerciseRecord }) {
  const points = chartPoints(record, 'weight');
  if (points.length < 2) return <span className="pr-spark-empty">—</span>;
  return (
    <svg
      className="pr-spark"
      viewBox="0 0 60 26"
      role="img"
      aria-label={`${record.name}: top logged weight trend across ${points.length} sessions`}
    >
      <polyline
        points={geometry(points, 60, 26, 3)
          .map((p) => `${p.x},${p.y}`)
          .join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
const metricLabels: Record<ChartMetric, string> = {
  estimate: 'Estimated 1RM',
  weight: 'Top completed-set weight',
  volume: 'Total exercise training volume',
};
function ProgressChart({ record, now }: { record: ExerciseRecord; now: number }) {
  const [metric, setMetric] = useState<ChartMetric>('estimate'),
    [range, setRange] = useState<ChartRange>('all'),
    [chosen, setChosen] = useState<string | null>(null);
  const points = chartPoints(record, metric, range, now),
    positions = geometry(points, 320, 150, 14);
  const found = points.findIndex((p) => p.workoutId === chosen);
  const selected = found < 0 ? Math.max(0, points.length - 1) : found,
    point = points[selected];
  function choose(index: number) {
    setChosen(points[index]?.workoutId || null);
  }
  return (
    <section className="card pr-chart" aria-label="Exercise progress chart">
      <h2>Progress over time</h2>
      <label htmlFor="pr-metric">Chart metric</label>
      <select
        id="pr-metric"
        value={metric}
        onChange={(e) => {
          setMetric(e.target.value as ChartMetric);
          setChosen(null);
        }}
      >
        {Object.entries(metricLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <div className="pr-time-filters" role="group" aria-label="Chart time range">
        {(
          [
            ['1', '1 month'],
            ['3', '3 months'],
            ['6', '6 months'],
            ['12', '1 year'],
            ['all', 'All time'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={range === key}
            className={range === key ? 'chosen' : ''}
            onClick={() => {
              setRange(key);
              setChosen(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {point ? (
        <>
          <output className="pr-chart-value" aria-live="polite">
            {date(point.at)} · {number(point.value)} {metric === 'volume' ? 'kg·reps' : 'kg'}
            {metric === 'estimate' ? ' estimated' : ''}
          </output>
          <div className="pr-chart-bounds">
            <span>
              Range {number(Math.min(...points.map((p) => p.value)))}–
              {number(Math.max(...points.map((p) => p.value)))}
            </span>
            <span>{metric === 'volume' ? 'kg·reps' : 'kg'}</span>
          </div>
          <svg
            className="pr-chart-plot"
            viewBox="0 0 320 150"
            role="img"
            aria-label={`${metricLabels[metric]}, ${points.length} logged sessions. Use the session controls below to inspect values.`}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect(),
                x = ((e.clientX - rect.left) / rect.width) * 320;
              let nearest = 0;
              positions.forEach((p, i) => {
                if (Math.abs(p.x - x) < Math.abs(positions[nearest].x - x)) nearest = i;
              });
              choose(nearest);
            }}
          >
            {points.length > 1 && (
              <polyline
                points={positions.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            )}
            {positions.map((p, i) => (
              <circle
                key={points[i].workoutId}
                cx={p.x}
                cy={p.y}
                r={i === selected ? 5 : 3}
                fill="currentColor"
              />
            ))}
          </svg>
          <div className="pr-chart-bounds">
            <span>{date(points[0].at)}</span>
            <span>{date(points.at(-1)!.at)}</span>
          </div>
          <div className="pr-chart-controls">
            <button
              disabled={selected === 0}
              onClick={() => choose(selected - 1)}
              aria-label="Previous chart session"
            >
              ←
            </button>
            <label>
              Logged session
              <select
                aria-label="Selected chart session"
                value={point.workoutId}
                onChange={(e) => setChosen(e.target.value)}
              >
                {points.map((p, i) => (
                  <option key={p.workoutId} value={p.workoutId}>
                    {i + 1} · {date(p.at)} · {number(p.value)}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={selected === points.length - 1}
              onClick={() => choose(selected + 1)}
              aria-label="Next chart session"
            >
              →
            </button>
          </div>
          <p className="muted">
            {points.length === 1
              ? 'One logged session; no trend yet.'
              : 'Dots are logged sessions; lines connect observations, not missing weeks.'}
          </p>
        </>
      ) : (
        <p className="muted" role="status">
          No eligible logged values in this range. Try another metric or time range.
        </p>
      )}
      <p className="muted">
        Estimated 1RM uses Epley: weight × (1 + reps ÷ 30), for 2–10 reps; a single uses its logged
        weight. Estimates are not measured maxes. No estimates for zero load, bodyweight or assisted
        exercises.
      </p>
    </section>
  );
}
function Detail({ record, now, back }: { record: ExerciseRecord; now: number; back: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);
  const first = record.history[0],
    last = record.history.at(-1)!,
    assisted = first.kind === 'assisted';
  return (
    <div className="pr-detail">
      <button className="pr-back" onClick={back}>
        ← All records
      </button>
      <div className="page-title">
        <p className="eyebrow">YOUR EXERCISE HISTORY</p>
        <h1 ref={heading} tabIndex={-1}>
          {record.name}
        </h1>
        <p>
          {record.history.length} completed sets ·{' '}
          {record.names.length > 1
            ? `Saved names: ${record.names.join(', ')}`
            : 'Only this exercise is compared.'}
        </p>
      </div>
      <dl className="pr-summary">
        <div>
          <dt>{assisted ? 'Highest logged assistance' : 'Heaviest completed weight'}</dt>
          <dd>{load(record.best)}</dd>
        </div>
        <div>
          <dt>Best estimated 1RM</dt>
          <dd>
            {record.estimated
              ? `${number(record.estimated.estimate!)} kg · estimated`
              : 'Not estimated'}
          </dd>
        </div>
        <div>
          <dt>Best completed-set volume</dt>
          <dd>
            {record.volume
              ? `${number(record.volume.volume!)} kg·reps · ${load(record.volume)}`
              : 'Not calculated for assistance'}
          </dd>
        </div>
        <div>
          <dt>First recorded performance</dt>
          <dd>
            {load(first)}
            <small>{date(first.at)}</small>
          </dd>
        </div>
        <div>
          <dt>Most recent recorded performance</dt>
          <dd>
            {load(last)}
            <small>{date(last.at)}</small>
          </dd>
        </div>
      </dl>
      <p className="muted">
        {assisted
          ? 'Assistance is not resistance. Higher assistance is not a weight or strength PR; volume and estimated strength are not calculated.'
          : first.kind === 'bodyweight'
            ? 'Weights represent logged added load only. Body mass is unknown and is never added to volume or estimated strength.'
            : 'Volume is logged kg × reps. Zero kg remains zero; no body mass or resistance is inferred.'}{' '}
        Rep PRs mean more reps at the same logged load. Weight PRs and estimated strength PRs are
        tracked separately.
      </p>
      <ProgressChart key={record.id} record={record} now={now} />
      <section className="pr-rep-bests">
        <h2>Best performance by rep count</h2>
        <p className="muted">
          {assisted
            ? 'Lowest logged assistance at each rep count.'
            : 'Heaviest completed load at each rep count.'}
        </p>
        <ul>
          {record.byReps.map((p) => (
            <li key={p.reps}>
              <strong>{p.reps} reps</strong>
              <span>
                {number(p.weight)} kg{assisted ? ' assistance' : ''}
              </span>
              <small>{date(p.at)}</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="pr-history">
        <h2>Full chronological history</h2>
        <p className="muted">Oldest first · finished sessions · valid completed sets only.</p>
        <ol>
          {record.history.map((p, i) => (
            <li key={`${p.workoutId}-${i}`}>
              <div>
                <strong>{load(p)}</strong>
                <span>
                  {date(p.at)} ·{' '}
                  {p.intensity === 'unknown'
                    ? 'Intensity not saved'
                    : p.intensity === 'hard'
                      ? 'Hard'
                      : 'Easy'}
                </span>
                <small>{p.workoutName}</small>
              </div>
              <div className="pr-badges">
                {p.prs.weight && <span>Weight PR</span>}
                {p.prs.reps && <span>Rep PR</span>}
                {p.prs.strength && <span>Estimated strength PR</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
export function RecordsDashboard({
  data,
  change,
  now,
  busy,
}: {
  data: Data;
  change: (fn: (d: Data) => Data) => void;
  now: number;
  busy: boolean;
}) {
  const [filter, setFilter] = useState<RecordFilter>('all'),
    [sort, setSort] = useState<RecordSort>('alphabetical'),
    [search, setSearch] = useState(''),
    [intensity, setIntensity] = useState<SessionFilter>('all'),
    [selected, setSelected] = useState<string | null>(null),
    [reordering, setReordering] = useState(false);
  const records = useMemo(
      () => exerciseRecords(data.history, intensity),
      [data.history, intensity],
    ),
    favorites = data.prPreferences?.favorites || [],
    visible = selectRecords(records, favorites, filter, sort, search, now),
    detail = records.find((r) => r.id === selected);
  const prefs = (fn: (favorites: string[]) => string[]) =>
    change((d) => ({
      ...d,
      prPreferences: { ...d.prPreferences, favorites: fn(d.prPreferences?.favorites || []) },
    }));
  const sessionControl = (
    <label className="pr-session-control" htmlFor="pr-intensity">
      Session intensity
      <select
        aria-label="Session intensity"
        id="pr-intensity"
        value={intensity}
        onChange={(e) => setIntensity(e.target.value as SessionFilter)}
      >
        <option value="all">All sessions</option>
        <option value="easy">Easy sessions</option>
        <option value="hard">Hard sessions</option>
      </select>
    </label>
  );
  return (
    <div className="pr-dashboard">
      {selected && sessionControl}
      {selected ? (
        detail ? (
          <Detail record={detail} now={now} back={() => setSelected(null)} />
        ) : (
          <>
            <button onClick={() => setSelected(null)}>← All records</button>
            <p role="status" className="muted">
              No completed sets for this exercise with the selected intensity. Choose All sessions
              to see its history.
            </p>
          </>
        )
      ) : (
        <>
          <div className="page-title">
            <h1>Personal records.</h1>
            <p>Your priorities. Your progress.</p>
          </div>
          <div className="pr-filters" role="group" aria-label="Exercise filters">
            {(
              [
                ['favorites', 'Favorites'],
                ['all', 'All exercises'],
                ['recent', 'Recent PRs'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                className={filter === key ? 'chosen' : ''}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label htmlFor="pr-search">Search exercises</label>
          <input
            type="search"
            id="pr-search"
            placeholder="Exercise name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <details className="pr-options">
            <summary>
              Sort & session filters ·{' '}
              {intensity === 'all'
                ? 'All sessions'
                : intensity === 'easy'
                  ? 'Easy sessions'
                  : 'Hard sessions'}
            </summary>
            <div className="pr-list-tools">
              {sessionControl}
              <label htmlFor="pr-sort">
                Sort exercises
                <select
                  aria-label="Sort exercises"
                  id="pr-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as RecordSort)}
                >
                  <option value="alphabetical">Alphabetical</option>
                  <option value="trained">Most recently trained</option>
                  <option value="achieved">Most recently achieved PR</option>
                </select>
              </label>
              <button aria-pressed={reordering} onClick={() => setReordering(!reordering)}>
                Reorder favorites
              </button>
            </div>
          </details>
          <p className="muted pr-list-note">
            Favorites stay first in your chosen order.
            {filter === 'recent' ? ' Recent PRs: improvements in the last month.' : ''}
          </p>
          {visible.length ? (
            <ul className="pr-list" aria-label="Exercise records">
              {visible.map((r) => {
                const favorite = favorites.includes(r.id),
                  index = favorites.indexOf(r.id);
                return (
                  <li key={r.id} className="pr-exercise-row">
                    <button
                      className="pr-star"
                      aria-label={`${favorite ? 'Unfavorite' : 'Favorite'} ${r.name}`}
                      aria-pressed={favorite}
                      disabled={busy}
                      onClick={() => prefs((ids) => toggleFavorite(ids, r.id))}
                    >
                      {favorite ? '★' : '☆'}
                    </button>
                    <button
                      className="pr-open"
                      onClick={() => setSelected(r.id)}
                      aria-label={`View records for ${r.name}`}
                    >
                      <span className="pr-row-copy">
                        <strong>{r.name}</strong>
                        <span className="record">{load(r.best)}</span>
                      </span>
                      <Sparkline record={r} />
                      <span aria-hidden="true">›</span>
                    </button>
                    {reordering && favorite && (
                      <div className="pr-reorder">
                        <button
                          aria-label={`Move ${r.name} up`}
                          disabled={busy || index === 0}
                          onClick={() => prefs((ids) => moveFavorite(ids, r.id, -1))}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${r.name} down`}
                          disabled={busy || index === favorites.length - 1}
                          onClick={() => prefs((ids) => moveFavorite(ids, r.id, 1))}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <section className="pr-empty" role="status">
              <h2>{records.length ? 'No matching exercises.' : 'Great things take reps.'}</h2>
              <p className="muted">
                {filter === 'favorites'
                  ? 'Star exercises in All exercises to choose your favorites.'
                  : filter === 'recent'
                    ? 'No improvements recorded in the last month. First observations establish a baseline.'
                    : records.length
                      ? 'Try another name or filter.'
                      : 'Log a set and finish your workout to earn your first record.'}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
