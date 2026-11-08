import { useState } from 'react';
import type { Data } from './data';
import {
  activateProgram,
  currentProgram,
  programView,
  programWeeks,
  rememberProgram,
  renameProgram,
} from './programs';
import { resizeTemplateSets, compileProgram } from './importing/saving';
import { exerciseIdentity } from './performance';
interface Props {
  data: Data;
  change: (fn: (d: Data) => Data) => void;
}
export function ProgramEditor({ data, change }: Props) {
  const entry = currentProgram(data)!;
  const [selection, setSelection] = useState<{ program: string; week: number; key: string } | null>(
    null,
  );
  const view = programView(entry),
    weeks = programWeeks(entry);
  const week =
    selection?.program === entry.id && weeks.includes(selection.week) ? selection.week : weeks[0];
  const sessions = view.workouts.filter((w) => w.week === week).sort((a, b) => a.order - b.order);
  const selected = sessions.find((w) => w.id === selection?.key) || sessions[0];
  function editName(id: string, name: string) {
    change((d) => {
      const p = currentProgram(d)!;
      const w = p.program?.workouts.find((w) => w.id === selected.id);
      if (w) {
        const e = w.exercises.find((e) => e.id === id)!;
        e.name = name;
        e.identity = exerciseIdentity(name);
        d.trainingProgram = structuredClone(p.program);
        d.plan[selected.id] = compileProgram(p.program!)[selected.id];
      } else {
        const i = Number(id);
        d.plan[selected.id][i][0] = name;
        const meta = d.plan[selected.id][i][3];
        if (meta) meta.exerciseId = exerciseIdentity(name);
      }
      return rememberProgram(d);
    });
  }
  function move(id: string, delta: number) {
    change((d) => {
      const p = currentProgram(d)!;
      const w = p.program?.workouts.find((w) => w.id === selected.id);
      if (w) {
        const i = w.exercises.findIndex((e) => e.id === id),
          j = i + delta;
        if (j < 0 || j >= w.exercises.length) return d;
        [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]];
        w.exercises.forEach((e, i) => (e.order = i));
        d.trainingProgram = structuredClone(p.program);
        d.plan[selected.id] = compileProgram(p.program!)[selected.id];
      } else {
        const rows = d.plan[selected.id],
          i = Number(id),
          j = i + delta;
        if (j < 0 || j >= rows.length) return d;
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      return rememberProgram(d);
    });
  }
  return (
    <section className="card program-editor" aria-label="Workout plan editor">
      <h2>Workout plan</h2>
      <p className="muted">
        Select a complete program. Template edits apply to future workouts; history and a running
        session stay unchanged.
      </p>
      <label htmlFor="training-program">TRAINING PROGRAM</label>
      <select
        id="training-program"
        value={entry.id}
        onChange={(e) => {
          change((d) => activateProgram(d, e.target.value));
          setSelection(null);
        }}
      >
        {data.programs!.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.id === data.activeProgramId ? ' · Active' : ''}
          </option>
        ))}
      </select>
      <button
        className="small program-rename"
        onClick={() => {
          const name = prompt('Program name', entry.name);
          if (name !== null) change((d) => renameProgram(d, entry.id, name));
        }}
      >
        Rename program
      </button>
      <p className="muted" role="status">
        Active on Train: {entry.name}
      </p>
      {entry.review && (
        <aside className="notice" role="alert">
          <p>{entry.review}</p>
          <button
            onClick={() =>
              change((d) => {
                const p = currentProgram(d)!;
                delete p.review;
                return p.name.startsWith('Needs review · ')
                  ? renameProgram(d, p.id, p.name.slice('Needs review · '.length))
                  : d;
              })
            }
          >
            I reviewed this independent program and its original templates
          </button>
        </aside>
      )}
      {weeks.length > 1 && (
        <>
          <label htmlFor="program-week">WEEK</label>
          <select
            id="program-week"
            value={week}
            onChange={(e) =>
              setSelection({ program: entry.id, week: Number(e.target.value), key: '' })
            }
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </>
      )}
      {selected ? (
        <>
          <label htmlFor="plan">WORKOUT DAY / SESSION</label>
          <select
            id="plan"
            value={selected.id}
            onChange={(e) => setSelection({ program: entry.id, week, key: e.target.value })}
          >
            {sessions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.day ? `${w.day} · ` : ''}
                {w.name}
                {w.intensity ? ` · ${w.intensity.toUpperCase()}` : ''}
              </option>
            ))}
          </select>
          {(entry.templates[selected.id] || []).map(([name, count, rest], i) => {
            const id =
              entry.program?.workouts.find((w) => w.id === selected.id)?.exercises[i]?.id ||
              String(i);
            return (
              <div className="program-exercise" key={id}>
                <label>
                  EXERCISE {i + 1}
                  <input
                    aria-label={`Exercise ${i + 1} name`}
                    value={name}
                    onChange={(e) => editName(id, e.target.value)}
                  />
                </label>
                <div className="plan-row">
                  <p className="muted">
                    {count ?? 'Unspecified'} sets ·{' '}
                    {rest === null ? 'Rest unspecified' : `${rest}s rest`}
                  </p>
                  <div className="stepper">
                    <button
                      aria-label={`Fewer sets ${name}`}
                      disabled={count === null || count <= 1}
                      onClick={() =>
                        change((d) => resizeTemplateSets(d, selected.id, i, (count ?? 1) - 1))
                      }
                    >
                      −
                    </button>
                    <button
                      aria-label={`More sets ${name}`}
                      disabled={count !== null && count >= 100}
                      onClick={() =>
                        change((d) => resizeTemplateSets(d, selected.id, i, (count ?? 0) + 1))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="program-order">
                  <button
                    aria-label={`Move ${name} earlier`}
                    disabled={!i}
                    onClick={() => move(id, -1)}
                  >
                    ↑ Move up
                  </button>
                  <button
                    aria-label={`Move ${name} later`}
                    disabled={i === entry.templates[selected.id].length - 1}
                    onClick={() => move(id, 1)}
                  >
                    ↓ Move down
                  </button>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <p className="muted">
          This program has no individual sessions. Edit its program notes below; no workout days
          have been created.
        </p>
      )}
      <details>
        <summary>Program notes and original source</summary>
        <label>
          PROGRAM NOTES
          <textarea
            aria-label="Program notes"
            value={entry.notes || ''}
            onChange={(e) =>
              change((d) => {
                currentProgram(d)!.notes = e.target.value;
                return d;
              })
            }
          />
        </label>
        {entry.program?.source.text && (
          <pre className="program-source">{entry.program.source.text}</pre>
        )}
      </details>
    </section>
  );
}
