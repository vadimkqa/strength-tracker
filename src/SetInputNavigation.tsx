import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Workout } from './data';
import { adjustWorkoutInput } from './workout-inputs';

function usable(input: HTMLInputElement) {
  return (
    input.isConnected &&
    !input.disabled &&
    !input.closest('[inert]') &&
    input.matches('.active-workout .set-input') &&
    getComputedStyle(input).visibility !== 'hidden'
  );
}
function adjacentInput(input: HTMLInputElement, direction: -1 | 1) {
  const fields = [
    ...(input.closest('.exercise-card')?.querySelectorAll<HTMLInputElement>('.set-input') || []),
  ].filter(usable);
  const index = fields.indexOf(input);
  return index < 0 ? null : fields[index + direction] || null;
}
export function advanceSetInput(input: HTMLInputElement) {
  if (!usable(input)) return;
  // Let the browser scroll the new field into its real visible keyboard area.
  const next = adjacentInput(input, 1);
  if (next) next.focus();
  else input.blur();
}
interface Props {
  workout: Workout;
  change: (fn: (workout: Workout) => Workout) => void;
}
/** Permanent, ordinary document-flow editing controls. Not an OS keyboard accessory. */
export function SetInputNavigation({ workout, change }: Props) {
  const [target, setTarget] = useState<HTMLInputElement | null>(null);
  const current = useRef<HTMLInputElement | null>(null),
    root = useRef<HTMLDivElement>(null);
  const action = useRef<(name: string) => void>(() => {});
  const input = target && usable(target) ? target : null;
  const exerciseId = input?.closest<HTMLElement>('[data-exercise-id]')?.dataset.exerciseId;
  const setId = input?.closest<HTMLElement>('[data-set-id]')?.dataset.setId;
  const exercise = workout.exercises.find((e) => e.id === exerciseId);
  const index = exercise?.sets.findIndex((s) => s.id === setId) ?? -1;
  const entry = exercise?.sets[index];
  const weight = input?.dataset.setField === 'weight';
  const next = input ? adjacentInput(input, 1) : null,
    previous = input ? adjacentInput(input, -1) : null;
  action.current = (name) => {
    const input = current.current;
    if (!input || !usable(input)) return;
    if (name === 'previous' || name === 'next') {
      if (name === 'next') advanceSetInput(input);
      else adjacentInput(input, -1)?.focus();
      return;
    }
    if (input.dataset.setField !== 'weight') return;
    const exerciseId = input.closest<HTMLElement>('[data-exercise-id]')?.dataset.exerciseId;
    const setId = input.closest<HTMLElement>('[data-set-id]')?.dataset.setId;
    // Do not refocus an already focused input (or dispatch an artificial input event).
    // Recover an earlier blur synchronously in this first trusted press if necessary.
    if (document.activeElement !== input) input.focus();
    change((w) =>
      adjustWorkoutInput(w, exerciseId, setId, Number(name) as -500 | -250 | 250 | 500),
    );
  };
  useLayoutEffect(() => {
    const focus = (event: FocusEvent) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && usable(input)) {
        current.current = input;
        setTarget(input);
      }
      // Deliberately no focusout teardown: a press cannot destroy its own controls/target.
    };
    document.addEventListener('focusin', focus);
    if (document.activeElement instanceof HTMLInputElement && usable(document.activeElement)) {
      current.current = document.activeElement;
      setTarget(document.activeElement);
    }
    const strip = root.current!;
    const start = (event: TouchEvent) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('button[data-action]')
          : null;
      if (!button || event.touches.length !== 1) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) flushSync(() => action.current(button.dataset.action!));
    };
    // Safari's root touch listeners may be passive; attach locally and explicitly non-passive.
    strip.addEventListener('touchstart', start, { passive: false });
    return () => {
      document.removeEventListener('focusin', focus);
      strip.removeEventListener('touchstart', start);
    };
  }, []);
  const control = (name: string, label: string, text: string, disabled = false) => (
    <button
      key={name}
      type="button"
      data-action={name}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        event.preventDefault();
        if (event.pointerType !== 'touch' && event.button === 0) action.current(name);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        if (!window.PointerEvent) action.current(name);
      }}
      onClick={(event) => {
        if (event.detail === 0) action.current(name);
      }}
    >
      {text}
    </button>
  );
  return (
    <div
      ref={root}
      className="set-input-navigation"
      role="group"
      aria-label="Set input navigation"
      data-weight-controls={weight || undefined}
    >
      <div className="set-editing-context" aria-live="polite">
        <span>
          {entry
            ? `${exercise!.name} · Set ${index + 1} · ${weight ? 'Weight' : 'Reps'}`
            : 'Select a reps or weight field'}
        </span>
        <output>
          {entry ? `${entry[weight ? 'weight' : 'reps']}${weight ? ' kg' : ' reps'}` : ''}
        </output>
      </div>
      <div className="set-editing-buttons">
        {weight ? (
          <div className="weight-adjustments" role="group" aria-label="Adjust focused weight">
            {([-500, -250, 250, 500] as const).map((delta) =>
              control(
                String(delta),
                `${delta < 0 ? 'Decrease' : 'Increase'} weight by ${Math.abs(delta) / 1000} kg`,
                `${delta < 0 ? '−' : '+'}${Math.abs(delta) / 1000}`,
              ),
            )}
          </div>
        ) : (
          Array.from({ length: 4 }, (_, i) => <span key={i} aria-hidden="true" />)
        )}
        {control(
          'previous',
          previous ? `Previous: ${previous.getAttribute('aria-label')}` : 'Previous field',
          '←',
          !previous,
        )}
        {control(
          'next',
          next
            ? `Next: ${next.getAttribute('aria-label')}`
            : input
              ? 'Done entering this exercise'
              : 'Next field',
          next ? 'Next →' : 'Done ✓',
          !input,
        )}
      </div>
    </div>
  );
}
