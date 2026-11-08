import { useEffect } from 'react';
/** Keep input widths in the layout viewport; use the visual viewport only for occlusion. */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0,
      baselineHeight = innerHeight,
      baselineWidth = innerWidth,
      revealFocused = false;
    const update = (event?: Event) => {
      if (event?.type === 'focusin' || event?.type === 'resize') revealFocused = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const reveal = revealFocused;
        revealFocused = false;
        const element = document.activeElement;
        const focused = element?.matches('input,textarea,select,[contenteditable=true]');
        const normalScale = Math.abs(vv.scale - 1) < 0.02;
        if (!focused || Math.abs(innerWidth - baselineWidth) > 20) {
          baselineHeight = innerHeight;
          baselineWidth = innerWidth;
        }
        const inset =
          focused && normalScale ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
        const workoutInput =
          element instanceof HTMLElement && element.matches('.active-workout .set-input');
        const keyboard =
          workoutInput && normalScale && (inset > 80 || baselineHeight - vv.height > 120);
        const root = document.documentElement;
        root.style.setProperty('--keyboard-offset', `${Math.round(inset)}px`);
        if (keyboard) root.dataset.workoutKeyboard = 'true';
        else delete root.dataset.workoutKeyboard;
        // Measure after fixed controls adopt their keyboard position, and scroll only if occluded.
        if (workoutInput && normalScale && reveal) {
          const rect = element.getBoundingClientRect();
          const action = document
            .querySelector('.workout-floating-action')
            ?.getBoundingClientRect();
          const top = vv.offsetTop + 12;
          const bottom = Math.min(
            vv.offsetTop + vv.height - 12,
            action ? action.top - 12 : Infinity,
          );
          const delta =
            rect.bottom > bottom ? rect.bottom - bottom : rect.top < top ? rect.top - top : 0;
          if (Math.abs(delta) > 2) window.scrollBy({ top: delta, behavior: 'instant' });
        }
        window.dispatchEvent(new Event('workout-viewport-change'));
      });
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--keyboard-offset');
      delete document.documentElement.dataset.workoutKeyboard;
    };
  }, []);
}
