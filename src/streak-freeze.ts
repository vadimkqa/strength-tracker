import { addDays, localDate, monday, validDate } from './calendar';

export const STREAK_TIME_ZONE = 'Europe/Vienna';
export interface RestRange {
  start: string;
  end: string;
}
export interface StreakFreeze extends RestRange {
  id: string;
  updatedAt: number;
  /** Keep cancellations so an older backup cannot resurrect a cancelled range. */
  cancelled?: true;
}

export type FreezeChange =
  { type: 'save'; range: RestRange; id?: string } | { type: 'cancel' | 'end'; id: string };

/** The current Vienna week and the two preceding calendar weeks are selectable. */
export const earliestRestDate = (today: string) => addDays(monday(today), -14);

export function* restWeeks(range: RestRange, through = monday(range.end)) {
  for (
    let week = monday(range.start);
    week <= range.end && week <= through;
    week = addDays(week, 7)
  )
    yield week;
}

export function freezeWeekCoverage(
  range: RestRange,
  week: string,
  days: readonly { date: string; scheduled: boolean | null; complete: boolean }[] = [],
  target: number | null = null,
) {
  const full = range.start <= week && range.end >= addDays(week, 6);
  const planned = days.filter((day) => day.scheduled === true);
  const covered = planned.filter((day) => day.date >= range.start && day.date <= range.end);
  const uncovered = planned.filter((day) => !day.complete && !covered.includes(day));
  const completed = days.filter((day) => day.complete).length;
  const scheduleKnown = planned.length > 0 && target !== null;
  const remaining =
    target === null
      ? null
      : Math.max(0, target - completed - covered.filter((day) => !day.complete).length);
  return {
    covered,
    uncovered,
    scheduleKnown,
    remaining,
    protected: full || (scheduleKnown && uncovered.length === 0 && remaining === 0),
  };
}

export function freezeStatus(range: RestRange, today: string) {
  return today < range.start ? 'Upcoming' : today > range.end ? 'Previous' : 'Active';
}

function checkOverlap(periods: readonly StreakFreeze[]) {
  const ordered = periods
    .filter((p) => !p.cancelled)
    .sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < ordered.length; i++)
    if (ordered[i].start <= ordered[i - 1].end)
      throw Error('Rest periods overlap. Choose dates that do not share any days.');
}

export function updateFreezes(periods: readonly StreakFreeze[], action: FreezeChange, now: number) {
  const today = localDate(now, STREAK_TIME_ZONE);
  const old = periods.find((p) => p.id === action.id && !p.cancelled);
  const updatedAt = Math.max(now, (old?.updatedAt ?? -1) + 1);
  let next: StreakFreeze;
  if (action.type === 'save') {
    const earliest = earliestRestDate(today);
    if (action.id && (!old || old.end < earliest))
      throw Error('This rest period is outside the editable date window.');
    const { start, end } = action.range;
    // A long-running period can keep its original start when its end is edited.
    if (
      !validDate(start) ||
      !validDate(end) ||
      end < start ||
      end < earliest ||
      (start < earliest && start !== old?.start)
    )
      throw Error('Choose dates in the current or previous two Europe/Vienna weeks, or later.');
    next = { id: old?.id ?? crypto.randomUUID(), start, end, updatedAt };
  } else {
    if (!old) throw Error('This rest period is no longer available.');
    if (action.type === 'cancel') {
      next = { ...old, cancelled: true, updatedAt };
    } else {
      if (old.start > today || old.end <= today)
        throw Error('Only an active rest period extending beyond today can end early.');
      next = { ...old, end: today, updatedAt };
    }
  }
  const result = [...periods.filter((p) => p.id !== next.id), next];
  checkOverlap(result);
  return result;
}

export function assertFreezes(value: unknown): asserts value is StreakFreeze[] | undefined {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.some(
      (p) =>
        !p ||
        typeof p.id !== 'string' ||
        !p.id.trim() ||
        !validDate(p.start) ||
        !validDate(p.end) ||
        p.end < p.start ||
        !Number.isSafeInteger(p.updatedAt) ||
        p.updatedAt < 0 ||
        (p.cancelled !== undefined && p.cancelled !== true),
    ) ||
    new Set(value.map((p) => p.id)).size !== value.length
  )
    throw Error('Invalid Strength Streak rest periods.');
  checkOverlap(value);
}

export function mergeFreezes(a?: StreakFreeze[], b?: StreakFreeze[]) {
  if (!a && !b) return undefined;
  const records = new Map((a || []).map((p) => [p.id, p]));
  for (const p of b || []) {
    const old = records.get(p.id);
    if (!old || p.updatedAt > old.updatedAt) records.set(p.id, p);
    else if (
      p.updatedAt === old.updatedAt &&
      (p.start !== old.start || p.end !== old.end || p.cancelled !== old.cancelled)
    )
      throw Error('Conflicting edits to a Strength Streak rest period.');
  }
  const next = [...records.values()];
  try {
    checkOverlap(next);
  } catch {
    throw Error(
      'This backup contains rest periods that overlap saved dates. No data was restored.',
    );
  }
  return structuredClone(next);
}
