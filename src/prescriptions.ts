export interface SetPrescription {
  targetWeight?: { value: number; unit: string } | null;
  targetRpe?: number | null;
  targetRir?: number | null;
  restSeconds?: number | null;
  repsText?: string | null;
  number: number | null;
  minReps: number | null;
  maxReps: number | null;
  effort: string;
  source: string;
}
export function parseSetBlock(source: string): SetPrescription[] {
  return source
    .trim()
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const numbered = entry.match(/^(\d+)\s*:\s*(.*)$/);
      const body = numbered ? numbered[2] : entry;
      const reps = body.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?\s*(.*)$/);
      return {
        number: numbered ? Number(numbered[1]) : null,
        minReps: reps ? Number(reps[1]) : null,
        maxReps: reps ? Number(reps[2] || reps[1]) : null,
        effort: reps ? reps[3].trim() : body,
        source: entry,
      };
    });
}
export function setWarnings(sets: SetPrescription[]): string[] {
  const warnings: string[] = [];
  const numbers = sets.map((s) => s.number);
  if (numbers.some((n) => n === null))
    warnings.push('A set number is missing; source entries have not been renumbered.');
  const duplicates = [...new Set(numbers.filter((n, i) => n !== null && numbers.indexOf(n) !== i))];
  if (duplicates.length)
    warnings.push(`Repeated set number(s): ${duplicates.join(', ')}. Source order is unchanged.`);
  const max = Math.max(0, ...numbers.filter((n): n is number => n !== null));
  const missing = Array.from({ length: Math.min(max, 100) }, (_, i) => i + 1).filter(
    (n) => !numbers.includes(n),
  );
  if (missing.length)
    warnings.push(`Missing set number(s): ${missing.join(', ')}. No sets have been invented.`);
  if (max > 100 || numbers.some((n) => n !== null && (!Number.isInteger(n) || n < 1)))
    warnings.push('Invalid or unusually large set number.');
  for (const [i, set] of sets.entries()) {
    if (
      !Number.isInteger(set.minReps) ||
      !Number.isInteger(set.maxReps) ||
      set.minReps === null ||
      set.maxReps === null ||
      set.minReps < 1 ||
      set.maxReps < set.minReps
    )
      warnings.push(`Set entry ${i + 1}: rep range needs review.`);
    if (!['no fail', 'half fail', 'fail'].includes(set.effort.toLowerCase().replace(/\s+/g, ' ')))
      warnings.push(
        `Set entry ${i + 1}: unusual effort instruction “${set.effort || '(missing)'}”; preserved as written.`,
      );
  }
  return warnings;
}
export function repsLabel(set: SetPrescription) {
  return set.minReps === null
    ? 'Reps unspecified'
    : set.minReps === set.maxReps
      ? String(set.minReps)
      : `${set.minReps}–${set.maxReps ?? '?'}`;
}
