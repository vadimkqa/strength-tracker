import { openStore, type Data } from './data';
import { syncStreaks } from './streak';
export async function initializeStreaks(data: Data, zone: string, name?: string, now = Date.now()) {
  const next = syncStreaks(data, now, zone);
  if (JSON.stringify(next.streak) === JSON.stringify(data.streak)) return data;
  const db = await openStore(name);
  try {
    const tx = db.transaction(['state', 'backups'], 'readwrite');
    try {
      if (!data.streak)
        await tx.objectStore('backups').add({ kind: 'before-strength-streak', data, created: now });
      await tx.objectStore('state').put(next, 'current');
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}
