import { useEffect } from 'react';
/** DOMRects and visualViewport bounds are in layout-viewport coordinates. Never translate fixed chrome by keyboard height. */
export function focusedInputDelta(
  rect: { top: number; bottom: number },
  viewport: { offsetTop: number; height: number },
  occlusionTop = Infinity,
) {
  const top = viewport.offsetTop + 8,
    bottom = Math.min(viewport.offsetTop + viewport.height, occlusionTop) - 8;
  // Browser scroll positions can round to whole CSS pixels; round outward so the safety gap survives.
  return rect.bottom > bottom
    ? Math.ceil(rect.bottom - bottom)
    : rect.top < top
      ? Math.floor(rect.top - top)
      : 0;
}
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport,
      root = document.documentElement;
    let frame = 0,
      release: ReturnType<typeof setTimeout> | undefined,
      reveal = false;
    const input = () => {
      const el = document.activeElement;
      return el instanceof HTMLElement &&
        el.closest('.active-workout') &&
        el.matches(
          'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]',
        )
        ? el
        : null;
    };
    const update = (event?: Event) => {
      const focused = input();
      clearTimeout(release);
      // Focus, not an estimated keyboard inset, owns editing mode. Also works with hardware keyboards.
      if (focused) root.dataset.workoutKeyboard = 'true';
      else if (!document.hidden)
        release = setTimeout(() => {
          if (!input() && !document.hidden) {
            delete root.dataset.workoutKeyboard;
            window.dispatchEvent(new Event('workout-viewport-change'));
          }
        }, 250); // Only debounce chrome restoration during keyboard dismissal; this is not a layout offset.
      reveal ||=
        !!focused &&
        ['focusin', 'resize', 'pageshow', 'visibilitychange', 'workout-input-navigation'].includes(
          event?.type || '',
        );
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = input(),
          shouldReveal = reveal;
        reveal = false;
        if (focused && shouldReveal && !document.hidden && (!vv || Math.abs(vv.scale - 1) < 0.02)) {
          const delta = focusedInputDelta(
            focused.getBoundingClientRect(),
            vv || { offsetTop: 0, height: innerHeight },
            // A newly mounted fixed accessory is hidden at top:0 until its first viewport placement.
            // Never scroll the input against that provisional, non-visible rectangle.
            document.querySelector<HTMLElement>('.set-input-navigation')?.dataset.positioned ===
              'true'
              ? document.querySelector('.set-input-navigation')!.getBoundingClientRect().top
              : undefined,
          );
          if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
        }
        window.dispatchEvent(new Event('workout-viewport-change'));
      });
    };
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    for (const event of ['focusin', 'focusout', 'resize', 'pageshow', 'workout-input-navigation'])
      window.addEventListener(event, update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(release);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      for (const event of ['focusin', 'focusout', 'resize', 'pageshow', 'workout-input-navigation'])
        window.removeEventListener(event, update);
      document.removeEventListener('visibilitychange', update);
      delete root.dataset.workoutKeyboard;
    };
  }, []);
}
