import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { pagesText } from './pages';
import { extractDocument, textDocument } from './extraction';
import { parseProgram } from './parser';
import { assertProgram, programIssues, programProblems } from './model';
import { compileProgram } from './compilation';
import { emptyData, mergeBackup, parseData } from '../data';
import { applyProgram } from './saving';
const bytes = readFileSync('tests/fixtures/girlfriend-training-plan.pages');
const source = () => pagesText(unzipSync(bytes)).text;
const expected = [
  [
    [12, 12, 'no fail'],
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
  ],
  [
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
  ],
  [
    [15, 15, 'half fail'],
    [15, 20, 'half fail'],
  ],
  [
    [12, 12, 'no fail'],
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
  ],
  [
    [15, 15, 'half fail'],
    [15, 20, 'half fail'],
  ],
  [
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
    [12, 15, 'half fail'],
  ],
  [
    [12, 12, 'no fail'],
    [10, 12, 'half fail'],
    [10, 12, 'half fail'],
  ],
  [
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
  ],
  [
    [12, 12, 'no fail'],
    [10, 12, 'half fail'],
    [10, 12, 'half fail'],
  ],
  [
    [12, 12, 'half fail'],
    [10, 12, 'half fail'],
  ],
  [
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
  ],
  [
    [12, 12, 'half fail'],
    [12, 15, 'half fail'],
  ],
];
describe('real Pages plan extraction and parsing', () => {
  it('extracts typed body text with paragraphs and soft line breaks, without metadata', async () => {
    const doc = await extractDocument(new File([bytes], 'girlfriend.pages'));
    expect(doc.format).toBe('pages');
    expect(doc.warnings).toEqual([]);
    expect(doc.text).toContain('1. Leg Press\n(1:12 no fail;');
    expect(doc.text).toContain('half fail)\u20282. Core Crunch Machine');
    expect(doc.text).not.toContain('PresetImage');
    expect(doc.text).toBe(source());
  });
  it('preserves the exact 12 prescriptions, a single week, two sessions and alternative days', () => {
    const p = parseProgram(textDocument(source()));
    expect(p.workouts.map((w) => [w.week, w.name, w.day, w.exercises.length])).toEqual([
      [1, 'Leg Day', 'Friday / Sunday', 6],
      [1, 'Upper Body & Core', 'Saturday', 6],
    ]);
    expect(p.rotation).toBeNull();
    const exercises = p.workouts.flatMap((w) => w.exercises);
    expect(exercises.map((e) => e.name)).toEqual([
      'Leg Press',
      'Leg Extensions',
      'Abductors',
      'Hip Thrusts',
      'Calves',
      'Leg Curls',
      'Hammer Press',
      'Core Crunch Machine',
      'T-bar Row (chest supported)',
      'Cable Bicep Curl',
      'Triceps Pushdown',
      'Lateral Raises',
    ]);
    expect(exercises.map((e) => e.setCount)).toEqual([3, 2, 2, 3, 2, 3, 3, 2, 3, 2, 2, 2]);
    expect(exercises.map((e) => e.sets.map((s) => [s.minReps, s.maxReps, s.effort]))).toEqual(
      expected,
    );
    expect(exercises.every((e) => e.sets.every((s, i) => s.number === i + 1))).toBe(true);
    expect(p.notes).toContain('first 2 weeks');
    expect(p.notes).toContain('10–15 min incline walking');
    expect(p.notes).toContain('No fail = 4+ reps left.');
    expect(p.notes).toContain('Warm up for 5 minutes');
    expect(programIssues(p)).toEqual([]);
    expect(programProblems(p)).toEqual([]);
    expect(
      compileProgram(p)[p.workouts[0].id][0][3]?.setPrescriptions?.map((s) => [
        s.minReps,
        s.maxReps,
        s.effort,
      ]),
    ).toEqual(expected[0]);
  });
  it.each(['Friday OR Sunday', 'Fri / Sun'])(
    'attaches schedule %s and wrapped prescriptions to one workout',
    (day) => {
      const p = parseProgram(
        textDocument(
          `Program: Variant\nGeneral instructions:\n- Begin with 2 working sets for the first 2 weeks\n# Workout A — Legs\nSchedule: ${day}\n1) Squat\n(1:8 no fail;\n2:10 half fail)\n2) Curl\n1:10 no fail\n2:12 half fail\nOptional cardio:\n- Walk for 10 minutes`,
        ),
      );
      expect(p.workouts).toHaveLength(1);
      expect(p.rotation).toBeNull();
      expect(p.workouts[0].day).toBe(day);
      expect(p.workouts[0].exercises.map((e) => e.setCount)).toEqual([2, 2]);
      expect(programIssues(p)).toEqual([]);
      expect(p.notes).toContain('Walk for 10 minutes');
    },
  );
  it('retains real ambiguities and does not invent missing sets', () => {
    const p = parseProgram(
      textDocument(
        'Workout A\n1. Squat\n(1:8 no fail; 3:10 half fail)\nSchedule: Friday and maybe Tuesday',
      ),
    );
    expect(p.workouts[0].exercises[0].sets.map((s) => s.number)).toEqual([1, 3]);
    expect(programIssues(p).some((i) => i.message.includes('Missing set'))).toBe(true);
    expect(p.issues.some((i) => i.message.includes('Schedule:'))).toBe(true);
  });
  it('requires confirmation; notes and prescriptions survive backups without changing history', () => {
    const p = parseProgram(textDocument(source()));
    expect(() => applyProgram(emptyData(), p, false)).toThrow();
    const before = emptyData();
    const after = applyProgram(before, p, true);
    const restored = mergeBackup(emptyData(), parseData(JSON.parse(JSON.stringify(after))));
    expect(restored.trainingProgram).toEqual(p);
    expect(after.history).toEqual(before.history);
    const legacy = structuredClone(p);
    delete legacy.notes;
    expect(() => assertProgram(legacy)).not.toThrow();
    expect(() => assertProgram({ ...p, notes: 42 })).toThrow();
  });
  it('rejects malformed IWA safely and reports ambiguous multiple text flows', () => {
    expect(() => pagesText({ 'Index/Document.iwa': new Uint8Array([0, 255, 255, 255]) })).toThrow(
      'Export it as DOCX',
    );
    const files = unzipSync(bytes);
    expect(
      pagesText({ ...files, 'Index/Copy.iwa': files['Index/Document.iwa'] }).warnings,
    ).toHaveLength(1);
  });
});
