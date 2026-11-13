import 'fake-indexeddb/auto';
import { streakData, streakNow } from '../tests/streak-fixture';
import { createDatabaseBackup, restoreDatabaseBackup } from './backup';
import { emptyData } from './data';
import { calculateStreak } from './streak';
import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { STREAK_LEVELS, levelFor } from './streak';
import { STREAK_ARTWORK, artworkFor, secretArtwork, secretUnlocked } from './streak-artwork';
import inventory from '../tests/fixtures/streak-originals.json';

it('maps the eleven saved achievement IDs to original files in approved order without changing thresholds', () => {
  expect(STREAK_LEVELS.map((l) => [l.id, l.weeks])).toEqual([
    ['basic', 0],
    ['first-plates', 2],
    ['growing', 4],
    ['heavy', 6],
    ['barbell', 8],
    ['double', 10],
    ['triple', 12],
    ['silver', 16],
    ['gold', 24],
    ['diamond', 36],
    ['crystal', 52],
  ]);
  expect(STREAK_LEVELS.map((l) => artworkFor(l).file)).toEqual(
    Array.from({ length: 11 }, (_, i) => `${String(i + 1).padStart(2, '0')}.PNG`),
  );
  expect(Object.keys(STREAK_ARTWORK)).toHaveLength(11);
  expect(artworkFor(levelFor(6)).name).toBe('Empty barbell');
  expect(artworkFor(levelFor(8)).file).toBe('05.PNG');
  expect(artworkFor(levelFor(10)).file).toBe('06.PNG');
});
it('keeps the separate secret locked before 52 verified weeks, then reveals only its approved original', () => {
  for (const n of [0, 1, 24, 51]) {
    expect(secretUnlocked(n)).toBe(false);
    expect(secretArtwork(n)).toEqual({ file: '13.PNG', name: 'Locked secret achievement' });
    expect(JSON.stringify(secretArtwork(n))).not.toMatch(/wing|pose|12\.PNG/i);
  }
  for (const n of [52, 53, 104]) {
    expect(secretUnlocked(n)).toBe(true);
    expect(secretArtwork(n).file).toBe('12.PNG');
    expect(artworkFor(levelFor(n)).file).toBe('11.PNG');
  }
});
for (const original of inventory)
  it(`preserves ${original.file} original PNG bytes, dimensions and SHA-256`, () => {
    const bytes = readFileSync(`public/streak-achievements/${original.file}`);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(original.width);
    expect(bytes.readUInt32BE(20)).toBe(original.height);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(original.sha256);
  });
it('ships exactly the thirteen numbered originals without macOS archive metadata', () => {
  expect(readdirSync('public/streak-achievements').sort()).toEqual(
    inventory.map((i) => i.file).sort(),
  );
});

it('derives the separate unlock from restored qualifying history without new award records or data mutation', async () => {
  const data = streakData(52, 1),
    before = structuredClone(data);
  const backup = await createDatabaseBackup(data, crypto.randomUUID());
  const restored = await restoreDatabaseBackup(
    emptyData(),
    JSON.parse(JSON.stringify(backup)),
    true,
    crypto.randomUUID(),
  );
  expect(secretUnlocked(calculateStreak(restored, streakNow).longest)).toBe(true);
  expect(restored.streak!.awards.map((a) => a.id)).toEqual(data.streak!.awards.map((a) => a.id));
  expect(restored.streak!.awards.some((a) => a.id === 'secret')).toBe(false);
  expect([...restored.history].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    [...data.history].sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect(data).toEqual(before);
});
