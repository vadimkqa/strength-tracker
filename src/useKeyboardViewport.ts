import { useEffect } from 'react';
/** Follow a focused keyboard's visual viewport, but never counteract user pinch zoom. */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement?.matches(
          'input,textarea,select,[contenteditable=true]',
        );
        const inset =
          focused && Math.abs(vv.scale - 1) < 0.02
            ? Math.max(0, innerHeight - vv.height - vv.offsetTop)
            : 0;
        document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(inset)}px`);
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
    };
  }, []);
}
