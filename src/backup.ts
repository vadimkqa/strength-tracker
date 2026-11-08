import { migratePrograms, currentProgram } from './programs';
import { openStore, parseData, mergeBackup, type Data } from './data';
import { ensureController } from './controller';
export const BACKUP_FILENAME = 'strength-tracker-backup.json';
export const BACKUP_FORMAT = 'strength-tracker-database';
export const MAX_BACKUP_BYTES = 100_000_000;
interface RecordEntry {
  key: string | number;
  value: unknown;
}
export interface DatabaseBackup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  database: { version: 1; stores: { state: RecordEntry[]; backups: RecordEntry[] } };
}
export interface BackupPreview {
  source: unknown;
  data: Data;
  exportedAt: string | null;
  state: RecordEntry[];
  archives: RecordEntry[];
  summary: {
    workouts: number;
    completedSets: number;
    templates: number;
    programs: number;
    exerciseNames: number;
    activeSession: string | null;
    program: string | null;
    snapshots: number;
  };
}
function validateData(value: unknown) {
  const data = parseData(value);
  if (typeof data.week !== 'string' || !Number.isFinite(data.restDefault) || data.restDefault < 0)
    throw Error('Invalid backup settings.');
  for (const w of [...data.history, ...(data.active ? [data.active] : [])]) {
    if (!Number.isFinite(w.started) || (w.finished !== undefined && !Number.isFinite(w.finished)))
      throw Error('Invalid workout timestamps.');
    const c = w.controller;
    if (c && w === data.active) {
      if (
        !['warmup', 'set', 'rest'].includes(c.phase) ||
        !Number.isFinite(c.phaseStarted) ||
        !['exercises', 'timer'].includes(c.screen) ||
        !Array.isArray(c.rests) ||
        !c.rests.every((r) => r && [r.started, r.ended, r.durationMs].every(Number.isFinite))
      )
        throw Error('Invalid active-workout timer data.');
      const position = (p: typeof c.selected) =>
        p === null ||
        (p &&
          typeof p.exerciseId === 'string' &&
          typeof p.setId === 'string' &&
          w.exercises.some((e) => e.id === p.exerciseId && e.sets.some((s) => s.id === p.setId)));
      if (
        !position(c.selected) ||
        !position(c.running) ||
        (c.phase === 'set' && !c.running) ||
        (c.phase !== 'set' && c.running)
      )
        throw Error('Invalid workout set position.');
    }
  }
  return data;
}
function records(value: unknown, store: 'state' | 'backups'): RecordEntry[] {
  if (!Array.isArray(value)) throw Error(`Missing ${store} database records.`);
  const keys = new Set<string | number>();
  for (const row of value) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('key' in row) ||
      !('value' in row) ||
      (store === 'state'
        ? typeof row.key !== 'string'
        : !Number.isSafeInteger(row.key) || row.key < 1) ||
      keys.has(row.key)
    )
      throw Error(`Invalid or duplicate ${store} record.`);
    keys.add(row.key);
  }
  return value;
}
export function inspectBackup(source: unknown): BackupPreview {
  let value = source,
    exportedAt: string | null = null,
    state: RecordEntry[] = [],
    archives: RecordEntry[] = [];
  if (
    source &&
    typeof source === 'object' &&
    ('format' in source || 'database' in source) &&
    !('history' in source)
  ) {
    const backup = source as DatabaseBackup;
    if (backup.format !== BACKUP_FORMAT || backup.version !== 1 || backup.database?.version !== 1)
      throw Error('Unsupported backup format or version.');
    if (
      typeof backup.exportedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(backup.exportedAt) ||
      !Number.isFinite(Date.parse(backup.exportedAt))
    )
      throw Error('Invalid backup date.');
    const stores = backup.database.stores;
    if (!stores || Object.keys(stores).some((k) => k !== 'state' && k !== 'backups'))
      throw Error('Unsupported database stores.');
    state = records(stores.state, 'state');
    archives = records(stores.backups, 'backups');
    const current = state.find((r) => r.key === 'current');
    if (!current) throw Error('Backup has no current database record.');
    value = current.value;
    exportedAt = backup.exportedAt;
  }
  const data = validateData(value);
  const plans = data.programs
    ? data.programs.flatMap((p) => Object.values(p.templates))
    : Object.values(data.plan);
  const names = new Set(plans.flatMap((rows) => rows.map((r) => r[0])));
  return {
    source: structuredClone(source),
    data,
    exportedAt,
    state,
    archives,
    summary: {
      workouts: data.history.length,
      completedSets: data.history.reduce(
        (n, w) => n + w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
        0,
      ),
      templates: plans.length,
      programs: data.programs?.length || (data.trainingProgram ? 1 : 0),
      exerciseNames: names.size,
      activeSession: data.active?.displayName || data.active?.name || null,
      program: currentProgram(data)?.name || data.trainingProgram?.name || null,
      snapshots: archives.length,
    },
  };
}
export function parseBackup(text: string) {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw Error('Backup exceeds 100 MB.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw Error('This file is not valid JSON.');
  }
  return inspectBackup(input);
}
/** Read both stores in a single transaction; include the latest in-memory state after queued saves. */
export async function createDatabaseBackup(
  data: Data,
  name?: string,
  now = new Date(),
): Promise<DatabaseBackup> {
  const current = structuredClone(data),
    db = await openStore(name);
  try {
    const tx = db.transaction(['state', 'backups'], 'readonly');
    const [stateKeys, stateValues, backupKeys, backupValues] = await Promise.all([
      tx.objectStore('state').getAllKeys(),
      tx.objectStore('state').getAll(),
      tx.objectStore('backups').getAllKeys(),
      tx.objectStore('backups').getAll(),
    ]);
    await tx.done;
    const state = stateKeys.map((key, i) => ({
      key: key as string,
      value: key === 'current' ? current : stateValues[i],
    }));
    if (!state.some((r) => r.key === 'current')) state.push({ key: 'current', value: current });
    return {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: now.toISOString(),
      database: {
        version: 1,
        stores: {
          state,
          backups: backupKeys.map((key, i) => ({ key: key as number, value: backupValues[i] })),
        },
      },
    };
  } finally {
    db.close();
  }
}
export function backupFile(backup: DatabaseBackup) {
  const text = JSON.stringify(backup, null, 2);
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw Error('Backup exceeds 100 MB.');
  return new File([text], BACKUP_FILENAME, {
    type: 'application/json',
    lastModified: Date.parse(backup.exportedAt),
  });
}
/** No state or archive is erased. Incoming archive key collisions receive new auto-increment keys. */
export async function restoreDatabaseBackup(
  current: Data,
  source: unknown,
  confirmed: boolean,
  name?: string,
) {
  if (confirmed !== true) throw Error('Confirm restoration after reviewing the validated backup.');
  const preview = inspectBackup(source);
  const next = mergeBackup(
    structuredClone(current),
    migratePrograms(
      structuredClone(preview.data),
      preview.archives.map((r) => r.value),
    ),
  );
  if (next.active && !next.active.controller) {
    for (const exercise of next.active.exercises) exercise.id ||= crypto.randomUUID();
    next.active = ensureController(next.active);
  }
  const db = await openStore(name);
  try {
    const tx = db.transaction(['state', 'backups'], 'readwrite');
    try {
      const existing = await tx.objectStore('backups').getAll();
      const known = new Set(existing.map((v) => JSON.stringify(v)));
      await tx
        .objectStore('backups')
        .add({ kind: 'before-import', data: current, created: Date.now() });
      for (const record of preview.archives) {
        const content = JSON.stringify(record.value);
        if (!known.has(content)) {
          await tx.objectStore('backups').add(record.value);
          known.add(content);
        }
      }
      for (const record of preview.state.filter((r) => r.key !== 'current')) {
        const saved = await tx.objectStore('state').get(record.key);
        if (saved === undefined) await tx.objectStore('state').put(record.value, record.key);
        else if (JSON.stringify(saved) !== JSON.stringify(record.value))
          await tx.objectStore('backups').add({
            kind: 'restored-state-conflict',
            key: record.key,
            value: record.value,
            created: Date.now(),
          });
      }
      await tx.objectStore('state').put(next, 'current');
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  } finally {
    db.close();
  }
}
export function downloadBackupFile(file: File) {
  const url = URL.createObjectURL(file),
    a = document.createElement('a');
  a.href = url;
  a.download = BACKUP_FILENAME;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
interface SaveHandle {
  createWritable: () => Promise<{
    write: (file: File) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
}
export interface SavePlatform {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveHandle>;
  download: (file: File) => void;
}
export const savePlatform = (): SavePlatform => ({
  canShare: navigator.canShare?.bind(navigator),
  share: navigator.share?.bind(navigator),
  showSaveFilePicker: (
    window as Window & { showSaveFilePicker?: SavePlatform['showSaveFilePicker'] }
  ).showSaveFilePicker?.bind(window),
  download: downloadBackupFile,
});
/** Must be called directly from a click with an already prepared File to retain iOS activation. */
export async function saveBackupFile(
  file: File,
  platform: SavePlatform = savePlatform(),
): Promise<'shared' | 'saved' | 'downloaded' | 'cancelled'> {
  try {
    if (platform.canShare && platform.share) {
      for (const candidate of [
        file,
        new File([file], BACKUP_FILENAME, { type: 'text/plain', lastModified: file.lastModified }),
      ]) {
        let supported = false;
        try {
          supported = platform.canShare({ files: [candidate] });
        } catch {
          /* Try the alternate MIME or save fallback. */
        }
        if (supported) {
          await platform.share({ files: [candidate], title: 'Strength Tracker backup' });
          return 'shared';
        }
      }
    }
    if (platform.showSaveFilePicker) {
      const handle = await platform.showSaveFilePicker({
        suggestedName: BACKUP_FILENAME,
        types: [
          {
            description: 'Strength Tracker JSON backup',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const stream = await handle.createWritable();
      try {
        await stream.write(file);
        await stream.close();
      } catch (error) {
        try {
          await stream.abort?.();
        } catch {}
        throw error;
      }
      return 'saved';
    }
    platform.download(file);
    return 'downloaded';
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
      return 'cancelled';
    throw error;
  }
}
