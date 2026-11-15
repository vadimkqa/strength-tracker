export interface RecordPreferences {
  /** Stable exercise identities in the user's chosen order. */
  favorites: string[];
}
export function assertRecordPreferences(
  value: unknown,
): asserts value is RecordPreferences | undefined {
  if (value === undefined) return;
  const p = value as RecordPreferences;
  if (
    !p ||
    !Array.isArray(p.favorites) ||
    p.favorites.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(p.favorites).size !== p.favorites.length
  )
    throw Error('Invalid personal record preferences. Original data has been preserved.');
}
export function mergeRecordPreferences(
  current?: RecordPreferences,
  incoming?: RecordPreferences,
): RecordPreferences | undefined {
  if (!current && !incoming) return undefined;
  // Restore is additive: resident order wins, incoming-only favorites follow in their saved order.
  return {
    ...incoming,
    ...current,
    favorites: [...new Set([...(current?.favorites || []), ...(incoming?.favorites || [])])],
  };
}
export function toggleFavorite(favorites: string[], id: string) {
  return favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
}
export function moveFavorite(favorites: string[], id: string, direction: -1 | 1) {
  const next = [...favorites],
    index = next.indexOf(id),
    target = index + direction;
  if (index >= 0 && target >= 0 && target < next.length)
    [next[index], next[target]] = [next[target], next[index]];
  return next;
}
