import { openStore, type Data } from './data';
import { applyImportedPlan, type PlanDraft } from './plan-import';

export async function saveImportedPlan(
  current: Data,
  draft: PlanDraft,
  confirmed: boolean,
  dbName?: string,
) {
  const next = applyImportedPlan(current, draft, confirmed);
  const db = await openStore(dbName);
  try {
    const tx = db.transaction(['state', 'backups'], 'readwrite');
    await tx
      .objectStore('backups')
      .add({ kind: 'before-plan-import', data: current, created: Date.now() });
    await tx.objectStore('state').put(next, 'current');
    await tx.done;
    return next;
  } finally {
    db.close();
  }
}
