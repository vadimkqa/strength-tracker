import { extractDocument, textDocument, type ExtractedDocument } from './importing/extraction';
import { parseProgram } from './importing/parser';
import { stableId, type TrainingProgram } from './importing/model';
import { ProgramReview } from './importing/ProgramReview';
import { useState } from 'react';
import {
  parseTrainingPlan,
  parseAliases,
  rowProblems,
  draftTemplates,
  draftSessions,
  type PlanDraft,
  type DraftExercise,
} from './plan-import';
import { setWarnings, repsLabel, type SetPrescription } from './prescriptions';
import { workouts, templateLabel, type WorkoutId, type Intensity } from './workouts';
interface Props {
  onApply: (draft: PlanDraft | TrainingProgram) => Promise<void>;
}
export function PlanImporter({ onApply }: Props) {
  const [extractedDocument, setDocument] = useState<ExtractedDocument | null>(null);
  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [source, setSource] = useState(''),
    [aliases, setAliases] = useState(''),
    [parsedAliases, setParsedAliases] = useState('');
  const [draft, setDraft] = useState<PlanDraft | null>(null),
    [error, setError] = useState(''),
    [applied, setApplied] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [filename, setFilename] = useState('');
  const [week, setWeek] = useState(1),
    [workout, setWorkout] = useState<string>(workouts[0].key);
  const stale = !!draft && (draft.source !== source || aliases !== parsedAliases);
  const included = draft?.rows.filter((r) => !r.excluded) || [];
  const issues = included.flatMap(rowProblems),
    sessions = draft ? draftSessions(draft) : [];
  const weeks = [...new Set(draft?.rows.map((r) => r.week) || [1])].sort((a, b) => a - b);
  const displayed = draft?.rows.filter((r) => r.week === week && r.workout === workout) || [];
  const warningCount = included.reduce((n, r) => n + r.warnings.length, 0);
  let groups: Record<string, unknown[]> = {};
  if (draft && included.length && !issues.length) groups = draftTemplates(draft);
  function update(id: string, patch: Partial<DraftExercise>) {
    if (patch.workout !== undefined) setWorkout(patch.workout);
    setConfirmed(false);
    setApplied(false);
    setDraft((d) =>
      d ? { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : d,
    );
  }
  function replaceSets(row: DraftExercise, sets: SetPrescription[]) {
    update(row.id, {
      setPrescriptions: sets,
      sets: sets.length || null,
      reviewed: false,
      warnings: [
        ...row.warnings.filter((w) => !w.startsWith('[Sets]')),
        ...setWarnings(sets).map((w) => '[Sets] ' + w),
      ],
    });
  }
  function editSet(row: DraftExercise, index: number, patch: Partial<SetPrescription>) {
    replaceSets(
      row,
      row.setPrescriptions.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }
  async function readFile(file: File) {
    setError('');
    try {
      setBusy(true);
      const extracted = await extractDocument(file);
      const text = extracted.text;
      setDocument(extracted);
      setSource(text);
      setFilename(file.name);
      setConfirmed(false);
      setApplied(false);
    } catch (e) {
      setError('File not loaded: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function parse() {
    try {
      if (source.length > 2_000_000 || source.split(/\r\n?|\n/).length > 10000)
        throw Error('Import at most 2 MB and 10,000 lines.');
      if (!source.trim()) throw Error('Choose a TXT file or paste your plan first.');
      const custom = parseAliases(aliases);
      if (
        (draft || program) &&
        !confirm(
          'Reparse the source? This discards preview edits only. Your saved templates will not change.',
        )
      )
        return;
      const result = parseTrainingPlan(source, custom);
      // The established parser remains an explicit compatibility adapter for its known formats.
      // Unknown workout headings go through the independent program parser, never forced onto four IDs.
      const legacy =
        result.rows.length > 0 &&
        (aliases.trim() || /\b(?:Bench Day|DB Press|Hammer Press|Leg Day)\b/i.test(source)) &&
        (result.rows.every((r) => r.workout) ||
          result.rows.filter((r) => r.workout).length / result.rows.length > 0.8);
      if (!legacy || (extractedDocument?.format && !['txt'].includes(extractedDocument.format))) {
        const doc =
          extractedDocument?.text === source
            ? extractedDocument
            : textDocument(source, filename || 'Pasted plan');
        setProgram(parseProgram(doc));
        setDraft(null);
        setError('');
        setConfirmed(false);
        setApplied(false);
        return;
      }
      setProgram(null);
      setDraft(result);
      setWeek(result.rows[0]?.week || 1);
      setWorkout(result.rows[0]?.workout || '');
      setParsedAliases(aliases);
      setConfirmed(false);
      setApplied(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function move(row: DraftExercise, direction: number) {
    if (!draft) return;
    const index = draft.rows.indexOf(row),
      other = draft.rows.indexOf(displayed[displayed.indexOf(row) + direction]);
    if (other < 0) return;
    const rows = [...draft.rows];
    [rows[index], rows[other]] = [rows[other], rows[index]];
    setDraft({ ...draft, rows });
    setConfirmed(false);
    setApplied(false);
  }
  return (
    <section className="card plan-importer" aria-labelledby="import-title">
      <h2 id="import-title">Import Training Plan</h2>
      <p className="muted">
        Document extraction and parsing stay on this device. Uploading and reviewing never change
        saved templates.
      </p>
      <label htmlFor="plan-file">UPLOAD PLAN FILE</label>
      <input
        id="plan-file"
        type="file"
        accept=".txt,.pdf,.docx,.csv,.xlsx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
          e.target.value = '';
        }}
      />
      {filename && <p className="muted">Loaded: {filename}</p>}
      <details>
        <summary>Source text and workout aliases</summary>
        <label htmlFor="plan-source">PASTE / EDIT PLAN TEXT</label>
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
        />
        <p className="muted">
          Use weekday or workout headings (Full Body, Upper/Lower, Push/Pull/Legs, Workout A/B, Day
          1…), optional Week headings, or tables with Workout and Exercise columns. Numbered
          prescriptions in parentheses attach to the exercise above. Rest times remain unset if
          absent.
        </p>
        <label htmlFor="plan-aliases">OPTIONAL WORKOUT ALIASES</label>
        <textarea
          id="plan-aliases"
          rows={2}
          value={aliases}
          disabled={busy}
          onChange={(e) => {
            setAliases(e.target.value);
            setConfirmed(false);
            setApplied(false);
          }}
          placeholder="Push A = Bench Day"
        />
      </details>
      <button className="full" disabled={busy} onClick={parse}>
        {draft || program ? 'Reparse TXT' : 'Parse TXT'}
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
      {program && (
        <ProgramReview
          key={program.id + stableId(program.source.text)}
          program={program}
          change={setProgram}
          onApply={onApply}
          stale={program.source.text !== source}
          cancel={() => {
            setProgram(null);
            setError('');
          }}
        />
      )}
      {draft && (
        <div aria-label="Editable plan preview">
          <h3>Review training plan</h3>
          <p className="import-stats" role="status">
            {weeks.length} weeks · {sessions.length} sessions · {included.length} exercises ·{' '}
            {warningCount} warnings
          </p>
          <p className="muted">
            {included.filter((r) => r.rest === null).length} exercises have no rest specified.{' '}
            {included.filter((r) => r.sets === null).length} have no set count. Unknown values stay
            unset.
          </p>
          {stale && (
            <p role="status" className="import-warning">
              Source changed. Reparse before applying.
            </p>
          )}
          {draft.notices.length > 0 && (
            <details>
              <summary>Parser notices ({draft.notices.length})</summary>
              <ul className="parser-notices">
                {draft.notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {warningCount > 0 && (
            <details className="review-warning-index">
              <summary>Source warnings ({warningCount})</summary>
              <ul className="parser-notices">
                {included
                  .filter((r) => r.warnings.length)
                  .map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => {
                          setWeek(r.week);
                          setWorkout(r.workout);
                          requestAnimationFrame(() => {
                            const node = document.getElementById(
                              `import-${r.id}`,
                            ) as HTMLDetailsElement | null;
                            if (node) {
                              node.open = true;
                              node.scrollIntoView({ block: 'nearest' });
                            }
                          });
                        }}
                      >
                        Week {r.week} · {templateLabel(r.workout)} · {r.name}
                      </button>
                      : {r.warnings.map((w) => w.replace(/^\[Sets\] /, '')).join(' ')}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <div className="import-grid review-selectors">
            <div>
              <label htmlFor="review-week">WEEK</label>
              <select
                id="review-week"
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="review-workout">WORKOUT</label>
              <select
                id="review-workout"
                value={workout}
                onChange={(e) => setWorkout(e.target.value)}
              >
                {workouts.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.name}
                  </option>
                ))}
                <option value="">Unassigned</option>
              </select>
            </div>
          </div>
          {displayed[0] && (
            <p className="eyebrow review-session-title">
              {displayed[0].day || 'Day unspecified'} · Week {week} ·{' '}
              {displayed[0].intensity === 'easy'
                ? 'Easy'
                : displayed[0].intensity === 'hard'
                  ? 'Hard'
                  : 'Intensity unspecified'}{' '}
              session
            </p>
          )}
          {!displayed.length && <p className="muted">No exercises in this selection.</p>}
          {displayed.map((row, index) => {
            const problems = rowProblems(row),
              id = `import-${row.id}`,
              ambiguous = row.warnings.length > 0 || problems.length > 0;
            return (
              <details
                id={id}
                key={row.id}
                className={`review-exercise ${row.excluded ? 'excluded' : ''}`}
              >
                <summary>
                  <div className="review-exercise-title">
                    <strong>
                      {index + 1}. {row.name || 'Unnamed exercise'}
                    </strong>
                    <span>
                      {row.exerciseIntensity || 'Intensity unspecified'}
                      {row.optional ? ' · Optional' : ''}
                      {row.kind === 'core' ? ' · Core' : ''}
                    </span>
                    <span className="compact-prescription">
                      {row.setPrescriptions.length
                        ? row.setPrescriptions
                            .map((s) => `${s.number ?? '?'}: ${repsLabel(s)} ${s.effort}`)
                            .join(' · ')
                        : row.reps || 'Prescription not specified'}
                    </span>
                    {row.warnings.length > 0 && (
                      <span className="compact-warning">
                        {row.warnings.map((w) => w.replace(/^\[Sets\] /, '')).join(' ')}
                      </span>
                    )}
                  </div>
                  <span className="review-set-count">
                    {row.sets ?? '?'} sets{ambiguous ? ' ⚠' : ''}
                  </span>
                </summary>
                <p className="eyebrow">
                  Week {row.week} · {row.day || 'Day unspecified'} · SESSION{' '}
                  {row.intensity.toUpperCase() || 'UNASSIGNED'}
                </p>
                {row.setPrescriptions.length ? (
                  <ol className="set-prescription-list">
                    {row.setPrescriptions.map((s, i) => (
                      <li key={i}>
                        <b>Set {s.number ?? '?'}</b>
                        <span>
                          {repsLabel(s)} reps · {s.effort || 'Effort unspecified'}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">
                    {row.reps ? `${row.reps} reps` : 'Reps unspecified'} ·{' '}
                    {row.rest === null ? 'Rest unspecified' : `${row.rest}s rest`}
                  </p>
                )}
                {row.alternatives.length > 0 && (
                  <p className="muted">
                    Alternatives (no choice made): {row.alternatives.join(' OR ')}
                  </p>
                )}
                {row.warnings.length > 0 && (
                  <ul className="parser-notices">
                    {row.warnings.map((w, i) => (
                      <li key={i}>{w.replace(/^\[Sets\] /, '')}</li>
                    ))}
                  </ul>
                )}
                <details className="exercise-editor">
                  <summary>
                    {ambiguous ? 'Resolve warnings / edit details' : 'Edit exercise details'}
                  </summary>
                  <fieldset disabled={busy}>
                    <label htmlFor={`${id}-name`}>EXERCISE NAME</label>
                    <input
                      id={`${id}-name`}
                      value={row.name}
                      onChange={(e) => update(row.id, { name: e.target.value })}
                    />
                    <div className="import-grid">
                      <div>
                        <label htmlFor={`${id}-workout`}>WORKOUT ASSIGNMENT</label>
                        <select
                          id={`${id}-workout`}
                          value={row.workout}
                          onChange={(e) =>
                            update(row.id, { workout: e.target.value as WorkoutId | '' })
                          }
                        >
                          <option value="">Assign…</option>
                          {workouts.map((w) => (
                            <option key={w.key} value={w.key}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${id}-intensity`}>SESSION INTENSITY</label>
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
                    <div className="import-grid">
                      <div>
                        <label htmlFor={`${id}-individual`}>EXERCISE INTENSITY</label>
                        <input
                          id={`${id}-individual`}
                          value={row.exerciseIntensity}
                          onChange={(e) => update(row.id, { exerciseIntensity: e.target.value })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${id}-day`}>TRAINING DAY</label>
                        <input
                          id={`${id}-day`}
                          value={row.day}
                          onChange={(e) => update(row.id, { day: e.target.value })}
                        />
                      </div>
                    </div>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={row.optional}
                        onChange={(e) => update(row.id, { optional: e.target.checked })}
                      />
                      Optional exercise
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!row.excluded}
                        onChange={(e) => update(row.id, { excluded: !e.target.checked })}
                      />
                      Include this exercise
                    </label>
                    {row.setPrescriptions.length > 0 ? (
                      <div>
                        {row.setPrescriptions.map((s, i) => (
                          <div className="set-prescription-editor" key={i}>
                            <label>
                              Set number
                              <input
                                aria-label={`Set entry ${i + 1} number`}
                                type="number"
                                value={s.number ?? ''}
                                onChange={(e) =>
                                  editSet(row, i, {
                                    number: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Min reps
                              <input
                                aria-label={`Set entry ${i + 1} minimum reps`}
                                type="number"
                                value={s.minReps ?? ''}
                                onChange={(e) =>
                                  editSet(row, i, {
                                    minReps: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Max reps
                              <input
                                aria-label={`Set entry ${i + 1} maximum reps`}
                                type="number"
                                value={s.maxReps ?? ''}
                                onChange={(e) =>
                                  editSet(row, i, {
                                    maxReps: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Effort
                              <input
                                aria-label={`Set entry ${i + 1} effort`}
                                value={s.effort}
                                onChange={(e) => editSet(row, i, { effort: e.target.value })}
                              />
                            </label>
                            <div className="prescription-edit-actions">
                              <button
                                disabled={i === 0}
                                onClick={() => {
                                  const sets = [...row.setPrescriptions];
                                  [sets[i - 1], sets[i]] = [sets[i], sets[i - 1]];
                                  replaceSets(row, sets);
                                }}
                              >
                                Move set up
                              </button>
                              <button
                                onClick={() =>
                                  replaceSets(
                                    row,
                                    row.setPrescriptions.filter((_, j) => j !== i),
                                  )
                                }
                              >
                                Remove entry
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            replaceSets(row, [
                              ...row.setPrescriptions,
                              {
                                number: null,
                                minReps: null,
                                maxReps: null,
                                effort: '',
                                source: 'Manually added',
                              },
                            ])
                          }
                        >
                          Add prescription set
                        </button>
                      </div>
                    ) : (
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
                                sets: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label htmlFor={`${id}-reps`}>TARGET REPS</label>
                          <input
                            id={`${id}-reps`}
                            value={row.reps}
                            onChange={(e) => update(row.id, { reps: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                    {row.sets === null && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={row.allowUnspecifiedSets}
                          onChange={(e) =>
                            update(row.id, { allowUnspecifiedSets: e.target.checked })
                          }
                        />
                        Keep set count unspecified
                      </label>
                    )}
                    {!row.reps && !row.setPrescriptions.length && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={row.allowUnspecifiedReps}
                          onChange={(e) =>
                            update(row.id, { allowUnspecifiedReps: e.target.checked })
                          }
                        />
                        Keep reps unspecified — do not invent a target
                      </label>
                    )}
                    <label htmlFor={`${id}-rest`}>REST (SECONDS)</label>
                    <input
                      id={`${id}-rest`}
                      type="number"
                      value={row.rest ?? ''}
                      onChange={(e) =>
                        update(row.id, { rest: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    {row.rest === null && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={row.allowUnspecifiedRest}
                          onChange={(e) =>
                            update(row.id, { allowUnspecifiedRest: e.target.checked })
                          }
                        />
                        Keep rest unspecified
                      </label>
                    )}
                    <label htmlFor={`${id}-notes`}>NOTES / SOURCE DETAILS</label>
                    <textarea
                      id={`${id}-notes`}
                      rows={3}
                      value={row.notes}
                      onChange={(e) => update(row.id, { notes: e.target.value })}
                    />
                    <div className="row">
                      <button disabled={index === 0} onClick={() => move(row, -1)}>
                        Move up
                      </button>
                      <button
                        disabled={index === displayed.length - 1}
                        onClick={() => move(row, 1)}
                      >
                        Move down
                      </button>
                    </div>
                  </fieldset>
                </details>
                {problems.length > 0 && (
                  <ul className="import-warning">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {row.warnings.length > 0 && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={row.reviewed}
                      onChange={(e) => update(row.id, { reviewed: e.target.checked })}
                    />
                    I reviewed these source warnings; keep unedited values exactly as written
                  </label>
                )}
              </details>
            );
          })}
          <div className="import-summary">
            <h3>Templates to apply</h3>
            {Object.keys(groups).length ? (
              <ul>
                {Object.entries(groups).map(([key, rows]) => (
                  <li key={key}>
                    {templateLabel(key)} · {rows.length} exercises
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Resolve or explicitly review flagged ambiguities across all sessions before
                applying.
              </p>
            )}
            <p className="muted">
              History, PRs and active sessions stay intact. Unspecified rests and set counts stay
              unset. A pre-import snapshot is saved.
            </p>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || stale || issues.length > 0 || !included.length}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm applying these templates, preserving all unspecified values as unset
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
