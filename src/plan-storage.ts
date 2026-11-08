import { applyProgram } from './importing/saving';
import type { TrainingProgram } from './importing/model';
import { openStore, type Data } from './data';
import { applyImportedPlan, type PlanDraft } from './plan-import';

export async function saveImportedPlan(
  current: Data,
  draft: PlanDraft | TrainingProgram,
  confirmed: boolean,
  dbName?: string,
) {
  const next =
    'schemaVersion' in draft
      ? applyProgram(current, draft, confirmed)
      : applyImportedPlan(current, draft, confirmed);
  const db = await openStore(dbName);
  try {
    const tx = db.transaction(['state', 'backups'], 'readwrite');
    try {
      await tx
        .objectStore('backups')
        .add({ kind: 'before-plan-import', data: current, created: Date.now() });
      await tx.objectStore('state').put(next, 'current');
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}
