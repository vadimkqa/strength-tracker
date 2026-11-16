/** Weight entry uses kilograms with up to three decimal places. Keep drafts separate from numbers. */
export const weightDraft = (value: string) => value.replace(/,/g, '.');
export function weightValue(value: string | number): number | null {
  const text = weightDraft(String(value)).trim();
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
export function normalizedWeight(value: string | number): string | null {
  if (weightValue(value) === null) return null;
  const [whole, fraction = ''] = weightDraft(String(value)).trim().split('.');
  const integer = (whole || '0').replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals ? `${integer}.${decimals}` : integer;
}
function milliWeight(value: string | number): bigint | null {
  const normalized = normalizedWeight(value);
  if (normalized === null) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}
function fromMilli(value: bigint): string {
  return `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`.replace(/\.?0+$/, '');
}
/** Integer grams avoid floating-point drift, including when starting from 0.125 kg. */
export function adjustWeight(value: string, deltaGrams: -500 | -250 | 250 | 500): string | null {
  const grams = milliWeight(value.trim() === '' ? '0' : value);
  if (grams === null) return null;
  return fromMilli(grams + BigInt(deltaGrams) < 0n ? 0n : grams + BigInt(deltaGrams));
}
export function weightVolume(weight: string | number, reps: number): number {
  const grams = milliWeight(weight);
  return grams === null || !Number.isInteger(reps) || reps <= 0
    ? 0
    : Number(grams * BigInt(reps)) / 1000;
}
/** Volumes from valid three-place loads and integer reps also have at most three places. */
export function sumVolumes(values: number[]): number {
  if (values.some((v) => !Number.isFinite(v) || !Number.isSafeInteger(Math.round(v * 1000))))
    return values.reduce((sum, v) => sum + v, 0);
  return Number(values.reduce((sum, v) => sum + BigInt(Math.round(v * 1000)), 0n)) / 1000;
}
