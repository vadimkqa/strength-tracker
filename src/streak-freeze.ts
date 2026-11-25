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

export function freezeCoverage(range: RestRange) {
  const first = monday(range.start);
  const last = monday(range.end);
  const protectedFrom = first === range.start ? first : addDays(first, 7);
  const protectedThrough = addDays(last, 6) <= range.end ? last : addDays(last, -7);
  const weeks = (a: string, b: string) =>
    Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 604800000) + 1);
  return {
    touched: weeks(first, last),
    protected: weeks(protectedFrom, protectedThrough),
    protectedFrom,
    protectedThrough,
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
    if (action.id && (!old || old.start <= today))
      throw Error('Only upcoming rest periods can be edited.');
    const { start, end } = action.range;
    if (!validDate(start) || !validDate(end) || end < start || start < today)
      throw Error('Select an inclusive date range starting today or later in Europe/Vienna.');
    next = { id: old?.id ?? crypto.randomUUID(), start, end, updatedAt };
  } else {
    if (!old) throw Error('This rest period is no longer available.');
    if (action.type === 'cancel') {
      if (old.start <= today) throw Error('Only upcoming rest periods can be cancelled.');
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
