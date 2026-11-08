import { useEffect, useRef, useState } from 'react';
import type { Data } from './data';
import {
  BACKUP_FILENAME,
  MAX_BACKUP_BYTES,
  createDatabaseBackup,
  backupFile,
  parseBackup,
  saveBackupFile,
  downloadBackupFile,
  type BackupPreview,
} from './backup';
interface Props {
  data: Data;
  ready: boolean;
  onRestore: (source: unknown) => Promise<void>;
}
export function BackupPanel({ data, ready, onRestore }: Props) {
  const [prepared, setPrepared] = useState<{ data: Data; file: File } | null>(null),
    [prepareError, setPrepareError] = useState('');
  const [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [reading, setReading] = useState(false);
  const [review, setReview] = useState<{
      preview: BackupPreview;
      filename: string;
      modified: number;
    } | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const readToken = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const available = ready && prepared?.data === data;
  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    setPrepareError('');
    if (ready)
      void createDatabaseBackup(data)
        .then((backup) => {
          const file = backupFile(backup);
          if (!cancelled) setPrepared({ data, file });
        })
        .catch((e) => {
          if (!cancelled) setPrepareError('Backup could not be prepared: ' + (e as Error).message);
        });
    return () => {
      cancelled = true;
    };
  }, [data, ready]);
  async function save() {
    if (!available || saving || !prepared) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      // No database read/await before this call: iOS requires the live click activation.
      const result = await saveBackupFile(prepared.file);
      setStatus(
        result === 'shared'
          ? 'Share sheet closed. If you chose Save to Files, check your selected iCloud Drive folder.'
          : result === 'saved'
            ? 'Backup saved to the file you selected.'
            : result === 'cancelled'
              ? 'Save cancelled. Your data is unchanged.'
              : 'Download started. Save the JSON file to your chosen folder.',
      );
    } catch (e) {
      setError(
        'Sharing or saving could not finish. You can use Download JSON instead. ' +
          (e as Error).message,
      );
    } finally {
      setSaving(false);
    }
  }
  async function read(file: File) {
    const token = ++readToken.current;
    setReading(true);
    setReview(null);
    setConfirmed(false);
    setError('');
    setStatus('');
    try {
      if (file.size > MAX_BACKUP_BYTES) throw Error('Backup exceeds 100 MB.');
      const preview = parseBackup(await file.text());
      if (token === readToken.current)
        setReview({ preview, filename: file.name, modified: file.lastModified });
    } catch (e) {
      if (token === readToken.current) setError('Backup not imported: ' + (e as Error).message);
    } finally {
      if (token === readToken.current) setReading(false);
    }
  }
  const date = (value: string | number) => new Date(value).toLocaleString();
  return (
    <section className="card backup-panel" aria-labelledby="backup-title">
      <h2 id="backup-title">Save your data</h2>
      <p className="muted">Keep one up-to-date backup in iCloud Drive.</p>
      <button
        className="primary full"
        onClick={() => void save()}
        disabled={!available || saving || reading}
      >
        {saving ? 'Opening save options…' : 'Save Data'}
      </button>
      <p className="muted backup-instructions">
        On iPhone, choose <strong>Save to Files</strong> in the Share sheet, then your iCloud Drive
        folder. Use <strong>{BACKUP_FILENAME}</strong> and choose <strong>Replace</strong> if iOS
        offers it. If file sharing is unavailable, the browser offers its supported save/download
        flow.
      </p>
      <p className="muted">
        You choose the destination each time. This app cannot silently overwrite an iCloud file or
        remember Safari folder permissions.
      </p>
      {!available && !prepareError && (
        <p role="status" className="muted">
          Preparing a complete database backup…
        </p>
      )}
      {prepareError && (
        <p role="alert" className="import-warning">
          {prepareError}
        </p>
      )}
      {status && (
        <p role="status" className="import-success">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="import-warning">
          {error}
        </p>
      )}
      {error && available && prepared && (
        <button
          className="full"
          disabled={saving || reading}
          onClick={() => {
            downloadBackupFile(prepared.file);
            setError('');
            setStatus('Download started. Save the JSON file to your chosen folder.');
          }}
        >
          Download JSON instead
        </button>
      )}
      <details className="backup-contents">
        <summary>What is included?</summary>
        <p className="muted">
          All workout history and completed sets, current workout/timers, training plans and custom
          exercises, PR-related performance, settings, and stored safety snapshots. Files are
          prepared on this device; no backend is used.
        </p>
      </details>
      <button
        className="full"
        disabled={saving || reading}
        onClick={() => fileInput.current?.click()}
      >
        Restore Data ↑
      </button>
      <input
        ref={fileInput}
        id="backup"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Choose JSON backup file"
        type="file"
        accept="application/json,.json"
        disabled={saving || reading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
          e.target.value = '';
        }}
      />
      {reading && <p role="status">Validating backup…</p>}
      {review && (
        <section className="backup-review" aria-labelledby="restore-review-title">
          <h3 id="restore-review-title">Review backup</h3>
          <p className="muted">{review.filename}</p>
          <p>
            <strong>Backup date:</strong>{' '}
            {review.preview.exportedAt
              ? date(review.preview.exportedAt)
              : 'Not recorded (older backup)'}
          </p>
          {!review.preview.exportedAt && (
            <p className="muted">File modified: {date(review.modified)}</p>
          )}
          <dl className="backup-summary">
            <dt>Saved workouts</dt>
            <dd>{review.preview.summary.workouts}</dd>
            <dt>Completed sets in history</dt>
            <dd>{review.preview.summary.completedSets}</dd>
            <dt>Workout templates</dt>
            <dd>{review.preview.summary.templates}</dd>
            <dt>Exercise names in plans</dt>
            <dd>{review.preview.summary.exerciseNames}</dd>
            <dt>Saved training programs</dt>
            <dd>{review.preview.summary.programs}</dd>
            <dt>Active training program</dt>
            <dd>{review.preview.summary.program || 'Legacy templates'}</dd>
            <dt>Active session</dt>
            <dd>{review.preview.summary.activeSession || 'None'}</dd>
            <dt>Safety snapshots</dt>
            <dd>{review.preview.summary.snapshots}</dd>
            <dt>Default rest</dt>
            <dd>{review.preview.data.restDefault}s</dd>
          </dl>
          <p className="muted">
            Validated JSON. Restore merges workout history, updates matching plans and settings, and
            keeps your current workout. Existing data and snapshots are kept; a pre-restore safety
            snapshot is saved.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={saving}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm restoring this backup’s plans and settings and merging its history.
          </label>
          <button
            className="primary full"
            disabled={!confirmed || saving || reading}
            onClick={async () => {
              if (!confirmed || saving) return;
              setSaving(true);
              setError('');
              try {
                await onRestore(review.preview.source);
                setReview(null);
                setConfirmed(false);
                setStatus('Data restored. Existing history and your current workout were kept.');
              } catch (e) {
                setError('Backup not imported: ' + (e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Confirm Restore Data
          </button>
          <button
            className="full"
            disabled={saving}
            onClick={() => {
              readToken.current++;
              setReview(null);
              setConfirmed(false);
              setError('');
            }}
          >
            Cancel restore
          </button>
        </section>
      )}
    </section>
  );
}
