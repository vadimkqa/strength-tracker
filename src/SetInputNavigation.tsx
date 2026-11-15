import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Resolve the live DOM order inside one exercise; no indices or saved session state. */
function nextInput(input: HTMLInputElement) {
  const card = input.closest('.exercise-card');
  if (!card || card.closest('[inert]')) return null;
  const fields = [...card.querySelectorAll<HTMLInputElement>('.set-input')].filter(
    (field) => !field.disabled && field.getClientRects().length > 0,
  );
  const index = fields.indexOf(input);
  return index < 0 ? null : fields[index + 1] || null;
}
export function advanceSetInput(input: HTMLInputElement) {
  if (!input.isConnected) return;
  const next = nextInput(input);
  // Keep focus in the trusted input/click gesture. No blur, timeout or model update between fields.
  if (next) next.focus({ preventScroll: true });
  else input.blur();
}
interface Navigation {
  input: HTMLInputElement;
  next: string | null;
  top: number;
  left: number;
}
/** A document-layer accessory, not keyboard-height compensation for fixed app chrome. */
export function SetInputNavigation() {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const accessory = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
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
      const next = nextInput(input)?.getAttribute('aria-label') || null;
      const top = scrollY + (vv?.offsetTop || 0) + (vv?.height || innerHeight) - 52;
      const left = scrollX + (vv?.offsetLeft || 0) + (vv?.width || innerWidth) - 116;
      setNavigation((previous) =>
        previous?.input === input &&
        previous.next === next &&
        previous.top === top &&
        previous.left === left
          ? previous
          : { input, next, top, left },
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
  }, [navigation?.input, navigation?.next]);
  if (!navigation) return null;
  return createPortal(
    <div
      ref={accessory}
      className="set-input-navigation"
      role="group"
      aria-label="Set input navigation"
      style={{ top: navigation.top, left: navigation.left }}
    >
      <button
        type="button"
        aria-label={navigation.next ? `Next: ${navigation.next}` : 'Done entering this exercise'}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => advanceSetInput(navigation.input)}
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
    </div>,
    document.body,
  );
}
