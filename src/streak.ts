import { localDate, calendarWeek, addDays, validTimeZone } from './calendar';
export { localDate, calendarWeek, addDays, validTimeZone } from './calendar';
import { scheduleMetadata } from './program-schedule';
import type { Data, Workout } from './data';
import { currentProgram, migratePrograms, programView, type SavedProgram } from './programs';
import { weekdayNumber, WEEKDAYS } from './calendar';
export const STREAK_LEVELS = [
  {
    id: 'basic',
    weeks: 0,
    name: 'Basic dumbbell',
    type: 'dumbbell',
    plates: 0,
    material: 'purple',
  },
  {
    id: 'first-plates',
    weeks: 2,
    name: 'Plated dumbbell',
    type: 'dumbbell',
    plates: 1,
    material: 'purple',
  },
  {
    id: 'growing',
    weeks: 4,
    name: 'Strength dumbbell',
    type: 'dumbbell',
    plates: 2,
    material: 'purple',
  },
  {
    id: 'heavy',
    weeks: 6,
    name: 'Heavy dumbbell',
    type: 'dumbbell',
    plates: 3,
    material: 'purple',
  },
  {
    id: 'barbell',
    weeks: 8,
    name: 'First barbell',
    type: 'barbell',
    plates: 1,
    material: 'purple',
  },
  {
    id: 'double',
    weeks: 10,
    name: 'Double-plate barbell',
    type: 'barbell',
    plates: 2,
    material: 'purple',
  },
  {
    id: 'triple',
    weeks: 12,
    name: 'Triple-plate barbell',
    type: 'barbell',
    plates: 3,
    material: 'purple',
  },
  {
    id: 'silver',
    weeks: 16,
    name: 'Silver barbell',
    type: 'barbell',
    plates: 3,
    material: 'silver',
  },
  { id: 'gold', weeks: 24, name: 'Gold barbell', type: 'barbell', plates: 3, material: 'gold' },
  {
    id: 'diamond',
    weeks: 36,
    name: 'Diamond barbell',
    type: 'barbell',
    plates: 4,
    material: 'diamond',
  },
  {
    id: 'crystal',
    weeks: 52,
    name: 'Crystal barbell',
    type: 'barbell',
    plates: 4,
    material: 'crystal',
  },
] as const;
export type StreakLevel = (typeof STREAK_LEVELS)[number];
export const levelFor = (weeks: number) =>
  [...STREAK_LEVELS].reverse().find((l) => l.weeks <= weeks)!;
export interface StreakSession {
  key: string;
  name: string;
  templateIds: string[];
}
export interface StreakCycle {
  weekdays?: number[] | null;
  week: number;
  sessions: StreakSession[];
}
export interface StreakPolicy {
  explicitWeeks?: boolean;
  id: string;
  programId: string;
  name: string;
  fromWeek: string;
  anchorWeek: string;
  anchorCycle: number;
  signature: string;
  mode: 'scheduled' | 'manual';
  target: number | null;
  cycles: StreakCycle[];
}
export interface WeekGoal {
  weekdays?: number[] | null;
  showCycle?: boolean;
  id: string;
  programId: string;
  name: string;
  cycleWeek: number;
  mode: 'scheduled' | 'manual';
  target: number | null;
  sessions: StreakSession[];
}
export interface StreakWeek {
  week: string;
  goals: WeekGoal[];
}
export interface StreakAward {
  id: string;
  earnedWeek: string;
  unlockedAt: number;
  valid: boolean;
}
export interface StreakState {
  rulesVersion?: 2;
  trainingDays?: Record<string, number[]>;
  version: 1;
  timeZone: string;
  targets: Record<string, number>;
  policies: StreakPolicy[];
  weeks: StreakWeek[];
  awards: StreakAward[];
}
const distance = (a: string, b: string) =>
  (Date.parse(b + 'T12:00Z') - Date.parse(a + 'T12:00Z')) / 604800000;
/** Fixed local calendar for training-day streaks, including DST. */
export const STREAK_TIME_ZONE = 'Europe/Vienna';
export function workoutStreakReason(w: Workout, now = Date.now()): string | null {
  if (
    w.streakExcluded === true ||
    w.isTest === true ||
    w.cancelled === true ||
    w.abandoned === true ||
    ['test', 'cancelled', 'canceled', 'abandoned'].includes(
      typeof w.status === 'string' ? w.status.toLowerCase() : '',
    )
  )
    return 'Excluded practice, test or cancelled session';
  if (
    !Number.isFinite(w.started) ||
    !Number.isFinite(w.finished) ||
    w.finished! <= w.started ||
    w.finished! > now
  )
    return 'No valid saved completion time';
  return null;
}
export function historyProgram(w: Workout, entries: SavedProgram[]) {
  if (w.programId) return entries.find((p) => p.id === w.programId);
  const matches = entries.filter((p) => Object.hasOwn(p.templates, w.name));
  return matches.length === 1 ? matches[0] : undefined;
}
function policyFor(
  p: SavedProgram,
  fromWeek: string,
  anchorCycle: number,
  target: number | null,
  selectedDays?: number[],
): StreakPolicy {
  const metadata = scheduleMetadata(p),
    // Explicit weekday settings also work for a program-level routine with no individual templates.
    sourceCycles = metadata.cycles.length
      ? metadata.cycles
      : selectedDays !== undefined
        ? [{ week: 1, sessions: [] }]
        : [],
    cycleNumbers = sourceCycles.map((c) => c.week),
    cycles = sourceCycles.map((c) => ({
      week: c.week,
      weekdays:
        selectedDays ??
        (c.sessions.length && c.sessions.every((s) => s.day !== null)
          ? [...new Set(c.sessions.map((s) => s.day!))].sort((a, b) => a - b)
          : null),
      sessions: c.sessions.map(({ key, name, templateIds }) => ({ key, name, templateIds })),
    })),
    scheduled = !p.review && (metadata.weekly || selectedDays !== undefined);
  const mode = scheduled ? 'scheduled' : 'manual';
  return {
    id: crypto.randomUUID(),
    explicitWeeks: metadata.explicitWeeks,
    programId: p.id,
    name: p.name,
    fromWeek,
    anchorWeek: fromWeek,
    anchorCycle: cycleNumbers.includes(anchorCycle) ? anchorCycle : cycleNumbers[0] || 1,
    mode,
    target: target !== null && target <= 7 ? target : null,
    cycles,
    signature: JSON.stringify([
      'training-days-v2',
      p.id,
      mode,
      p.review || null,
      target,
      selectedDays ?? null,
      cycles.map((c) => [c.week, c.weekdays, c.sessions.map((s) => [s.key, s.templateIds])]),
    ]),
  };
}
function goalFor(policy: StreakPolicy, week: string): WeekGoal {
  const n = policy.cycles.length,
    anchor = Math.max(
      0,
      policy.cycles.findIndex((c) => c.week === policy.anchorCycle),
    );
  const index = n ? (((anchor + distance(policy.anchorWeek, week)) % n) + n) % n : 0;
  const cycle = policy.cycles[index];
  const sessions = structuredClone(cycle?.sessions || []);
  return {
    id: `${policy.id}:${cycle?.week || 1}`,
    showCycle: !!policy.explicitWeeks,
    programId: policy.programId,
    name: policy.name,
    cycleWeek: cycle?.week || 1,
    mode: policy.mode,
    sessions,
    weekdays: cycle?.weekdays,
    target:
      policy.target ??
      (policy.mode === 'scheduled'
        ? cycle?.weekdays === undefined
          ? sessions.length || null
          : cycle.weekdays?.length || null
        : null),
  };
}
export interface GoalProgress {
  goal: WeekGoal;
  completed: number;
  success: boolean;
  sessions: { name: string; complete: boolean }[];
  days: TrainingDay[];
}
export interface TrainingDay {
  date: string;
  weekday: string;
  scheduled: boolean | null;
  complete: boolean;
  today: boolean;
  state: 'completed' | 'missed' | 'scheduled' | 'rest' | 'unspecified';
}
const validDays = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
  new Set(value).size === value.length;
function goalWeekdays(goal: WeekGoal, entries: SavedProgram[]): number[] | null {
  if (goal.weekdays !== undefined) return goal.weekdays;
  const fromLabels = goal.sessions.map((s) =>
    s.name.includes(' · ') ? weekdayNumber(s.name.split(' · ')[0]) : null,
  );
  if (fromLabels.length && fromLabels.every((d) => d !== null))
    return [...new Set(fromLabels as number[])].sort((a, b) => a - b);
  const p = entries.find((p) => p.id === goal.programId);
  if (p)
    return scheduleMetadata(p)
      .cycles.find((c) => c.week === goal.cycleWeek)
      ?.sessions.every((s) => s.day !== null)
      ? [
          ...new Set(
            scheduleMetadata(p)
              .cycles.find((c) => c.week === goal.cycleWeek)!
              .sessions.map((s) => s.day!),
          ),
        ].sort((a, b) => a - b)
      : null;
  return null;
}
function weekCalendar(
  week: string,
  weekdays: number[] | null,
  completed: string[],
  now: number,
): TrainingDay[] {
  const today = localDate(now, STREAK_TIME_ZONE);
  return WEEKDAYS.map((weekday, index) => {
    const date = addDays(week, index),
      scheduled = weekdays === null ? null : weekdays.includes(index),
      complete = completed.includes(date);
    return {
      date,
      weekday,
      scheduled,
      complete,
      today: date === today,
      state: complete
        ? 'completed'
        : weekdays === null
          ? 'unspecified'
          : scheduled
            ? date < today
              ? 'missed'
              : 'scheduled'
            : 'rest',
    };
  });
}
export interface WeekProgress {
  week: string;
  goals: GoalProgress[];
  chosen: GoalProgress | undefined;
  status: 'success' | 'pending' | 'failed' | 'unconfigured';
}
export interface StreakReport {
  current: number;
  longest: number;
  weeks: WeekProgress[];
  currentWeek: WeekProgress | undefined;
  earned: Record<string, string>;
  ignored: number;
}
export function calculateStreak(data: Data, now = Date.now()): StreakReport {
  const s = data.streak;
  if (!s)
    return { current: 0, longest: 0, weeks: [], currentWeek: undefined, earned: {}, ignored: 0 };
  const entries = data.programs || migratePrograms(data).programs!;
  const idsSeen = new Set<string>();
  const current = calendarWeek(now, STREAK_TIME_ZONE);
  const valid = data.history.filter((w) => {
    if (workoutStreakReason(w, now) || idsSeen.has(w.id)) return false;
    idsSeen.add(w.id);
    return true;
  });
  const byWeek = new Map<string, Set<string>>();
  for (const w of valid) {
    const date = localDate(w.finished!, STREAK_TIME_ZONE),
      key = calendarWeek(w.finished!, STREAK_TIME_ZONE);
    if (!byWeek.has(key)) byWeek.set(key, new Set());
    byWeek.get(key)!.add(date);
  }
  const records = [...s.weeks];
  if (!records.some((w) => w.week === current)) {
    const p = s.policies.filter((p) => p.fromWeek <= current).at(-1);
    records.push({ week: current, goals: p ? [goalFor(p, current)] : [] });
  }
  const weeks = records
    .filter((w) => w.week <= current)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((record) => {
      const dates = [...(byWeek.get(record.week) || [])].sort();
      const goals = record.goals.map((raw) => {
        const days = goalWeekdays(raw, entries);
        const target =
          raw.weekdays === undefined && raw.mode === 'scheduled' && days?.length
            ? days.length
            : raw.target;
        const goal = {
          ...raw,
          weekdays: days,
          target: target !== null && target >= 1 && target <= 7 ? target : null,
        };
        return {
          goal,
          completed: goal.target === null ? dates.length : Math.min(goal.target, dates.length),
          success: goal.target !== null && dates.length >= goal.target,
          sessions: dates.map((date) => ({ name: date, complete: true })),
          days: weekCalendar(record.week, days, dates, now),
        };
      });
      const chosen =
        record.week === current
          ? [...goals].reverse().find((g) => g.goal.programId === data.activeProgramId) ||
            goals.at(-1)
          : goals.at(-1);
      const status = chosen?.success
        ? 'success'
        : record.week === current
          ? 'pending'
          : chosen?.goal.target !== null && chosen?.goal.target !== undefined
            ? 'failed'
            : 'unconfigured';
      return { week: record.week, goals, chosen, status } as WeekProgress;
    });
  let run = 0,
    longest = 0;
  let previousWeek: string | undefined;
  const earned: Record<string, string> = {};
  for (const w of weeks) {
    if (previousWeek && distance(previousWeek, w.week) > 1) run = 0;
    previousWeek = w.week;
    if (w.status === 'success') {
      run++;
      longest = Math.max(longest, run);
      for (const l of STREAK_LEVELS)
        if (l.weeks && run >= l.weeks && !earned[l.id]) earned[l.id] = w.week;
    } else if (w.week !== current) run = 0;
  }
  return {
    current: run,
    longest,
    weeks,
    currentWeek: weeks.find((w) => w.week === current),
    earned,
    ignored: data.history.filter((w) => workoutStreakReason(w, now)).length,
  };
}
/** Retain target snapshots as audit data; date credits are recalculated from saved completions. */
export function syncStreaks(
  data: Data,
  now = Date.now(),
  zoneHint = 'UTC',
  forceCycle?: number,
): Data {
  const base = data.programs ? data : migratePrograms(data),
    entries = base.programs!;
  const existing = !!data.streak;
  const s: StreakState = data.streak
    ? structuredClone(data.streak)
    : {
        version: 1,
        timeZone: validTimeZone(zoneHint) ? zoneHint : 'UTC',
        targets: {},
        policies: [],
        weeks: [],
        awards: [],
      };
  s.timeZone = STREAK_TIME_ZONE;
  s.rulesVersion = 2;
  s.trainingDays ||= {};
  const week = calendarWeek(now, STREAK_TIME_ZONE);
  if (!existing) {
    // Ownership recovers historical target definitions only; date credit never requires program/template ownership.
    const history = data.history
      .filter((w) => !workoutStreakReason(w, now) && historyProgram(w, entries))
      .sort((a, b) => a.finished! - b.finished!);
    let previous = '';
    for (const w of history) {
      const p = historyProgram(w, entries)!;
      if (p.id === previous) continue;
      previous = p.id;
      const view = programView(p),
        cycle = w.cycleWeek || view.workouts.find((t) => t.id === w.name)?.week || 1;
      s.policies.push(
        policyFor(
          p,
          calendarWeek(w.finished!, s.timeZone),
          cycle,
          s.targets[p.id] ?? null,
          s.trainingDays[p.id],
        ),
      );
    }
  }
  const active = currentProgram(base),
    last = s.policies.at(-1);
  if (active) {
    const candidate = policyFor(
      active,
      week,
      forceCycle ?? data.rotationWeek ?? 1,
      s.targets[active.id] ?? null,
      s.trainingDays[active.id],
    );
    if (active.calendar?.enabled) {
      candidate.anchorWeek = calendarWeek(
        Date.parse(active.calendar.anchorDate + 'T12:00Z'),
        'UTC',
      );
      candidate.anchorCycle = active.calendar.anchorWeek;
      candidate.signature += JSON.stringify(active.calendar);
    }
    if (
      !last ||
      last.programId !== active.id ||
      last.signature !== candidate.signature ||
      forceCycle !== undefined
    )
      s.policies.push(candidate);
  }
  const dates = data.history
    .filter((w) => !workoutStreakReason(w, now))
    .map((w) => calendarWeek(w.finished!, STREAK_TIME_ZONE));
  const earliest = [
    ...dates,
    ...s.policies.map((p) => p.fromWeek),
    ...s.weeks.map((w) => w.week),
    week,
  ].sort()[0];
  const historyDates = new Set(
    data.history
      .filter((w) => Number.isFinite(w.finished) && w.finished! <= now)
      .map((w) => calendarWeek(w.finished!, s.timeZone)),
  );
  const recent = addDays(week, -104 * 7);
  // Bound invalid/future dates in validation; real date arithmetic uses calendar days, never 24h timezone offsets.
  for (let date = earliest; date <= week; date = addDays(date, 7)) {
    const prior = s.policies.filter((p) => p.fromWeek < date).at(-1);
    const today = s.policies.filter((p) => p.fromWeek === date);
    const policies = [...(prior ? [prior] : []), ...today];
    // Earlier saved completions remain eligible even when their names/ownership never matched a template.
    if (!policies.length && s.policies.length) policies.push(s.policies[0]);
    let record = s.weeks.find((w) => w.week === date);
    // Sparse old gaps are represented by immutable policy periods, not thousands of duplicate empty goals.
    if (!record && date < recent && !historyDates.has(date) && !today.length) continue;
    if (!record) {
      record = { week: date, goals: policies.map((p) => goalFor(p, date)) };
      s.weeks.push(record);
    } else if (date === week)
      for (const p of today) {
        const goal = goalFor(p, date);
        if (!record.goals.some((g) => g.id === goal.id)) record.goals.push(goal);
      }
  }
  s.weeks.sort((a, b) => a.week.localeCompare(b.week));
  const next = { ...data, streak: s },
    report = calculateStreak(next, now);
  for (const award of s.awards) award.valid = !!report.earned[award.id];
  for (const [id, earnedWeek] of Object.entries(report.earned)) {
    const old = s.awards.find((a) => a.id === id);
    if (old) {
      old.valid = true;
      old.earnedWeek = earnedWeek;
    } else s.awards.push({ id, earnedWeek, unlockedAt: now, valid: true });
  }
  return next;
}
export function configureStreak(
  data: Data,
  options: {
    timeZone?: string;
    target?: number | null;
    cycleWeek?: number;
    weekdays?: number[] | null;
  },
  now = Date.now(),
): Data {
  let next = syncStreaks(data, now);
  if (options.timeZone !== undefined) {
    if (options.timeZone !== STREAK_TIME_ZONE) throw Error('Strength Streak uses Europe/Vienna.');
  }
  if (options.target !== undefined) {
    if (
      options.target !== null &&
      (!Number.isInteger(options.target) || options.target < 1 || options.target > 7)
    )
      throw Error('Weekly target must be 1–7 training days.');
    if (!next.activeProgramId) throw Error('Select a training program first.');
    if (options.target === null) delete next.streak!.targets[next.activeProgramId];
    else next.streak!.targets[next.activeProgramId] = options.target;
  }
  if (options.weekdays !== undefined) {
    if (!next.activeProgramId) throw Error('Select a training program first.');
    if (options.weekdays === null) delete next.streak!.trainingDays![next.activeProgramId];
    else {
      if (!validDays(options.weekdays)) throw Error('Choose valid Monday–Sunday training days.');
      next.streak!.trainingDays![next.activeProgramId] = [...options.weekdays].sort(
        (a, b) => a - b,
      );
    }
  }
  if (
    options.cycleWeek !== undefined &&
    !programView(currentProgram(next)!).workouts.some((w) => w.week === options.cycleWeek)
  )
    throw Error('Choose a program week from the imported rotation.');
  const active = currentProgram(next);
  if (options.cycleWeek !== undefined && active?.calendar?.enabled) {
    // Calendar selection and streaks share one anchor; only current/future policies are added below.
    active.calendar.anchorDate = localDate(now, next.streak!.timeZone);
    active.calendar.anchorWeek = options.cycleWeek;
  }
  next = syncStreaks(next, now, 'UTC', options.cycleWeek);
  return next;
}
export function assertStreak(value: unknown): asserts value is StreakState {
  const s = value as StreakState;
  const date = (v: unknown) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v + 'T12:00Z')) &&
    calendarWeek(Date.parse(v + 'T12:00Z'), 'UTC') === v;
  const sessions = (items: StreakSession[]) =>
    Array.isArray(items) &&
    items.every(
      (t) =>
        t &&
        typeof t.key === 'string' &&
        typeof t.name === 'string' &&
        Array.isArray(t.templateIds) &&
        t.templateIds.length > 0 &&
        t.templateIds.every((id) => typeof id === 'string'),
    ) &&
    new Set(items.map((t) => t.key)).size === items.length &&
    new Set(items.flatMap((t) => t.templateIds)).size ===
      items.flatMap((t) => t.templateIds).length;
  const target = (n: unknown) =>
    n === null || (Number.isInteger(n) && Number(n) > 0 && Number(n) <= 1000);
  if (
    !s ||
    s.version !== 1 ||
    typeof s.timeZone !== 'string' ||
    !validTimeZone(s.timeZone) ||
    !s.targets ||
    typeof s.targets !== 'object' ||
    !Object.values(s.targets).every((t) => Number.isInteger(t) && t >= 1 && t <= 14) ||
    !Array.isArray(s.policies) ||
    !Array.isArray(s.weeks) ||
    !Array.isArray(s.awards)
  )
    throw Error('Invalid Strength Streak backup.');
  if (
    (s.rulesVersion !== undefined && s.rulesVersion !== 2) ||
    (s.trainingDays !== undefined &&
      (!s.trainingDays ||
        typeof s.trainingDays !== 'object' ||
        Array.isArray(s.trainingDays) ||
        !Object.values(s.trainingDays).every(validDays)))
  )
    throw Error('Invalid Strength Streak weekday settings.');
  const ids = new Set<string>();
  for (const p of s.policies) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      typeof p.programId !== 'string' ||
      typeof p.name !== 'string' ||
      !date(p.fromWeek) ||
      !date(p.anchorWeek) ||
      !['scheduled', 'manual'].includes(p.mode) ||
      !target(p.target) ||
      (p.mode === 'manual' && p.target !== null && p.target > 14) ||
      !Number.isInteger(p.anchorCycle) ||
      typeof p.signature !== 'string' ||
      !Array.isArray(p.cycles) ||
      !p.cycles.every(
        (c) =>
          Number.isInteger(c.week) &&
          c.week > 0 &&
          sessions(c.sessions) &&
          (c.weekdays === undefined || c.weekdays === null || validDays(c.weekdays)),
      )
    )
      throw Error('Invalid Strength Streak schedule snapshot.');
    ids.add(p.id);
  }
  const dates = new Set<string>();
  for (const w of s.weeks) {
    if (
      !w ||
      !date(w.week) ||
      dates.has(w.week) ||
      !Array.isArray(w.goals) ||
      new Set(w.goals.map((g) => g?.id)).size !== w.goals.length ||
      !w.goals.every(
        (g) =>
          g &&
          typeof g.id === 'string' &&
          typeof g.programId === 'string' &&
          typeof g.name === 'string' &&
          Number.isInteger(g.cycleWeek) &&
          ['scheduled', 'manual'].includes(g.mode) &&
          target(g.target) &&
          sessions(g.sessions) &&
          (g.weekdays === undefined || g.weekdays === null || validDays(g.weekdays)),
      )
    )
      throw Error('Invalid Strength Streak week snapshot.');
    dates.add(w.week);
  }
  if (
    s.weeks.length > 6000 ||
    s.policies.some((p) => p.fromWeek < '1900-01-01') ||
    s.weeks.some((w) => w.week < '1900-01-01') ||
    new Set(s.awards.map((a) => a?.id)).size !== s.awards.length ||
    !s.awards.every(
      (a) =>
        a &&
        STREAK_LEVELS.some((l) => l.id === a.id && l.weeks > 0) &&
        date(a.earnedWeek) &&
        Number.isFinite(a.unlockedAt) &&
        typeof a.valid === 'boolean',
    )
  )
    throw Error('Invalid Strength Streak achievement history.');
}
export function mergeStreaks(a?: StreakState, b?: StreakState): StreakState | undefined {
  if (!a) return b ? structuredClone(b) : undefined;
  if (!b) return structuredClone(a);
  const next = structuredClone(a);
  next.timeZone = STREAK_TIME_ZONE;
  next.rulesVersion = 2;
  next.trainingDays = { ...a.trainingDays, ...b.trainingDays };
  next.targets = { ...a.targets, ...b.targets };
  for (const p of b.policies) {
    const old = next.policies.find((x) => x.id === p.id);
    if (old && JSON.stringify(old) !== JSON.stringify(p))
      throw Error('Conflicting Strength Streak schedule snapshots.');
    if (!old) next.policies.push(structuredClone(p));
  }
  next.policies.sort((x, y) => x.fromWeek.localeCompare(y.fromWeek));
  for (const w of b.weeks) {
    const old = next.weeks.find((x) => x.week === w.week);
    if (!old) {
      next.weeks.push(structuredClone(w));
      continue;
    }
    for (const g of w.goals) {
      const goal = old.goals.find((x) => x.id === g.id);
      if (goal && JSON.stringify(goal) !== JSON.stringify(g))
        throw Error('Conflicting Strength Streak week snapshots.');
      if (!goal) old.goals.push(structuredClone(g));
    }
  }
  for (const award of b.awards) {
    const old = next.awards.find((x) => x.id === award.id);
    if (!old) next.awards.push(structuredClone(award));
    else old.unlockedAt = Math.min(old.unlockedAt, award.unlockedAt);
  }
  next.weeks.sort((x, y) => x.week.localeCompare(y.week));
  return next;
}
