import type { TrainingProgram } from './importing/model';
// Stable IDs keep existing templates and history compatible with v1.
export const workouts = [
  {
    name: 'Bench Day',
    day: 'Tuesday',
    key: 'Tuesday · Bench focus',
    muscles: 'CHEST · ARMS · CORE',
    photo: 'bench',
    caption: 'Bench press',
  },
  {
    name: 'DB Press Day',
    day: 'Thursday',
    key: 'Thursday · Back focus',
    muscles: 'BACK · SHOULDERS · ARMS',
    photo: 'pullups',
    caption: 'Pull-up bar',
  },
  {
    name: 'Hammer Press Day',
    day: 'Saturday',
    key: 'Saturday · Chest focus',
    muscles: 'CHEST · SHOULDERS · TRICEPS',
    photo: 'hammer',
    caption: 'Hammer-style chest press machine',
  },
  {
    name: 'Leg Day',
    day: 'Friday',
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

// Sort the presentation only; stable workout/template IDs and source sessions stay intact.
const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function weekdayIndex(day: string) {
  const normalized = day.trim().toLowerCase();
  const index = weekdays.findIndex((d) => normalized === d || normalized === d.slice(0, 3));
  return index < 0 ? 7 : index;
}
export interface WorkoutCard {
  key: string;
  name: string;
  day: string;
  muscles: string;
  photo: string;
  caption: string;
  templateKey?: string;
  intensity?: string | null;
}
export function carouselWorkouts(
  rotation?: Rotation,
  week = 1,
  program?: TrainingProgram,
  preferredIntensity?: string,
): WorkoutCard[] {
  if (program && !rotation) {
    let templates = program.workouts.filter((w) => w.week === week);
    if (program.source.format === 'legacy-txt') {
      const slots = [...new Set(templates.map((w) => w.slotId))];
      templates = slots.map(
        (slot) =>
          templates.find(
            (w) =>
              w.slotId === slot &&
              w.intensity === (preferredIntensity === 'easy' ? 'easy' : 'hard'),
          ) || templates.find((w) => w.slotId === slot)!,
      );
    }
    return templates
      .sort(
        (a, b) =>
          (a.day && b.day ? weekdayIndex(a.day) - weekdayIndex(b.day) : 0) || a.order - b.order,
      )
      .map((w, i) => {
        const photo = workouts.find((c) => c.key === w.slotId) || workouts[i % workouts.length];
        return {
          key: w.slotId,
          name: w.name,
          day: w.day || 'Unscheduled',
          muscles: workouts.find((c) => c.key === w.slotId)?.muscles || 'YOUR TRAINING PROGRAM',
          photo: photo.photo,
          caption: photo.caption,
          templateKey: w.id,
          intensity: w.intensity,
        };
      });
  }
  if (rotation)
    return rotation.sessions
      .filter((s) => s.week === week)
      .map((s) => ({ session: s, card: workouts.find((w) => w.key === s.workout) }))
      .filter((item) => !!item.card)
      .sort((a, b) => weekdayIndex(a.session.day) - weekdayIndex(b.session.day))
      .map(({ session: s, card }) => ({
        ...card!,
        day: s.day || 'Unscheduled',
        templateKey: s.key,
        intensity: s.intensity,
      }));
  return [...workouts].sort((a, b) => weekdayIndex(a.day) - weekdayIndex(b.day));
}
