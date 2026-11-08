import type { Data } from './data';
import { carouselWorkouts } from './workouts';
export function carouselIndex(data: Data) {
  return Math.max(
    0,
    carouselWorkouts(data.rotation, data.rotationWeek).findIndex(
      (w) => w.key === data.carouselWorkout,
    ),
  );
}
export function chooseWorkout(data: Data, index: number, wrap: -1 | 0 | 1 = 0): Data {
  const current = carouselIndex(data);
  if (index === current && !wrap) return data;
  const weeks = [...new Set(data.rotation?.weeks || [1, 2])].sort((a, b) => a - b);
  const weekIndex = Math.max(0, weeks.indexOf(data.rotationWeek || weeks[0]));
  const week =
    data.rotation && wrap
      ? weeks[(weekIndex + wrap + weeks.length) % weeks.length]
      : data.rotationWeek;
  return {
    ...data,
    carouselWorkout: carouselWorkouts(data.rotation, week)[index].key,
    ...(data.rotation && wrap ? { rotationWeek: week } : {}),
    difficultyOverride: undefined,
  };
}
export function chooseWeek(data: Data, week: number): Data {
  return {
    ...data,
    carouselWorkout:
      data.carouselWorkout ||
      carouselWorkouts(data.rotation, data.rotationWeek)[carouselIndex(data)].key,
    rotationWeek: week,
    difficultyOverride: undefined,
  };
}
export function workoutDifficulty(data: Data, index = carouselIndex(data)) {
  const session = data.rotation?.sessions.find(
    (s) =>
      s.week === (data.rotationWeek || 1) &&
      s.workout === carouselWorkouts(data.rotation, data.rotationWeek)[index].key,
  );
  return session
    ? data.difficultyOverride?.key === session.key
      ? data.difficultyOverride.value
      : session.intensity === 'hard'
        ? 'heavy'
        : 'easy'
    : data.week;
}
