import { type StreakLevel } from './streak';
export interface AchievementArtwork {
  file: string;
  name: string;
}
/** Presentation only: saved achievement IDs and their existing thresholds remain in streak.ts. */
export const STREAK_ARTWORK = {
  basic: { file: '01.PNG', name: 'Empty dumbbell' },
  'first-plates': { file: '02.PNG', name: 'Dumbbell with 1 plate per side' },
  growing: { file: '03.PNG', name: 'Dumbbell with 2 plates per side' },
  heavy: { file: '04.PNG', name: 'Empty barbell' },
  barbell: { file: '05.PNG', name: 'Barbell with 1 plate per side' },
  double: { file: '06.PNG', name: 'Barbell with 2 plates per side' },
  triple: { file: '07.PNG', name: 'Black barbell with 3 plates per side' },
  silver: { file: '08.PNG', name: 'Silver metallic barbell' },
  gold: { file: '09.PNG', name: 'Golden barbell' },
  diamond: { file: '10.PNG', name: 'Diamond barbell' },
  crystal: { file: '11.PNG', name: 'Purple crystal barbell' },
} as const satisfies Record<StreakLevel['id'], AchievementArtwork>;
export const artworkFor = (level: StreakLevel) => STREAK_ARTWORK[level.id];
export const SECRET_WEEKS = 52;
/** Longest verified run comes from committed history; a missed later week does not revoke an unlock. */
export const secretUnlocked = (longest: number) => longest >= SECRET_WEEKS;
export function secretArtwork(longest: number): AchievementArtwork {
  return secretUnlocked(longest)
    ? { file: '12.PNG', name: 'Secret achievement unlocked: red winged pose' }
    : { file: '13.PNG', name: 'Locked secret achievement' };
}
export const artworkUrl = (art: AchievementArtwork) =>
  `${import.meta.env.BASE_URL}streak-achievements/${art.file}`;
