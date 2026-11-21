import { useEffect } from 'react';
/** Editing chrome only. Safari owns focus scrolling; there is no keyboard geometry or scroll loop. */
export function useKeyboardViewport() {
  useEffect(() => {
    let release: ReturnType<typeof setTimeout> | undefined;
    const root = document.documentElement;
    const editing = () =>
      document.activeElement instanceof HTMLElement &&
      !!document.activeElement.closest('.active-workout') &&
      document.activeElement.matches(
        'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]',
      );
    const update = () => {
      clearTimeout(release);
      if (editing()) {
        if (root.dataset.workoutKeyboard !== 'true') {
          root.dataset.workoutKeyboard = 'true';
          // One-way notification for the existing timer bubble; the editing strip does not subscribe.
          window.dispatchEvent(new Event('workout-viewport-change'));
        }
      } else if (!document.hidden)
        release = setTimeout(() => {
          if (!editing() && !document.hidden) {
            delete root.dataset.workoutKeyboard;
            window.dispatchEvent(new Event('workout-viewport-change'));
          }
        }, 250);
    };
    for (const event of ['focusin', 'focusout', 'pageshow']) window.addEventListener(event, update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      clearTimeout(release);
      for (const event of ['focusin', 'focusout', 'pageshow'])
        window.removeEventListener(event, update);
      document.removeEventListener('visibilitychange', update);
      delete root.dataset.workoutKeyboard;
    };
  }, []);
}
