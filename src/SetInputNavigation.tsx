import { adjustWeight } from './weight';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Resolve the live DOM order inside one exercise; no indices or saved session state. */
function adjacentInput(input: HTMLInputElement, direction: -1 | 1) {
  const card = input.closest('.exercise-card');
  if (!card || card.closest('[inert]')) return null;
  const fields = [...card.querySelectorAll<HTMLInputElement>('.set-input')].filter(
    (field) => !field.disabled && field.getClientRects().length > 0,
  );
  const index = fields.indexOf(input);
  return index < 0 ? null : fields[index + direction] || null;
}
export function advanceSetInput(input: HTMLInputElement) {
  if (!input.isConnected) return;
  const next = adjacentInput(input, 1);
  // Keep focus in the trusted input/click gesture. No blur, timeout or model update between fields.
  if (next) next.focus({ preventScroll: true });
  else input.blur();
}
interface Navigation {
  input: HTMLInputElement;
  next: string | null;
  previous: string | null;
  weight: boolean;
  width: number;
  top: number;
  viewportTop: number;
  left: number;
}
/** A document-layer accessory, not keyboard-height compensation for fixed app chrome. */
export function SetInputNavigation() {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const accessory = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const update = (event?: Event) => {
      // Focusout temporarily reports body as active; retain the bar when tabbing into it.
      if (
        event?.type === 'focusout' &&
        accessory.current?.contains((event as FocusEvent).relatedTarget as Node | null)
      )
        return;
      const input = document.activeElement;
      // A keyboard/assistive-technology user can also activate the semantic button.
      if (accessory.current?.contains(input)) return;
      if (
        !(input instanceof HTMLInputElement) ||
        !input.matches('.active-workout .set-input') ||
        input.closest('[inert]') ||
        document.hidden ||
        (vv && Math.abs(vv.scale - 1) >= 0.02)
      ) {
        setNavigation(null);
        return;
      }
      const next = adjacentInput(input, 1)?.getAttribute('aria-label') || null;
      const previousLabel = adjacentInput(input, -1)?.getAttribute('aria-label') || null;
      const weight = input.dataset.setField === 'weight';
      const viewportTop =
        (vv?.offsetTop || 0) + (vv?.height || innerHeight) - (weight ? 92 : 44) - 8;
      const top = scrollY + viewportTop;
      const left = scrollX + (vv?.offsetLeft || 0) + 8;
      const width = (vv?.width || innerWidth) - 16;
      setNavigation((previous) =>
        previous?.input === input &&
        previous.next === next &&
        previous.previous === previousLabel &&
        previous.width === width &&
        previous.top === top &&
        previous.left === left
          ? previous
          : { input, next, previous: previousLabel, weight, width, top, viewportTop, left },
      );
    };
    for (const event of [
      'focusin',
      'focusout',
      'scroll',
      'resize',
      'pageshow',
      'workout-viewport-change',
    ])
      window.addEventListener(event, update, { passive: true });
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      for (const event of [
        'focusin',
        'focusout',
        'scroll',
        'resize',
        'pageshow',
        'workout-viewport-change',
      ])
        window.removeEventListener(event, update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useLayoutEffect(() => {
    // The accessory now has measured bounds; let the existing hook reveal the field above it.
    if (navigation) window.dispatchEvent(new Event('workout-input-navigation'));
  }, [navigation?.input, navigation?.next, navigation?.previous, navigation?.viewportTop]);
  if (!navigation) return null;
  const dismiss = () => {
    navigation.input.blur();
    if (accessory.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    setNavigation(null);
  };
  return createPortal(
    <div
      ref={accessory}
      className="set-input-navigation"
      data-weight-controls={navigation.weight || undefined}
      role="group"
      aria-label="Set input navigation"
      style={{
        top: navigation.top,
        left: `calc(${navigation.left}px + env(safe-area-inset-left))`,
        width: `calc(${navigation.width}px - env(safe-area-inset-left) - env(safe-area-inset-right))`,
      }}
    >
      {navigation.weight && (
        <div className="weight-adjustments" role="group" aria-label="Adjust focused weight">
          {([-500, -250, 250, 500] as const).map((delta) => (
            <button
              key={delta}
              type="button"
              aria-label={`${delta < 0 ? 'Decrease' : 'Increase'} weight by ${Math.abs(delta) / 1000} kg`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                const input = navigation.input;
                if (
                  !input.isConnected ||
                  input.closest('[inert]') ||
                  input.dataset.setField !== 'weight'
                )
                  return;
                const value = adjustWeight(input.value, delta);
                if (value === null) return;
                // Bypass React's value tracker so the ordinary controlled input handler owns the write.
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
                  input,
                  value,
                );
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus({ preventScroll: true });
              }}
            >
              {delta < 0 ? '−' : '+'}
              {Math.abs(delta) / 1000}
              <small>kg</small>
            </button>
          ))}
        </div>
      )}
      <div className="set-navigation-buttons">
        <button
          type="button"
          aria-label={navigation.previous ? `Previous: ${navigation.previous}` : 'Previous field'}
          disabled={!navigation.previous}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => adjacentInput(navigation.input, -1)?.focus({ preventScroll: true })}
        >
          ← Previous
        </button>
        <button
          type="button"
          aria-label={navigation.next ? `Next: ${navigation.next}` : 'Done entering this exercise'}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => (navigation.next ? advanceSetInput(navigation.input) : dismiss())}
        >
          {navigation.next ? (
            <>
              Next <span aria-hidden="true">→</span>
            </>
          ) : (
            <>
              Done <span aria-hidden="true">✓</span>
            </>
          )}
        </button>
        {navigation.next && (
          <button
            type="button"
            aria-label="Dismiss set keyboard"
            onPointerDown={(event) => event.preventDefault()}
            onClick={dismiss}
          >
            Done ✓
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
