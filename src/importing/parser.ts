import { exerciseIdentity } from '../performance';
import { parseSetBlock, setWarnings } from '../prescriptions';
import {
  issue,
  stableId,
  type TrainingProgram,
  type ProgramWorkout,
  type ProgramExercise,
  type SourceRef,
  type TargetSet,
} from './model';
import type { ExtractedDocument } from './extraction';
const weekday =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[\s;:–—-]*(.*)$/i;
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const intensity = (s: string) => /\b(?:HARD|HEAVY|EASY|MID)\b/i.exec(s)?.[0].toUpperCase() ?? null;
const cleanIntensity = (s: string) =>
  s
    .replace(/\s*\(?\b(?:HARD|HEAVY|EASY|MID)\b\)?/gi, '')
    .replace(/[\s:;–—-]+$/, '')
    .trim();
function seconds(s: string): number | null {
  const clock = /^(\d+):(\d{2})$/.exec(s.trim());
  if (clock) return Number(clock[2]) < 60 ? Number(clock[1]) * 60 + Number(clock[2]) : null;
  let total = 0,
    found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|m|sec(?:ond)?s?|s)\b/gi)) {
    total += Number(m[1]) * (m[2].toLowerCase().startsWith('m') ? 60 : 1);
    found = true;
  }
  return found ? total : null;
}
export function targetFromText(text: string, source: SourceRef): TargetSet {
  const reps = /(?:^|[x×:=\s])(\d+)(?:\s*[-–—]\s*(\d+))?\s*(?:reps?\b|$)/i.exec(text.trim());
  const weight = /(?:@\s*)?(\d+(?:\.\d+)?)\s*(kg|lbs?|%\s*(?:1rm)?)/i.exec(text);
  const rest =
    /\brest\s*[:=]?\s*((?:\d+(?:\.\d+)?\s*(?:min(?:ute)?s?|m|sec(?:ond)?s?|s)\b\s*)+|\d+:\d{2})/i.exec(
      text,
    );
  return {
    number: null,
    minReps: reps ? Number(reps[1]) : null,
    maxReps: reps ? Number(reps[2] || reps[1]) : null,
    repsText: /\b(AMRAP|failure)\b/i.exec(text)?.[1] || null,
    weight: weight ? { value: Number(weight[1]), unit: weight[2].toLowerCase() } : null,
    rpe: /\bRPE\s*[:=@]?\s*(\d+(?:\.\d+)?)/i.test(text)
      ? Number(/\bRPE\s*[:=@]?\s*(\d+(?:\.\d+)?)/i.exec(text)![1])
      : null,
    rir: /\bRIR\s*[:=@]?\s*(\d+(?:\.\d+)?)/i.test(text)
      ? Number(/\bRIR\s*[:=@]?\s*(\d+(?:\.\d+)?)/i.exec(text)![1])
      : null,
    effort:
      /\b(?:no fail|half fail(?: fail)?|fail(?:ure)?|to failure|AMRAP)\b/i.exec(text)?.[0] || null,
    restSeconds: rest ? seconds(rest[1]) : null,
    source,
  };
}
function parseExercise(
  raw: string,
  ref: SourceRef,
  order: number,
  groupId: string | null,
): ProgramExercise {
  const stripped = raw
    .replace(/^\s*(?:[-*•]|\d+[.)]|[A-Z]\d+[.)]?)\s*/, '')
    .replace(/^Optional:\s*/i, '')
    .replace(/^Core:\s*/i, '');
  const mx = /\b(\d+)\s*[x×]\s*(\d+(?:\s*[-–—]\s*\d+)?|AMRAP|failure)\b/i.exec(stripped);
  const sets = /\b(\d+)\s*sets?\b/i.exec(stripped);
  const cut = [
    mx?.index,
    sets?.index,
    stripped.search(/\b(?:rest|RPE|RIR)\b|\d+\s*reps?\b|@\s*\d/i),
  ].filter((i): i is number => i !== undefined && i >= 0);
  const prefix = (cut.length ? stripped.slice(0, Math.min(...cut)) : stripped).replace(
    /[\s:;|–—-]+$/,
    '',
  );
  const name = cleanIntensity(prefix);
  const count = mx ? Number(mx[1]) : sets ? Number(sets[1]) : null;
  const target = targetFromText(stripped, ref);
  if (mx) {
    const r = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(mx[2]);
    target.minReps = r ? Number(r[1]) : null;
    target.maxReps = r ? Number(r[2] || r[1]) : null;
  }
  const alternatives = name.split(/\s+(?:or|\/)\s+/i);
  const e: ProgramExercise = {
    id: `entry-${stableId(name + ref.line + order)}`,
    identity: exerciseIdentity(name),
    name,
    order,
    intensity: intensity(prefix),
    setCount: count && count <= 100 ? count : null,
    defaultTarget: target,
    sets:
      count && count <= 100
        ? Array.from({ length: count }, (_, i) => ({ ...target, number: i + 1 }))
        : [],
    optional: /^\s*(?:[-*•]\s*)?Optional:/i.test(raw),
    alternatives: alternatives.length > 1 ? alternatives : [],
    groupId,
    notes: raw,
    source: [ref],
    issues: [],
  };
  if (count !== null && count > 100)
    e.issues.push(issue('Set count exceeds 100. Review this prescription.', ref));
  if (!count)
    e.issues.push(issue('Set count is unspecified. Review and keep unset or enter it.', ref));
  if (target.minReps === null && !target.repsText)
    e.issues.push(issue('Target reps are unspecified. Review and keep unset or enter them.', ref));
  if (target.restSeconds === null)
    e.issues.push(issue('Rest is unspecified; no rest duration was inferred.', ref));
  if (/\brest\b/i.test(stripped) && target.restSeconds === null)
    e.issues.push(issue('Rest expression could not be interpreted. See source.', ref));
  const range = /\b\d+\s*[-–—]\s*\d+\s*(?:[x×]|sets?)/i.exec(stripped);
  const prescriptions = [...stripped.matchAll(/\b\d+\s*[x×]\s*(?:\d+|AMRAP)/gi)];
  if (range || prescriptions.length > 1) {
    if (range) {
      e.name = cleanIntensity(stripped.slice(0, range.index).replace(/[\s–—-]+$/, ''));
      e.identity = exerciseIdentity(e.name);
    }
    e.setCount = null;
    e.sets = [];
    e.issues.push(
      issue(
        'Multiple or ranged set prescriptions are unsupported here. Review the source and enter individual sets, or keep the count unspecified.',
        ref,
      ),
    );
  }
  for (const key of ['rpe', 'rir'] as const) {
    const ranges = [...stripped.matchAll(/\b(RPE|RIR)\s*[:=@]?\s*\d+(?:\.\d+)?\s*[-–—]\s*\d+/gi)];
    if (ranges.some((m) => m[1].toLowerCase() === key)) {
      e.sets.forEach((s) => (s[key] = null));
      if (e.defaultTarget) e.defaultTarget[key] = null;
      e.issues.push(
        issue(
          `${key.toUpperCase()} is a range. Enter a single target or keep it unspecified.`,
          ref,
        ),
      );
    }
  }
  if ([...stripped.matchAll(/\b\d+(?:\.\d+)?\s*(?:kg|lbs?)\b/gi)].length > 1) {
    e.sets.forEach((s) => (s.weight = null));
    if (e.defaultTarget) e.defaultTarget.weight = null;
    e.issues.push(issue('Multiple weight targets require individual set review.', ref));
  }
  return e;
}
export function parseProgram(doc: ExtractedDocument): TrainingProgram {
  const p: TrainingProgram = {
    schemaVersion: 1,
    id: `program-${stableId(doc.name)}`,
    name: '',
    source: { name: doc.name, format: doc.format, text: doc.text },
    workouts: [],
    rotation: null,
    issues: doc.warnings.map((w) => issue(w)),
  };
  let week = 1,
    current: ProgramWorkout | undefined,
    group: string | null = null,
    line = 0;
  const weeks = new Set<number>();
  function workout(
    name: string,
    day: string | null,
    ref: SourceRef,
    sessionIntensity: string | null = null,
  ) {
    const title = cleanIntensity(name) || day || '';
    const ordinal = p.workouts.filter((w) => w.week === week && w.name === title).length;
    const slotId = `slot-${stableId(title.toLowerCase() + ':' + ordinal)}`;
    // Repeated heading never merges two independently described sessions silently.
    const id = `${p.id}:week-${week}:${slotId}:${p.workouts.filter((w) => w.week === week && w.slotId === slotId).length}`;
    current = {
      id,
      slotId,
      name: title,
      week,
      day,
      order: p.workouts.length,
      intensity: sessionIntensity,
      exercises: [],
      groups: [],
      source: [ref],
    };
    p.workouts.push(current);
    weeks.add(week);
    group = null;
  }
  function unsupported(text: string, ref: SourceRef) {
    p.issues.push(issue(`Unsupported or informational source section: ${text}`, ref));
  }
  function add(raw: string, ref: SourceRef) {
    if (!current) {
      unsupported(raw, ref);
      return;
    }
    const ex = parseExercise(raw, ref, current.exercises.length, group);
    if (!ex.name || !/\p{L}/u.test(ex.name)) {
      unsupported(raw, ref);
      return;
    }
    current.exercises.push(ex);
  }
  function text(raw: string, extra: Partial<SourceRef> = {}) {
    line++;
    const value = raw
      .normalize('NFKC')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!value) return;
    const ref: SourceRef = { line, text: raw, ...extra };
    const wm = /^(?:#{1,6}\s*)?Week\s+(\d+)(?:\s*[:–—-]\s*.*)?\s*$/i.exec(value);
    if (wm) {
      week = Number(wm[1]);
      weeks.add(week);
      current = undefined;
      group = null;
      return;
    }
    if (/^(?:program(?: name)?|routine|plan)\s*:/i.test(value)) {
      p.name = value.replace(/^[^:]+:\s*/, '');
      return;
    }
    if (/^(?:note|notes|warning|instructions|progression|rest days?)\b/i.test(value)) {
      unsupported(value, ref);
      return;
    }
    const dm = weekday.exec(value);
    if (dm) {
      const day = dayNames.find((d) =>
        d.toLowerCase().startsWith(dm[1].toLowerCase().slice(0, 3)),
      )!;
      if (/^rest\b/i.test(dm[2])) return;
      workout(dm[2] || day, day, ref, intensity(dm[2]));
      return;
    }
    const gh = /^(superset|circuit)\b\s*(.*)/i.exec(value);
    if (gh && current) {
      group = `group-${stableId(current.id + value)}`;
      current.groups.push({
        id: group,
        type: gh[1].toLowerCase() as 'superset' | 'circuit',
        name: value,
        rounds: /\b(\d+)\s*rounds?/i.test(value)
          ? Number(/\b(\d+)\s*rounds?/i.exec(value)![1])
          : null,
      });
      return;
    }
    if (/^(?:end (?:superset|circuit)|straight sets)\b/i.test(value)) {
      group = null;
      return;
    }
    if (/^\(?\s*\d+\s*:\s*\d/.test(value)) {
      const ex = current?.exercises.at(-1);
      if (!ex) {
        unsupported(value, ref);
        return;
      }
      const sets = parseSetBlock(value);
      ex.sets = sets.map((s) => ({
        ...targetFromText(s.effort, ref),
        number: s.number,
        minReps: s.minReps,
        maxReps: s.maxReps,
        effort: s.effort || null,
      }));
      ex.setCount = sets.length;
      ex.source.push(ref);
      ex.issues = ex.issues.filter(
        (i) =>
          !i.message.startsWith('Set count is unspecified') &&
          !i.message.startsWith('Target reps are unspecified'),
      );
      ex.issues.push(...setWarnings(sets).map((m) => issue(m, ref)));
      return;
    }
    if (/^\(?\s*\d+\s*[x×]\s*\d/.test(value)) {
      const ex = current?.exercises.at(-1);
      if (!ex) {
        unsupported(value, ref);
        return;
      }
      const parsed = parseExercise(`${ex.name} ${value}`, ref, ex.order, ex.groupId);
      ex.sets = parsed.sets;
      ex.setCount = parsed.setCount;
      ex.source.push(ref);
      ex.issues = parsed.issues;
      return;
    }
    const numbered = /^\s*(?:[-*•]|\d+[.)]|[A-Z]\d+[.)]?)\s*/.test(value);
    const prescribed = /\b\d+\s*[x×]\s*(?:\d|AMRAP)|\b\d+\s*sets?\b/i.test(value);
    const heading =
      !numbered &&
      !prescribed &&
      !/^Optional:|^Core:/i.test(value) &&
      (/^(?:Workout|Session)\s+\S/i.test(value) ||
        /^Day\s+(?:\d+|[A-Z])\b/i.test(value) ||
        /^(?:Upper|Lower|Full[ -]body|Push|Pull|Legs)(?:\s+[A-F1-6])?\s*[:(]?[\w\s)]*$/i.test(
          value,
        ) ||
        /^[A-F]\s*[:)]$/.test(value) ||
        /^#{1,6}\s/.test(value) ||
        /:$/.test(value));
    if (heading) {
      workout(value.replace(/^#{1,6}\s*/, '').replace(/:$/, ''), null, ref, intensity(value));
      return;
    }
    if (!p.name && !current && !numbered && !prescribed) {
      p.name = value;
      return;
    }
    if (numbered || prescribed || /^Optional:|^Core:/i.test(value)) {
      add(value, ref);
      return;
    }
    if (
      current &&
      /^[\p{L}][\p{L}\p{N}\s/()–—-]{1,75}$/u.test(value) &&
      value.split(/\s+/).length < 9
    ) {
      add(value, ref);
      current.exercises
        .at(-1)!
        .issues.push(
          issue('Unmarked line: verify that this is an exercise, not an instruction.', ref),
        );
      return;
    }
    unsupported(value, ref);
  }
  function table(rows: string[][], extra: Partial<SourceRef>) {
    if (!rows.length) return;
    const header = rows[0].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const nameCol = find('exercise', 'exercisename', 'movement');
    if (nameCol < 0) {
      unsupported(
        'Table has no recognized Exercise column. Add column headings or paste as text.',
        { line: ++line, text: rows[0].join(' | '), ...extra },
      );
      for (const r of rows.slice(1)) line++;
      return;
    }
    const col = (r: string[], ...names: string[]) => r[find(...names)]?.trim() || '';
    line++;
    const tableWorkouts = new Map<string, ProgramWorkout>();
    rows.slice(1).forEach((r, rowIndex) => {
      line++;
      if (!r.some((c) => c.trim())) return;
      const ref: SourceRef = { line, text: r.join(' | '), row: rowIndex + 2, ...extra };
      const w = col(r, 'week');
      if (w) {
        if (!/^\d+$/.test(w)) {
          unsupported('Week must be numeric: ' + w, ref);
          return;
        }
        week = Number(w);
      }
      const title = col(r, 'workout', 'session', 'workoutname'),
        day = col(r, 'day', 'weekday') || null;
      if (title) {
        const key = JSON.stringify([week, title, day]);
        const existing = tableWorkouts.get(key);
        if (existing) current = existing;
        else {
          workout(title, day, ref, col(r, 'sessionintensity') || null);
          tableWorkouts.set(key, current!);
        }
      } else if (!current) {
        unsupported('Table row needs a workout assignment.', ref);
        return;
      }
      const name = r[nameCol]?.trim();
      if (!name) {
        unsupported('Table row has no exercise name.', ref);
        return;
      }
      const sets = col(r, 'sets', 'setcount'),
        reps = col(r, 'reps', 'targetreps'),
        rest = col(r, 'rest', 'restseconds'),
        weight = col(r, 'weight', 'targetweight'),
        unit = col(r, 'unit', 'weightunit');
      const raw = `${name}${sets ? ` ${sets} sets` : ''}${reps ? ` ${reps} reps` : ''}${rest ? ` rest ${rest}${header.includes('restseconds') ? 's' : ''}` : ''}${weight ? ` @ ${weight} ${unit}` : ''}${col(r, 'rpe') ? ` RPE ${col(r, 'rpe')}` : ''}${col(r, 'rir') ? ` RIR ${col(r, 'rir')}` : ''}${col(r, 'effort') ? ` ${col(r, 'effort')}` : ''}`;
      const ex = parseExercise(raw, ref, current!.exercises.length, null);
      if (col(r, 'effort')) {
        ex.sets.forEach((s) => (s.effort = col(r, 'effort')));
        if (ex.defaultTarget) ex.defaultTarget.effort = col(r, 'effort');
      }
      ex.name = name;
      ex.identity = exerciseIdentity(name);
      ex.intensity = col(r, 'intensity', 'exerciseintensity') || null;
      ex.optional = /^(?:true|yes|1|optional)$/i.test(col(r, 'optional'));
      if (col(r, 'alternatives'))
        ex.alternatives = col(r, 'alternatives').split(/\s*\|\s*|\s+or\s+/i);
      const groupName = col(r, 'superset', 'circuit', 'group');
      if (groupName) {
        ex.groupId = `group-${stableId(current!.id + groupName)}`;
        if (!current!.groups.some((g) => g.id === ex.groupId))
          current!.groups.push({
            id: ex.groupId,
            name: groupName,
            type: find('circuit') >= 0 ? 'circuit' : 'superset',
            rounds: null,
          });
      }
      const set = col(r, 'set', 'setnumber');
      if (set) {
        ex.issues = ex.issues.filter((i) => !i.message.startsWith('Set count is unspecified'));
        const prior = current!.exercises.at(-1);
        const target = {
          ...targetFromText(raw, ref),
          ...(col(r, 'effort') ? { effort: col(r, 'effort') } : {}),
          number: /^\d+$/.test(set) ? Number(set) : null,
        };
        if (prior?.name === ex.name && prior.intensity === ex.intensity) {
          prior.sets.push(target);
          prior.setCount = prior.sets.length;
          prior.source.push(ref);
          prior.issues.push(...ex.issues);
        } else {
          ex.sets = [target];
          ex.setCount = 1;
          current!.exercises.push(ex);
        }
      } else current!.exercises.push(ex);
      const known = [
        'exercise',
        'exercisename',
        'movement',
        'week',
        'workout',
        'session',
        'workoutname',
        'day',
        'weekday',
        'sets',
        'setcount',
        'reps',
        'targetreps',
        'rest',
        'restseconds',
        'weight',
        'targetweight',
        'unit',
        'weightunit',
        'rpe',
        'rir',
        'effort',
        'intensity',
        'exerciseintensity',
        'sessionintensity',
        'optional',
        'alternatives',
        'set',
        'setnumber',
        'superset',
        'circuit',
        'group',
        'notes',
      ];
      for (let i = 0; i < header.length; i++)
        if (!known.includes(header[i]) && r[i])
          p.issues.push(issue(`Unsupported column ${rows[0][i]}: ${r[i]}`, ref));
      if (weight && !unit && !ex.sets[0]?.weight)
        ex.issues.push(
          issue('Weight has no unit. Enter a unit or keep this target unspecified.', ref),
        );
      ex.notes = col(r, 'notes') || ref.text;
    });
  }
  for (const block of doc.blocks) {
    const extra = {
      ...(block.page ? { page: block.page } : {}),
      ...(block.sheet ? { sheet: block.sheet } : {}),
    };
    if (block.rows) table(block.rows, extra);
    else for (const l of (block.text || '').split(/\r\n?|\n/)) text(l, extra);
  }
  p.name = p.name || doc.name.replace(/\.[^.]+$/, '');
  if (weeks.size > 1) p.rotation = { weeks: [...weeks].sort((a, b) => a - b), repeat: true };
  for (const w of p.workouts)
    for (const e of w.exercises) {
      const nums = e.sets.map((s) => s.number);
      if (
        nums.length &&
        (new Set(nums).size !== nums.length ||
          nums.some((n) => n === null) ||
          nums.some((n) => n !== null && !nums.includes(n - 1) && n > 1))
      )
        e.issues.push(
          issue(
            'Missing, duplicate or nonsequential source set numbers. Original numbering was kept.',
            e.source[0],
          ),
        );
    }
  if (!p.workouts.length)
    p.issues.push(
      issue(
        'No supported workout headings were found. Unsupported sections were not converted into exercises.',
      ),
    );
  return p;
}
