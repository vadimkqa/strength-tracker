import { useLayoutEffect, useRef, useState } from 'react';
import { stopwatch, type WorkoutController } from './controller';
export interface BubblePosition {
  x: number;
  y: number;
}
export function bubblePoint(
  position: BubblePosition,
  bounds: { left: number; top: number; width: number; height: number },
) {
  const x = Number.isFinite(position.x) ? Math.max(0, Math.min(1, position.x)) : 1;
  const y = Number.isFinite(position.y) ? Math.max(0, Math.min(1, position.y)) : 0.35;
  return { left: bounds.left + x * bounds.width, top: bounds.top + y * bounds.height };
}
interface Props {
  controller: WorkoutController;
  now: number;
  save: (position: BubblePosition) => void;
}
export function TimerBubble({ controller, now, save }: Props) {
  const bubble = useRef<HTMLButtonElement>(null),
    safe = useRef<HTMLSpanElement>(null),
    drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const position = controller.bubblePosition || { x: 1, y: 0.35 };
  const [preview, setPreview] = useState<BubblePosition | null>(null),
    [bounds, setBounds] = useState({ left: 8, top: 8, width: 0, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const vv = window.visualViewport;
      const left = (vv?.offsetLeft || 0) + 8,
        top =
          (vv?.offsetTop || 0) + (parseFloat(getComputedStyle(safe.current!).paddingTop) || 0) + 8;
      const width = vv?.width || innerWidth,
        height = vv?.height || innerHeight;
      const size = bubble.current?.offsetWidth || 76;
      const action = document.querySelector('.workout-floating-action')?.getBoundingClientRect();
      const bottom = Math.min((vv?.offsetTop || 0) + height - 8, action?.top ?? height - 150);
      setBounds({
        left,
        top,
        width: Math.max(0, width - size - 16),
        height: Math.max(0, bottom - size - 8 - top),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, []);
  const point = bubblePoint(preview || position, bounds);
  const normalized = (left: number, top: number) => ({
    x: bounds.width ? Math.max(0, Math.min(1, (left - bounds.left) / bounds.width)) : 0,
    y: bounds.height ? Math.max(0, Math.min(1, (top - bounds.top) / bounds.height)) : 0,
  });
  const phase =
    controller.phase === 'warmup' ? 'Warm-up' : controller.phase === 'set' ? 'Set' : 'Rest';
  return (
    <>
      <span ref={safe} className="timer-bubble-safe" aria-hidden="true" />
      <button
        ref={bubble}
        className="timer-bubble"
        style={point}
        aria-label="Move floating timer"
        title="Drag to move. Arrow keys also move the timer."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          const d = drag.current;
          if (d?.id === e.pointerId)
            setPreview(normalized(d.left + e.clientX - d.x, d.top + e.clientY - d.y));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          drag.current = null;
          save(normalized(d.left + e.clientX - d.x, d.top + e.clientY - d.y));
          setPreview(null);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          drag.current = null;
          setPreview(null);
        }}
        onKeyDown={(e) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-16, 0],
            ArrowRight: [16, 0],
            ArrowUp: [0, -16],
            ArrowDown: [0, 16],
          };
          const delta = directions[e.key];
          if (!delta) return;
          e.preventDefault();
          e.stopPropagation();
          save(normalized(point.left + delta[0], point.top + delta[1]));
        }}
      >
        <span className="bubble-phase">{phase}</span>
        <span className="bubble-elapsed" role="timer" aria-label="Floating elapsed time">
          {stopwatch(now - controller.phaseStarted)}
        </span>
      </button>
    </>
  );
}
