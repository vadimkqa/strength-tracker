import type { Data } from './data';
import { carouselWorkouts } from './workouts';
import { currentProgram } from './programs';
export function carouselIndex(data: Data) {
  return Math.max(
    0,
    carouselWorkouts(
      data.rotation,
      data.rotationWeek,
      data.trainingProgram,
      data.week,
      currentProgram(data)?.calendar?.days,
    ).findIndex((w) => w.key === data.carouselWorkout),
  );
}
export function chooseWorkout(data: Data, index: number, wrap: -1 | 0 | 1 = 0): Data {
  const current = carouselIndex(data);
  if (index === current && !wrap) return data;
  const weeks = [
    ...new Set(
      data.trainingProgram
        ? data.trainingProgram.rotation?.weeks ||
            [...new Set(data.trainingProgram.workouts.map((w) => w.week))].sort((a, b) => a - b)
        : data.rotation?.weeks || [1, 2],
    ),
  ];
  const weekIndex = Math.max(0, weeks.indexOf(data.rotationWeek || weeks[0]));
  const week =
    (data.trainingProgram || data.rotation) && wrap
      ? weeks[(weekIndex + wrap + weeks.length) % weeks.length]
      : data.rotationWeek;
  const cards = carouselWorkouts(
    data.rotation,
    week,
    data.trainingProgram,
    data.week,
    currentProgram(data)?.calendar?.days,
  );
  const target =
    wrap === -1 ? cards.length - 1 : wrap === 1 ? 0 : Math.min(index, cards.length - 1);
  if (!cards[target]) return data;
  return {
    ...data,
    carouselWorkout: cards[target].key,
    ...((data.trainingProgram || data.rotation) && wrap ? { rotationWeek: week } : {}),
    difficultyOverride: undefined,
  };
}
export function chooseWeek(data: Data, week: number): Data {
  return {
    ...data,
    carouselWorkout:
      data.carouselWorkout ||
      carouselWorkouts(
        data.rotation,
        data.rotationWeek,
        data.trainingProgram,
        data.week,
        currentProgram(data)?.calendar?.days,
      )[carouselIndex(data)].key,
    rotationWeek: week,
    difficultyOverride: undefined,
  };
}
export function workoutDifficulty(data: Data, index = carouselIndex(data)) {
  if (['built-in', 'legacy-txt'].includes(data.trainingProgram?.source.format || ''))
    return data.week;
  const card = carouselWorkouts(
    data.rotation,
    data.rotationWeek,
    data.trainingProgram,
    data.week,
    currentProgram(data)?.calendar?.days,
  )[index];
  const session = data.trainingProgram?.workouts.find((w) => w.id === card?.templateKey);
  if (session)
    return data.difficultyOverride?.key === session.id
      ? data.difficultyOverride.value
      : /^(hard|heavy)$/i.test(session.intensity || '')
        ? 'heavy'
        : /^easy$/i.test(session.intensity || '')
          ? 'easy'
          : session.intensity?.toLowerCase() || '';
  const legacy = data.rotation?.sessions.find(
    (s) => s.week === (data.rotationWeek || 1) && s.workout === card?.key,
  );
  return legacy
    ? data.difficultyOverride?.key === legacy.key
      ? data.difficultyOverride.value
      : legacy.intensity === 'hard'
        ? 'heavy'
        : 'easy'
    : data.week;
}
