import { addProgram } from './programs';
import { legacyProgram } from './importing/compatibility';
import { parseSetBlock, setWarnings, type SetPrescription } from './prescriptions';
/** Pure rule-based TXT parsing. No storage, UI, network or exercise-name inference. */
import {
  workouts,
  templateKey,
  type WorkoutId,
  type Intensity,
  rotationKey,
  type RotationSession,
} from './workouts';
import type { Data } from './data';
import type { Plan } from './templates';
export type Category = '' | 'compound' | 'isolation';
export interface DraftExercise {
  week: number;
  day: string;
  exerciseIntensity: string;
  setPrescriptions: SetPrescription[];
  optional: boolean;
  alternatives: string[];
  kind: 'exercise' | 'core';
  allowUnspecifiedRest: boolean;
  allowUnspecifiedSets: boolean;
  id: string;
  line: number;
  source: string;
  name: string;
  workout: WorkoutId | '';
  intensity: Intensity | '';
  category: Category;
  sets: number | null;
  reps: string;
  rest: number | null;
  notes: string;
  compoundSets: number | null;
  isolationSets: number | null;
  allowUnspecifiedReps: boolean;
  reviewed: boolean;
  excluded: boolean;
  warnings: string[];
}
export interface PlanDraft {
  programName?: string;
  rotation: boolean;
  rows: DraftExercise[];
  source: string;
  notices: string[];
}
export type Aliases = Record<string, WorkoutId>;
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[–—·_]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const builtins: Aliases = {};
[
  ['bench day', 'bench focus', 'bench press day', 'tuesday bench focus'],
  ['db press day', 'dumbbell press day', 'db day', 'back day', 'back focus', 'thursday back focus'],
  ['hammer press day', 'hammer day', 'hammer chest day', 'chest focus', 'saturday chest focus'],
  ['leg day', 'legs', 'legs day', 'sunday legs'],
].forEach((names, i) => names.forEach((name) => (builtins[name] = workouts[i].key)));
function heading(line: string, aliases: Aliases) {
  const text = normalize(
    line
      .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '')
      .replace(/\s*\(?(?:aka|also called|alias)\b.*$/i, ''),
  )
    .replace(/\b(hard|heavy|easy|week|workout|training|session)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const reduced = text.replace(
    /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day \d+)\s+/,
    '',
  );
  return Object.hasOwn(aliases, text)
    ? aliases[text]
    : Object.hasOwn(aliases, reduced)
      ? aliases[reduced]
      : '';
}
function intensityOf(line: string): Intensity | '' {
  const hard = /\b(hard|heavy)\b/i.test(line),
    easy = /\beasy\b/i.test(line);
  return hard && !easy ? 'hard' : easy && !hard ? 'easy' : '';
}
function duration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, '.');
  if (/^\d+:\d{2}$/.test(s)) {
    const [m, sec] = s.split(':').map(Number);
    return sec < 60 ? m * 60 + sec : null;
  }
  let seconds = 0,
    matched = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|seconds?|secs?|s)\b/g)) {
    seconds += Number(m[1]) * (m[2].startsWith('m') ? 60 : 1);
    matched = true;
  }
  return matched && seconds > 0 ? Math.round(seconds) : null;
}
function extract(line: string) {
  const clean = line.replace(/[–—]/g, '-');
  const warnings: string[] = [];
  const setReps = [
    ...clean.matchAll(/\b(\d+(?:\s*-\s*\d+)?)\s*[x×]\s*(\d+(?:\s*-\s*\d+)?|AMRAP|failure)\b/gi),
    ...clean.matchAll(
      /\b(\d+(?:\s*-\s*\d+)?)\s*sets?\s+of\s+(\d+(?:\s*-\s*\d+)?|AMRAP|failure)\b/gi,
    ),
  ];
  const setMatches = [...clean.matchAll(/\b(\d+(?:\s*-\s*\d+)?)\s*sets?\b/gi)];
  const afterSets = [...clean.matchAll(/\bsets?\s*[:=]\s*(\d+(?:\s*-\s*\d+)?)/gi)];
  const explicitSets = [...setMatches, ...afterSets];
  const setsRaw = setReps[0]?.[1] || explicitSets[0]?.[1];
  let sets = setsRaw && /^\d+$/.test(setsRaw) ? Number(setsRaw) : null;
  if (setsRaw && sets === null) warnings.push('Set count is a range; choose a single count.');
  if (
    setReps.length > 1 ||
    new Set([...setReps.map((m) => m[1]), ...explicitSets.map((m) => m[1])]).size > 1
  ) {
    sets = null;
    warnings.push('Multiple set prescriptions; review all sets and back-off/warm-up work.');
  }
  const repMatches = [
    ...clean.matchAll(/\b(\d+(?:\s*-\s*\d+)?|AMRAP|failure)\s*reps?\b/gi),
    ...clean.matchAll(/\breps?\s*[:=]\s*(\d+(?:\s*-\s*\d+)?|AMRAP|failure)\b/gi),
  ];
  const reps = setReps[0]?.[2] || repMatches[0]?.[1] || '';
  if (
    new Set([...setReps.map((m) => m[2]), ...repMatches.map((m) => m[1])].map(normalize)).size > 1
  )
    warnings.push('Multiple rep targets; review the full prescription.');
  const restMatches = [
    ...clean.matchAll(
      /\brest\s*[:=]?\s*((?:\d+(?:[.,]\d+)?\s*(?:minutes?|mins?|m|seconds?|secs?|s)\b\s*)+|\d+:\d{2}|\d+(?:\s*-\s*\d+)?)/gi,
    ),
  ];
  let rest = restMatches[0] ? duration(restMatches[0][1]) : null;
  if (restMatches.length > 1) {
    rest = null;
    warnings.push('Multiple rest values; choose one rest duration.');
  }
  if (restMatches[0] && !rest)
    warnings.push(
      'Rest needs an explicit duration/unit (for example 90s or 2 min); ranges need review.',
    );
  if (/\brest\b.*\d+\s*-\s*\d+/i.test(clean)) {
    rest = null;
    warnings.push('Rest is a range; choose a duration.');
  }
  const category: Category = /\bisolation\b/i.test(clean)
    ? 'isolation'
    : /\bcompound\b/i.test(clean)
      ? 'compound'
      : '';
  // Preserve the complete source as notes whenever parsing is incomplete or includes other instructions.
  let name = clean;
  const cuts = [...setReps, ...setMatches, ...afterSets, ...repMatches, ...restMatches]
    .map((m) => m.index!)
    .filter((i) => i >= 0);
  if (cuts.length) name = name.slice(0, Math.min(...cuts));
  name = name
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/^\s*(compound|isolation)\s*[:\-]\s*/i, '')
    .replace(/\((?:compound|isolation)\)/gi, '')
    .replace(/[\s|:;,\-]+$/, '')
    .trim();
  return { name, sets, reps: reps.replace(/\s*-\s*/g, '–'), rest, category, warnings };
}
export function parseTrainingPlan(source: string, customAliases: Aliases = {}): PlanDraft {
  const aliases = { ...builtins };
  for (const [name, key] of Object.entries(customAliases)) aliases[normalize(name)] = key;
  const rotation = /(?:^|[\r\n])\s*Week\s+\d+/i.test(source);
  let week = 1,
    day = '';
  const rows: DraftExercise[] = [],
    notices: string[] = [];
  let workout: WorkoutId | '' = '',
    intensity: Intensity | '' = '',
    globalIntensity: Intensity | '' = '',
    categoryContext: Category = '';
  let compoundSets: number | null = null,
    isolationSets: number | null = null,
    globalCompoundSets: number | null = null,
    globalIsolationSets: number | null = null;
  const unknownContext: string[] = [];
  let canContinue = false;
  function continueDefaults() {
    compoundSets = globalCompoundSets;
    isolationSets = globalIsolationSets;
    categoryContext = '';
  }
  source
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .forEach((original, index) => {
      const line = original.replace(/[\u200b\uFEFF]/g, '').trim();
      if (!line || /^[-=_]{3,}$/.test(line)) return;
      const text = line
        .replace(/^#+\s*/, '')
        .replace(/[\[\]]/g, '')
        .replace(/[:\s]+$/, '');
      const weekHeader = text.match(/^Week\s+(\d+)$/i);
      if (weekHeader) {
        week = Number(weekHeader[1]);
        day = '';
        workout = '';
        intensity = '';
        globalIntensity = '';
        canContinue = false;
        continueDefaults();
        return;
      }
      // Day-qualified session headers are distinct from exercise names such as “DB Press EASY”.
      const session = text.match(
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*[;,:]\s*(.*?)\s*\((Heavy|Hard|Easy)\)$/i,
      );
      const sessionNames: Record<string, WorkoutId> = {
        bench: workouts[0].key,
        'db press': workouts[1].key,
        'leg day': workouts[3].key,
        'hammer press': workouts[2].key,
      };
      const found = session
        ? sessionNames[normalize(session[2])] || heading(session[2], aliases)
        : heading(text, aliases);
      const variant = session ? intensityOf(session[3]) : intensityOf(text);
      // A parenthesized numbered set block always belongs to the preceding exercise.
      if (/^\(/.test(line) && /(?:\d+\s*:|^\(\s*:?\s*\d)/.test(line)) {
        const previous = canContinue ? rows.at(-1) : undefined;
        if (previous) {
          previous.setPrescriptions.push(...parseSetBlock(line));
          previous.sets = previous.setPrescriptions.length;
          previous.source += '\n' + original;
          previous.notes += '\n' + original;
          previous.warnings = previous.warnings.filter(
            (w) => !w.startsWith('[Sets]') && !w.startsWith('No explicit prescription'),
          );
          previous.warnings.push(
            ...setWarnings(previous.setPrescriptions).map((w) => '[Sets] ' + w),
          );
        } else
          notices.push(
            `Line ${index + 1}: orphan set prescription; it was not converted into an exercise: ${line}`,
          );
        return;
      }
      const both = /\b(hard|heavy)\b/i.test(text) && /\beasy\b/i.test(text);
      if (found) {
        canContinue = false;
        workout = found;
        day = session ? session[1][0].toUpperCase() + session[1].slice(1).toLowerCase() : '';
        intensity = variant || globalIntensity;
        categoryContext = '';
        compoundSets = globalCompoundSets;
        isolationSets = globalIsolationSets;
        unknownContext.length = 0;
        const alias = text.match(/\b(?:aka|also called|alias)\s*[:=]?\s*([^)]*)/i);
        if (alias) aliases[normalize(alias[1])] = found;
        if (both) {
          intensity = '';
          notices.push(`Line ${index + 1}: Hard and Easy both appear; assign each row explicitly.`);
        }
        return;
      }
      if (
        /^(?:(?:hard|heavy|easy)(?:\s+(?:week|workout|session))?|(?:week|workout|session)\s+(?:hard|heavy|easy))\s*[:\-]?$/i.test(
          text,
        )
      ) {
        canContinue = false;
        intensity = variant;
        globalIntensity = variant;
        categoryContext = '';
        compoundSets = globalCompoundSets;
        isolationSets = globalIsolationSets;
        return;
      }
      // Explicit file-provided type defaults; never infer an exercise's category from its name.
      if (/\b(compounds?|isolations?)\b.*\bsets?\b/i.test(text) && !/\b[x×]\b/i.test(text)) {
        const defs = [...text.matchAll(/\b(compounds?|isolations?)\s*[:=\-]?\s*(\d+)\s*sets?\b/gi)];
        const remaining = text
          .replace(/\b(compounds?|isolations?)\s*[:=\-]?\s*(\d+)\s*sets?\b/gi, '')
          .replace(/[\s,;|/]+/g, '');
        if (defs.length && !remaining) {
          canContinue = false;
          for (const m of defs) {
            if (m[1].toLowerCase().startsWith('compound')) compoundSets = Number(m[2]);
            else isolationSets = Number(m[2]);
          }
          if (!workout && rows.length === 0) {
            globalCompoundSets = compoundSets;
            globalIsolationSets = isolationSets;
          }
          return;
        }
      }
      const categoryOnly = text.match(/^(compounds?|isolations?)$/i);
      if (categoryOnly) {
        canContinue = false;
        categoryContext = categoryOnly[1].toLowerCase().startsWith('compound')
          ? 'compound'
          : 'isolation';
        return;
      }
      const optional = /^Optional\s*:/i.test(line),
        core = /^Core\s*:/i.test(line);
      const exerciseLine = line.replace(/^(?:Optional|Core)\s*:\s*/i, '');
      const individual = exerciseLine.match(/\s+(HARD|EASY|MID)\s*$/i);
      const parsed = extract(exerciseLine.replace(/\s+(HARD|EASY|MID)\s*$/i, ''));
      // An unrecognized heading resets workout context so subsequent exercises cannot be assigned to the previous day silently.
      if (
        !core &&
        !optional &&
        !parsed.sets &&
        !parsed.reps &&
        !parsed.rest &&
        (/:$/.test(line) || /^#+/.test(line) || /\b(day|workout|session)\b/i.test(text))
      ) {
        canContinue = false;
        workout = '';
        intensity = variant || globalIntensity;
        compoundSets = globalCompoundSets;
        isolationSets = globalIsolationSets;
        categoryContext = '';
        unknownContext.push(text);
        notices.push(
          `Line ${index + 1}: unrecognized heading “${text}”; assign its rows manually or add an alias.`,
        );
        return;
      }
      const previous = rows.at(-1);
      if (
        canContinue &&
        previous &&
        /^(?:sets?|reps?|rest|tempo|rir|rpe|notes?)\b\s*[:=]?/i.test(text)
      ) {
        const p = parsed;
        if (p.sets !== null) {
          if (previous.sets !== null && previous.sets !== p.sets)
            previous.warnings.push('Conflicting set details on a continuation line.');
          previous.sets = p.sets;
        }
        if (p.reps) {
          if (previous.reps && previous.reps !== p.reps)
            previous.warnings.push('Conflicting rep details on a continuation line.');
          previous.reps = p.reps;
        }
        if (p.rest !== null) {
          if (previous.rest !== null && previous.rest !== p.rest)
            previous.warnings.push('Conflicting rest details on a continuation line.');
          previous.rest = p.rest;
        }
        previous.warnings.push(...p.warnings);
        previous.source += '\n' + original;
        previous.notes += '\n' + original;
        return;
      }
      if (!parsed.category) parsed.category = categoryContext;
      if (!rotation && !parsed.sets && !parsed.reps && !parsed.rest)
        parsed.warnings.push(
          'No explicit prescription on this line; verify whether it is an exercise or a heading.',
        );
      const sets =
        parsed.sets ??
        (parsed.category === 'compound'
          ? compoundSets
          : parsed.category === 'isolation'
            ? isolationSets
            : null);
      canContinue = true;
      rows.push({
        week,
        day,
        exerciseIntensity: individual?.[1].toUpperCase() || '',
        setPrescriptions: [],
        optional,
        alternatives:
          parsed.name.split(/\s+or\s+/i).length > 1 ? parsed.name.split(/\s+or\s+/i) : [],
        kind: core ? 'core' : 'exercise',
        allowUnspecifiedRest: rotation,
        allowUnspecifiedSets: rotation && core,
        id: `line-${index + 1}`,
        line: index + 1,
        source: original,
        name: parsed.name,
        workout,
        intensity,
        category: parsed.category,
        sets,
        reps: parsed.reps,
        rest: parsed.rest,
        notes: unknownContext.length ? `Context: ${unknownContext.at(-1)}\n${original}` : original,
        compoundSets,
        isolationSets,
        allowUnspecifiedReps: rotation && core,
        reviewed: false,
        excluded: false,
        warnings: parsed.warnings,
      });
    });
  if (!rows.length)
    notices.push('No exercise rows found. Check the format or add an exercise manually.');
  return { rows, source, notices, rotation };
}
export function rowProblems(row: DraftExercise): string[] {
  if (row.excluded) return [];
  const issues: string[] = [];
  if (!row.name.trim()) issues.push('Exercise name is missing.');
  if (!workouts.some((w) => w.key === row.workout)) issues.push('Assign a workout.');
  if (row.intensity !== 'hard' && row.intensity !== 'easy') issues.push('Choose Hard or Easy.');
  if (
    !(row.sets === null && row.allowUnspecifiedSets) &&
    (!Number.isInteger(row.sets) || Number(row.sets) < 1 || Number(row.sets) > 12)
  )
    issues.push('Enter 1–12 sets.');
  if (
    !(row.rest === null && row.allowUnspecifiedRest) &&
    (!Number.isFinite(row.rest) || Number(row.rest) <= 0 || Number(row.rest) > 3600)
  )
    issues.push('Enter rest in seconds (1–3600).');
  if (!row.reps.trim() && !row.setPrescriptions.length && !row.allowUnspecifiedReps)
    issues.push('Enter reps or explicitly keep them unspecified.');
  if (row.warnings.length && !row.reviewed)
    issues.push('Review and acknowledge the source warnings.');
  return issues;
}
export function draftTemplates(draft: PlanDraft): Plan {
  if (!draft.rows.some((r) => !r.excluded)) throw Error('Include at least one exercise.');
  const plan: Plan = {};
  for (const row of draft.rows) {
    if (row.excluded) continue;
    if (rowProblems(row).length) throw Error(`Line ${row.line}: ${rowProblems(row).join(' ')}`);
    const key = draft.rotation
      ? rotationKey(row.workout as WorkoutId, row.week, row.day, row.intensity)
      : templateKey(row.workout, row.intensity);
    (plan[key] ??= []).push([
      row.name.trim(),
      row.sets!,
      row.rest!,
      {
        reps: row.reps.trim(),
        notes: row.notes,
        category: row.category,
        source: row.source,
        setPrescriptions: row.setPrescriptions,
        exerciseIntensity: row.exerciseIntensity,
        optional: row.optional,
        alternatives: row.alternatives,
        kind: row.kind,
      },
    ]);
  }
  return plan;
}
export function parseAliases(text: string): Aliases {
  const aliases: Aliases = {};
  for (const line of text.split(/\r?\n/).filter((s) => s.trim())) {
    const parts = line.split('=');
    const target = workouts.find((w) => normalize(w.name) === normalize(parts[1] || ''));
    if (parts.length !== 2 || !normalize(parts[0]) || !target)
      throw Error(
        `Invalid alias “${line}”. Use an exact destination, for example Push A = Bench Day.`,
      );
    aliases[parts[0].trim()] = target.key;
  }
  return aliases;
}

/** The only template write entry point. Confirmation and a pre-import snapshot are mandatory. */
export function applyImportedPlan(current: Data, draft: PlanDraft, confirmed: boolean): Data {
  if (confirmed !== true)
    throw Error('Explicit confirmation is required before saving an independent program.');
  const plan = draftTemplates(draft);
  const sessions = draftSessions(draft);
  const program = legacyProgram(draft, plan, sessions);
  return addProgram(current, {
    id: crypto.randomUUID(),
    name: program.name,
    program,
    templates: plan,
    rotation: draft.rotation
      ? { weeks: [...new Set(sessions.map((s) => s.week))], sessions }
      : undefined,
  });
}

export function draftSessions(draft: PlanDraft): RotationSession[] {
  const sessions = new Map<string, RotationSession>();
  for (const r of draft.rows) {
    if (r.excluded || !r.workout || !r.intensity) continue;
    const key = draft.rotation
      ? rotationKey(r.workout, r.week, r.day, r.intensity)
      : templateKey(r.workout, r.intensity);
    if (!sessions.has(key))
      sessions.set(key, {
        key,
        week: r.week,
        day: r.day,
        workout: r.workout,
        intensity: r.intensity,
      });
  }
  return [...sessions.values()];
}
