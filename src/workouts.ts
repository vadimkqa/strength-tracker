// Stable IDs keep existing templates and history compatible with v1.
export const workouts = [
  {
    name: 'Bench Day',
    key: 'Tuesday · Bench focus',
    muscles: 'CHEST · ARMS · CORE',
    photo: 'bench',
    caption: 'Bench press',
  },
  {
    name: 'DB Press Day',
    key: 'Thursday · Back focus',
    muscles: 'BACK · SHOULDERS · ARMS',
    photo: 'pullups',
    caption: 'Pull-up bar',
  },
  {
    name: 'Hammer Press Day',
    key: 'Saturday · Chest focus',
    muscles: 'CHEST · SHOULDERS · TRICEPS',
    photo: 'hammer',
    caption: 'Hammer-style chest press machine',
  },
  {
    name: 'Leg Day',
    key: 'Sunday · Legs',
    muscles: 'QUADS · GLUTES · CALVES',
    photo: 'legs',
    caption: 'Leg press machine',
  },
] as const;
export type WorkoutId = (typeof workouts)[number]['key'];
export type Intensity = 'hard' | 'easy';
export const templateKey = (workout: string, intensity: string) =>
  intensity === 'easy' ? `${workout} · Easy` : workout;
export const templateLabel = (key: string) => {
  const easy = key.endsWith(' · Easy');
  const base = easy ? key.slice(0, -7) : key;
  const match = workouts.find((w) => w.key === base);
  return match ? `${match.name}${easy ? ' · Easy' : ''}` : key;
};

export interface RotationSession {
  week: number;
  day: string;
  workout: WorkoutId;
  intensity: Intensity;
  key: string;
}
export interface Rotation {
  weeks: number[];
  sessions: RotationSession[];
}
export function rotationKey(workout: WorkoutId, week: number, day: string, intensity: string) {
  return `Week ${week} · ${day || 'Day unspecified'} · ${workouts.find((w) => w.key === workout)!.name} · ${intensity === 'easy' ? 'Easy' : 'Hard'}`;
}
