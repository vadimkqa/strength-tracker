import { accessoryTop } from './accessory-geometry';
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
}
/** One fixed body-level layer; visualViewport is the only positioning authority. */
export function SetInputNavigation() {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const accessory = useRef<HTMLDivElement>(null);
  const live = useRef<Navigation | null>(null);
  const touch = useRef<{
    button: HTMLButtonElement;
    input: HTMLInputElement;
    x: number;
    y: number;
  } | null>(null);
  const lastTouch = useRef(-Infinity);
  const act = useRef<(action: string, input: HTMLInputElement) => void>(() => {});
  const position = useRef<() => void>(() => {});
  const usable = (input: HTMLInputElement) =>
    input.isConnected &&
    !input.disabled &&
    !input.closest('[inert]') &&
    input.matches('.active-workout .set-input') &&
    input.getClientRects().length > 0;
  act.current = (action, input) => {
    if (!usable(input)) return;
    if (action === 'done') {
      touch.current = null;
      input.blur();
      if (accessory.current?.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
      live.current = null;
      setNavigation(null);
      return;
    }
    // All restoration is synchronous inside the trusted gesture, never a delayed keyboard reopen.
    if (action === 'previous' || action === 'next') {
      adjacentInput(input, action === 'previous' ? -1 : 1)?.focus({ preventScroll: true });
      return;
    }
    if (input.dataset.setField !== 'weight') return;
    input.focus({ preventScroll: true });
    const value = adjustWeight(input.value, Number(action) as -500 | -250 | 250 | 500);
    if (value === null) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    let frame = 0;
    const place = () => {
      frame = 0;
      const bar = accessory.current;
      if (!bar || !live.current) return;
      const viewport = vv || { offsetTop: 0, height: innerHeight };
      const safe =
        parseFloat(getComputedStyle(bar).getPropertyValue('--accessory-safe-bottom')) || 0;
      const top = accessoryTop(
        viewport,
        bar.getBoundingClientRect().height,
        safe,
        document.documentElement.clientHeight,
      );
      const changed = bar.style.top !== `${top}px`;
      bar.style.top = `${top}px`;
      bar.dataset.positioned = 'true';
      if (changed) window.dispatchEvent(new Event('workout-input-navigation'));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    position.current = schedule;
    const update = (event?: Event) => {
      if (
        event?.type === 'focusout' &&
        (touch.current ||
          accessory.current?.contains((event as FocusEvent).relatedTarget as Node | null))
      )
        return;
      const input = document.activeElement;
      if (accessory.current?.contains(input)) return;
      if (
        !(input instanceof HTMLInputElement) ||
        !usable(input) ||
        document.hidden ||
        (vv && Math.abs(vv.scale - 1) >= 0.02)
      ) {
        // Retain the input only for an in-flight, protected accessory touch.
        if (!document.hidden && touch.current && usable(touch.current.input)) return;
        touch.current = null;
        live.current = null;
        setNavigation(null);
        return;
      }
      const next = adjacentInput(input, 1)?.getAttribute('aria-label') || null;
      const previous = adjacentInput(input, -1)?.getAttribute('aria-label') || null;
      const nav = { input, next, previous, weight: input.dataset.setField === 'weight' };
      live.current = nav;
      setNavigation((old) =>
        old?.input === input && old.next === next && old.previous === previous ? old : nav,
      );
      schedule();
    };
    const geometry = () => {
      update();
      schedule();
    };
    // Document scrolling does not reposition a fixed layer or feed another scroll calculation.
    for (const event of ['focusin', 'focusout', 'pageshow', 'workout-viewport-change'])
      window.addEventListener(event, update);
    window.addEventListener('resize', geometry);
    vv?.addEventListener('resize', geometry);
    vv?.addEventListener('scroll', geometry);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      for (const event of ['focusin', 'focusout', 'pageshow', 'workout-viewport-change'])
        window.removeEventListener(event, update);
      window.removeEventListener('resize', geometry);
      vv?.removeEventListener('resize', geometry);
      vv?.removeEventListener('scroll', geometry);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useLayoutEffect(() => {
    const bar = accessory.current;
    if (!bar || !navigation) return;
    position.current();
    const buttonAt = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLButtonElement>('button[data-action]') : null;
    const start = (event: TouchEvent) => {
      const button = buttonAt(event.target),
        nav = live.current;
      if (!button || button.disabled || !nav || !usable(nav.input) || event.touches.length !== 1)
        return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const point = event.touches[0];
      lastTouch.current = performance.now();
      touch.current = { button, input: nav.input, x: point.clientX, y: point.clientY };
    };
    const move = (event: TouchEvent) => {
      if (!touch.current) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const point = event.touches[0];
      if (
        !point ||
        Math.hypot(point.clientX - touch.current.x, point.clientY - touch.current.y) > 12
      ) {
        touch.current = null;
        lastTouch.current = performance.now();
      }
    };
    const end = (event: TouchEvent) => {
      const held = touch.current;
      if (!held) {
        window.dispatchEvent(new Event('workout-viewport-change'));
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      touch.current = null;
      lastTouch.current = performance.now();
      const point = event.changedTouches[0],
        rect = held.button.getBoundingClientRect();
      if (
        point &&
        point.clientX >= rect.left &&
        point.clientX <= rect.right &&
        point.clientY >= rect.top &&
        point.clientY <= rect.bottom
      )
        act.current(held.button.dataset.action!, held.input);
    };
    const cancel = () => {
      touch.current = null;
      lastTouch.current = performance.now();
      window.dispatchEvent(new Event('workout-viewport-change'));
    };
    bar.addEventListener('touchstart', start, { passive: false });
    bar.addEventListener('touchmove', move, { passive: false });
    bar.addEventListener('touchend', end, { passive: false });
    bar.addEventListener('touchcancel', cancel);
    return () => {
      bar.removeEventListener('touchstart', start);
      bar.removeEventListener('touchmove', move);
      bar.removeEventListener('touchend', end);
      bar.removeEventListener('touchcancel', cancel);
    };
  }, [navigation?.input]);
  if (!navigation) return null;
  const control = (action: string, label: string, text: string, disabled = false) => (
    <button
      type="button"
      key={action}
      data-action={action}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch') event.preventDefault();
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        // Touchend already committed the action; suppress its possible compatibility click.
        if (event.detail > 0 && performance.now() - lastTouch.current < 800) return;
        act.current(action, navigation.input);
      }}
    >
      {text}
    </button>
  );
  return createPortal(
    <div
      ref={accessory}
      className="set-input-navigation"
      role="group"
      aria-label="Set input navigation"
      data-weight-controls={navigation.weight || undefined}
    >
      {navigation.weight && (
        <div className="weight-adjustments" role="group" aria-label="Adjust focused weight">
          {([-500, -250, 250, 500] as const).map((delta) =>
            control(
              String(delta),
              `${delta < 0 ? 'Decrease' : 'Increase'} weight by ${Math.abs(delta) / 1000} kg`,
              `${delta < 0 ? '−' : '+'}${Math.abs(delta) / 1000}`,
            ),
          )}
        </div>
      )}
      <div className="set-navigation-buttons">
        {control(
          'previous',
          navigation.previous ? `Previous: ${navigation.previous}` : 'Previous field',
          '←',
          !navigation.previous,
        )}
        {control(
          'next',
          navigation.next ? `Next: ${navigation.next}` : 'Next field',
          '→',
          !navigation.next,
        )}
        {control(
          'done',
          navigation.next ? 'Dismiss set keyboard' : 'Done entering this exercise',
          '✓',
        )}
      </div>
    </div>,
    document.body,
  );
}
