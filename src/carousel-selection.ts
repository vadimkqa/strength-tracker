import type { Data } from './data';
import { workouts } from './workouts';
export function carouselIndex(data: Data) {
  return Math.max(
    0,
    workouts.findIndex((w) => w.key === data.carouselWorkout),
  );
}
export function chooseWorkout(data: Data, index: number, wrap: -1 | 0 | 1 = 0): Data {
  const current = carouselIndex(data);
  if (index === current && !wrap) return data;
  const weeks = [...new Set(data.rotation?.weeks || [1, 2])].sort((a, b) => a - b);
  const weekIndex = Math.max(0, weeks.indexOf(data.rotationWeek || weeks[0]));
  return {
    ...data,
    carouselWorkout: workouts[index].key,
    ...(data.rotation && wrap
      ? { rotationWeek: weeks[(weekIndex + wrap + weeks.length) % weeks.length] }
      : {}),
    difficultyOverride: undefined,
  };
}
export function chooseWeek(data: Data, week: number): Data {
  return { ...data, rotationWeek: week, difficultyOverride: undefined };
}
export function workoutDifficulty(data: Data, index = carouselIndex(data)) {
  const session = data.rotation?.sessions.find(
    (s) => s.week === (data.rotationWeek || 1) && s.workout === workouts[index].key,
  );
  return session
    ? data.difficultyOverride?.key === session.key
      ? data.difficultyOverride.value
      : session.intensity === 'hard'
        ? 'heavy'
        : 'easy'
    : data.week;
}
