import { useState } from 'react';
import {
  parseTrainingPlan,
  parseAliases,
  rowProblems,
  draftTemplates,
  type PlanDraft,
  type DraftExercise,
} from './plan-import';
import { workouts, templateLabel, type WorkoutId, type Intensity } from './workouts';
interface Props {
  onApply: (draft: PlanDraft) => Promise<void>;
}
export function PlanImporter({ onApply }: Props) {
  const [source, setSource] = useState(''),
    [aliases, setAliases] = useState(''),
    [parsedAliases, setParsedAliases] = useState('');
  const [draft, setDraft] = useState<PlanDraft | null>(null),
    [error, setError] = useState(''),
    [applied, setApplied] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [filename, setFilename] = useState('');
  const stale = !!draft && (draft.source !== source || aliases !== parsedAliases);
  const issues = draft?.rows.filter((r) => !r.excluded).flatMap(rowProblems) || [];
  const included = draft?.rows.filter((r) => !r.excluded) || [];
  let groups: Record<string, unknown[]> = {};
  if (draft && included.length && !issues.length) groups = draftTemplates(draft);
  function update(id: string, patch: Partial<DraftExercise>) {
    setConfirmed(false);
    setApplied(false);
    setDraft((d) =>
      d ? { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : d,
    );
  }
  async function readFile(file: File) {
    setError('');
    try {
      if (!/\.txt$/i.test(file.name)) throw Error('Choose a TXT file.');
      if (file.size > 1_048_576) throw Error('The TXT file must be 1 MB or smaller.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoding =
        bytes[0] === 255 && bytes[1] === 254
          ? 'utf-16le'
          : bytes[0] === 254 && bytes[1] === 255
            ? 'utf-16be'
            : 'utf-8';
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (text.includes('\0')) throw Error('This does not look like a text file.');
      setSource(text);
      setFilename(file.name);
      setConfirmed(false);
      setApplied(false);
    } catch (e) {
      setError('File not loaded: ' + (e as Error).message);
    }
  }
  function parse() {
    try {
      if (source.length > 1_048_576) throw Error('The plan text must be 1 MB or smaller.');
      if (source.split(/\r\n?|\n/).length > 2000)
        throw Error('Please import at most 2,000 lines at a time.');
      if (!source.trim()) throw Error('Choose a TXT file or paste your plan first.');
      const custom = parseAliases(aliases);
      if (
        draft &&
        !confirm(
          'Reparse the source? This discards preview edits only. Your saved templates will not change.',
        )
      )
        return;
      setDraft(parseTrainingPlan(source, custom));
      setParsedAliases(aliases);
      setConfirmed(false);
      setApplied(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function reorder(index: number, direction: number) {
    setConfirmed(false);
    setApplied(false);
    setDraft((d) => {
      if (!d) return d;
      const rows = [...d.rows];
      [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]];
      return { ...d, rows };
    });
  }
  return (
    <section className="card plan-importer" aria-labelledby="import-title">
      <h2 id="import-title">Import Training Plan</h2>
      <p className="muted">
        Read a TXT file locally, then review every exercise. Uploading and previewing never change
        your saved templates. No AI service or account is needed.
      </p>
      <label htmlFor="plan-file">UPLOAD TXT FILE</label>
      <input
        id="plan-file"
        type="file"
        accept=".txt,text/plain"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
          e.target.value = '';
        }}
      />
      {filename && <p className="muted">Loaded: {filename}</p>}
      <label htmlFor="plan-source">OR PASTE / EDIT THE PLAN TEXT</label>
      <textarea
        id="plan-source"
        value={source}
        rows={7}
        disabled={busy}
        onChange={(e) => {
          setSource(e.target.value);
          setConfirmed(false);
          setApplied(false);
        }}
        placeholder={
          'Bench Day — Hard\nBench Press — 4 x 6–8 — rest 3 min\nCable Fly — 3 x 12 — rest 90s'
        }
      />
      <details>
        <summary>Supported formats and alternative workout names</summary>
        <p className="muted">
          Use workout headings and Hard / Easy labels. Examples: “Bench Day — Hard”, “4 x 6–8”, “3
          sets, 12 reps, rest 90s”, “rest 1:30”. Reps, tempo, RIR and other source instructions are
          retained. Defaults such as “Compounds: 4 sets; Isolation: 3 sets” apply only when a
          category is explicitly supplied or selected.
        </p>
        <p className="muted">
          Unknown headings and missing values need manual review. Assign a custom heading using one
          alias per line, or edit each row below. File headings may also use “Bench Day (aka Push
          A)”.
        </p>
        <label htmlFor="plan-aliases">OPTIONAL WORKOUT ALIASES</label>
        <textarea
          id="plan-aliases"
          rows={3}
          value={aliases}
          disabled={busy}
          onChange={(e) => {
            setAliases(e.target.value);
            setConfirmed(false);
            setApplied(false);
          }}
          placeholder={'Push A = Bench Day\nUpper B = DB Press Day'}
        />
      </details>
      <button className="full" disabled={busy} onClick={parse}>
        {draft ? 'Reparse TXT' : 'Parse TXT'}
      </button>
      {error && (
        <p role="alert" className="import-warning">
          {error}
        </p>
      )}
      {applied && (
        <p role="status" className="import-success">
          Plan applied. History, PRs and your active workout were kept. New templates apply to
          future sessions.
        </p>
      )}
      {draft && (
        <div aria-label="Editable plan preview">
          <h3>Editable preview</h3>
          <p className="muted">
            {included.length} included · {draft.rows.length - included.length} excluded. Rows keep
            the file’s original order unless you move them.
          </p>
          {stale && (
            <p className="import-warning" role="status">
              The source or aliases changed. Reparse before applying.
            </p>
          )}
          {draft.notices.length > 0 && (
            <details open>
              <summary>Parser notices</summary>
              <ul className="parser-notices">
                {draft.notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {draft.rows.map((row, index) => {
            const problems = rowProblems(row),
              id = `import-${row.id}`;
            return (
              <fieldset
                key={row.id}
                className={`import-row ${row.excluded ? 'excluded' : ''}`}
                disabled={busy}
              >
                <legend>
                  Exercise {index + 1} · source line {row.line}
                </legend>
                <details>
                  <summary>Original source</summary>
                  <pre>{row.source}</pre>
                </details>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!row.excluded}
                    onChange={(e) => update(row.id, { excluded: !e.target.checked })}
                  />
                  Include this exercise
                </label>
                <label htmlFor={`${id}-name`}>EXERCISE NAME</label>
                <input
                  id={`${id}-name`}
                  value={row.name}
                  onChange={(e) => update(row.id, { name: e.target.value })}
                />
                <div className="import-grid">
                  <div>
                    <label htmlFor={`${id}-workout`}>WORKOUT</label>
                    <select
                      id={`${id}-workout`}
                      value={row.workout}
                      onChange={(e) =>
                        update(row.id, { workout: e.target.value as WorkoutId | '' })
                      }
                    >
                      <option value="">Assign workout…</option>
                      {workouts.map((w) => (
                        <option key={w.key} value={w.key}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${id}-intensity`}>INTENSITY</label>
                    <select
                      id={`${id}-intensity`}
                      value={row.intensity}
                      onChange={(e) =>
                        update(row.id, { intensity: e.target.value as Intensity | '' })
                      }
                    >
                      <option value="">Choose…</option>
                      <option value="hard">Hard</option>
                      <option value="easy">Easy</option>
                    </select>
                  </div>
                </div>
                <label htmlFor={`${id}-category`}>
                  CATEGORY (ONLY USED FOR FILE-PROVIDED SET DEFAULTS)
                </label>
                <select
                  id={`${id}-category`}
                  value={row.category}
                  onChange={(e) => {
                    const category = e.target.value as DraftExercise['category'];
                    update(row.id, {
                      category,
                      ...(row.sets === null
                        ? {
                            sets:
                              category === 'compound'
                                ? row.compoundSets
                                : category === 'isolation'
                                  ? row.isolationSets
                                  : null,
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="">Not specified</option>
                  <option value="compound">Compound</option>
                  <option value="isolation">Isolation</option>
                </select>
                <div className="import-grid">
                  <div>
                    <label htmlFor={`${id}-sets`}>SETS</label>
                    <input
                      id={`${id}-sets`}
                      type="number"
                      min={1}
                      max={12}
                      value={row.sets ?? ''}
                      onChange={(e) =>
                        update(row.id, {
                          sets: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`${id}-rest`}>REST (SECONDS)</label>
                    <input
                      id={`${id}-rest`}
                      type="number"
                      min={1}
                      max={3600}
                      value={row.rest ?? ''}
                      onChange={(e) =>
                        update(row.id, {
                          rest: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <label htmlFor={`${id}-reps`}>TARGET REPS / REP RANGE</label>
                <input
                  id={`${id}-reps`}
                  value={row.reps}
                  onChange={(e) => update(row.id, { reps: e.target.value })}
                />
                {!row.reps.trim() && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={row.allowUnspecifiedReps}
                      onChange={(e) => update(row.id, { allowUnspecifiedReps: e.target.checked })}
                    />
                    Keep reps unspecified — do not invent a target
                  </label>
                )}
                <label htmlFor={`${id}-notes`}>NOTES / OTHER PRESCRIPTION DETAILS</label>
                <textarea
                  id={`${id}-notes`}
                  rows={3}
                  value={row.notes}
                  onChange={(e) => update(row.id, { notes: e.target.value })}
                />
                {row.warnings.length > 0 && (
                  <>
                    <ul className="parser-notices">
                      {row.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={row.reviewed}
                        onChange={(e) => update(row.id, { reviewed: e.target.checked })}
                      />
                      I reviewed the source and resolved these ambiguities above
                    </label>
                  </>
                )}
                {!row.excluded && problems.length > 0 && (
                  <ul className="import-warning" aria-label={`Issues for exercise ${index + 1}`}>
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <div className="row">
                  <button
                    disabled={busy || index === 0}
                    aria-label={`Move exercise ${index + 1} up`}
                    onClick={() => reorder(index, -1)}
                  >
                    ↑ Move up
                  </button>
                  <button
                    disabled={busy || index === draft.rows.length - 1}
                    aria-label={`Move exercise ${index + 1} down`}
                    onClick={() => reorder(index, 1)}
                  >
                    Move down ↓
                  </button>
                </div>
              </fieldset>
            );
          })}
          <button
            className="full"
            disabled={busy}
            onClick={() => {
              setConfirmed(false);
              setApplied(false);
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      rows: [
                        ...d.rows,
                        {
                          id: crypto.randomUUID(),
                          line: 0,
                          source: 'Manually added',
                          name: '',
                          workout: '',
                          intensity: '',
                          category: '',
                          sets: null,
                          reps: '',
                          rest: null,
                          notes: '',
                          compoundSets: null,
                          isolationSets: null,
                          allowUnspecifiedReps: false,
                          reviewed: false,
                          excluded: false,
                          warnings: [],
                        },
                      ],
                    }
                  : d,
              );
            }}
          >
            + Add exercise to preview
          </button>
          <div className="import-summary">
            <h3>Templates to replace</h3>
            {Object.keys(groups).length ? (
              <ul>
                {Object.entries(groups).map(([key, rows]) => (
                  <li key={key}>
                    {templateLabel(key)} · {key.endsWith(' · Easy') ? 'Easy' : 'Hard'} —{' '}
                    {rows.length} exercises
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Resolve the missing fields and warnings to see the final replacement list.
              </p>
            )}
            <p className="muted">
              Only these workout/intensity templates will change. Other templates, history, personal
              records and active sessions stay intact. A pre-import snapshot will be saved on this
              device.
            </p>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || stale || issues.length > 0 || !included.length}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm replacing the listed workout templates with this preview
          </label>
          <button
            className="primary full"
            disabled={!confirmed || busy || stale || issues.length > 0 || !included.length}
            onClick={async () => {
              if (!confirmed) return;
              setBusy(true);
              setError('');
              try {
                await onApply(draft);
                setConfirmed(false);
                setApplied(true);
              } catch (e) {
                setError('Plan not applied: ' + (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Applying…' : 'Apply imported plan'}
          </button>
          <button
            className="full"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setConfirmed(false);
              setError('');
              setApplied(false);
            }}
          >
            Cancel preview
          </button>
        </div>
      )}
    </section>
  );
}
