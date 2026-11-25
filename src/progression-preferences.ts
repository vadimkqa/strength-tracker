import { normalizedWeight, weightValue } from './weight';
export interface ProgressionPreferences {
  enabled: boolean;
  /** Exact exercise identities; kilograms as normalized decimal strings. */
  increments: Record<string, string>;
}
export function assertProgressionPreferences(
  value: unknown,
): asserts value is ProgressionPreferences | undefined {
  if (value === undefined) return;
  const p = value as ProgressionPreferences;
  if (
    !p ||
    typeof p.enabled !== 'boolean' ||
    !p.increments ||
    typeof p.increments !== 'object' ||
    Array.isArray(p.increments) ||
    Object.entries(p.increments).some(
      ([id, v]) =>
        !id.trim() || typeof v !== 'string' || normalizedWeight(v) !== v || !(weightValue(v)! > 0),
    )
  )
    throw Error('Invalid progression preferences. Original data has been preserved.');
}
export function mergeProgressionPreferences(
  current?: ProgressionPreferences,
  incoming?: ProgressionPreferences,
): ProgressionPreferences | undefined {
  if (!current && !incoming) return undefined;
  // Match additive restore: keep resident choices and restore incoming-only overrides.
  return {
    enabled: current?.enabled ?? incoming!.enabled,
    increments: { ...incoming?.increments, ...current?.increments },
  };
}
