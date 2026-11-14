import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Exercise, Workout } from './data';
import { ExerciseCard } from './ExerciseCard';
import { reorderExercises } from './reorder-exercises';
export interface ExerciseSortControls {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  ref: (node: HTMLElement | null) => void;
  index: number;
  count: number;
  move: (delta: number) => void;
}
const SortEdits = createContext<(exerciseId: string, targetId: string) => void>(() => {});
function feedback() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* iPhone Safari may not provide haptics. */
  }
}
export function SortableWorkout({
  workout,
  change,
  children,
}: {
  workout: Workout;
  change: (fn: (w: Workout) => Workout) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 450, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );
  const [message, setMessage] = useState('');
  const source = useRef(workout.id);
  const edit = (id: string, target: string) =>
    change((w) => (w.id === workout.id ? reorderExercises(w, id, target) : w));
  function end(event: DragEndEvent) {
    if (source.current === workout.id && event.over && event.over.id !== event.active.id) {
      edit(String(event.active.id), String(event.over.id));
      feedback();
    }
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[({ transform }) => ({ ...transform, x: 0, scaleX: 1, scaleY: 1 })]}
      autoScroll={{ threshold: { x: 0, y: 0.22 }, acceleration: 12 }}
      onDragStart={() => {
        source.current = workout.id;
        feedback();
      }}
      onDragEnd={end}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press and hold the exercise title to drag. Use Move up or Move down in Set options for keyboard reordering. Escape cancels dragging.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${workout.exercises.find((e) => e.id === active.id)?.name || 'exercise'}.`,
          onDragOver: ({ over }) =>
            over
              ? `Position ${workout.exercises.findIndex((e) => e.id === over.id) + 1} of ${workout.exercises.length}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `Placed ${workout.exercises.find((e) => e.id === active.id)?.name || 'exercise'} at position ${workout.exercises.findIndex((e) => e.id === over.id) + 1}.`
              : 'Order unchanged.',
          onDragCancel: () => 'Reordering cancelled. Order unchanged.',
        },
      }}
    >
      <SortEdits.Provider
        value={(id, target) => {
          edit(id, target);
          const i = workout.exercises.findIndex((e) => e.id === target);
          setMessage(`Exercise moved to position ${i + 1} of ${workout.exercises.length}.`);
        }}
      >
        <SortableContext
          items={workout.exercises.map((e) => e.id)}
          strategy={verticalListSortingStrategy}
        >
          {children}
        </SortableContext>
        <span className="visually-hidden" role="status" aria-live="polite">
          {message}
        </span>
      </SortEdits.Provider>
    </DndContext>
  );
}
export function SortableExercise({
  exercise,
  workout,
  change,
}: {
  exercise: Exercise;
  workout: Workout;
  change: (fn: (w: Workout) => Workout) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: exercise.id,
    transition: { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' },
  });
  const move = useContext(SortEdits),
    index = workout.exercises.findIndex((e) => e.id === exercise.id);
  return (
    <div
      ref={setNodeRef}
      className={`sortable-exercise ${isDragging ? 'exercise-dragging' : ''}`}
      data-sortable-id={exercise.id}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ExerciseCard
        exercise={exercise}
        workout={workout}
        change={change}
        sort={{
          attributes,
          listeners,
          ref: setActivatorNodeRef,
          index,
          count: workout.exercises.length,
          move: (delta) => {
            const target = workout.exercises[index + delta];
            if (target) move(exercise.id, target.id);
          },
        }}
      />
    </div>
  );
}
