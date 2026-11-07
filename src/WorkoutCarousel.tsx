import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { workouts, templateKey, type Rotation } from './workouts';
import type { Plan } from './templates';
export interface CarouselHandle {
  select: (index: number) => void;
}
interface Props {
  ref?: Ref<CarouselHandle>;
  selected: number;
  onSelect: (index: number) => void;
  plan: Plan;
  week: string;
  rotation?: Rotation;
  rotationWeek?: number;
}
export function WorkoutCarousel({
  selected,
  onSelect,
  plan,
  week,
  ref,
  rotation,
  rotationWeek,
}: Props) {
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const track = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ x: number; scroll: number; pointer: number } | null>(null);
  const items = [workouts[3], ...workouts, workouts[0]];
  const logical = (slot: number) => (slot - 1 + workouts.length) % workouts.length;
  function nearest() {
    const el = track.current!;
    const center = el.getBoundingClientRect().left + el.clientWidth / 2;
    let slot = 1,
      distance = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const rect = child.getBoundingClientRect();
      const delta = Math.abs(rect.left + rect.width / 2 - center);
      if (delta < distance) {
        slot = i;
        distance = delta;
      }
    });
    return slot;
  }
  function move(slot: number, smooth = true) {
    const el = track.current,
      child = el?.children[slot] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({
      left: child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2,
      behavior:
        smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant',
    });
  }
  useLayoutEffect(() => {
    move(selected + 1, false);
    const observer = new ResizeObserver(() => move(selectedRef.current + 1, false));
    if (track.current) observer.observe(track.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer.current);
    };
    // Selection is driven by scrolling; only mount/resizing should reposition instantly.
  }, []);
  const choose = (i: number) => {
    const slot =
      selected === 0 && i === 3 ? 0 : selected === 3 && i === 0 ? items.length - 1 : i + 1;
    move(slot);
  };
  useImperativeHandle(ref, () => ({ select: choose }));
  function settle() {
    if (drag.current) return;
    const slot = nearest();
    onSelect(logical(slot));
    if (slot === 0 || slot === items.length - 1) move(logical(slot) + 1, false);
  }
  return (
    <div className="carousel-shell">
      <div
        className="carousel"
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label="Workout selection"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            choose((selected + (e.key === 'ArrowRight' ? 1 : 3)) % 4);
          }
        }}
        onScroll={() => {
          if (!track.current) return;
          onSelect(logical(nearest()));
          clearTimeout(timer.current);
          timer.current = setTimeout(settle, 160);
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0) return;
          e.preventDefault();
          clearTimeout(timer.current);
          drag.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft, pointer: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.classList.add('dragging');
        }}
        onPointerMove={(e) => {
          if (!drag.current || e.pointerId !== drag.current.pointer) return;
          e.currentTarget.scrollLeft = drag.current.scroll - (e.clientX - drag.current.x);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          drag.current = null;
          e.currentTarget.classList.remove('dragging');
          e.currentTarget.releasePointerCapture(e.pointerId);
          move(nearest());
        }}
        onPointerCancel={(e) => {
          if (e.pointerType === 'mouse') {
            drag.current = null;
            e.currentTarget.classList.remove('dragging');
            move(nearest());
          }
        }}
      >
        {items.map((c, slot) => {
          const clone = slot === 0 || slot === items.length - 1;
          const i = logical(slot);
          const session = rotation?.sessions.find(
            (s) => s.week === rotationWeek && s.workout === c.key,
          );
          const rows = rotation
            ? session
              ? plan[session.key] || []
              : []
            : plan[templateKey(c.key, week)] || plan[c.key] || [];
          return (
            <article
              key={slot}
              className={`workout-card ${selected === i ? 'selected' : ''}`}
              aria-label={clone ? undefined : c.name}
              aria-hidden={clone || undefined}
            >
              <div className="photo">
                <img
                  draggable={false}
                  src={`${import.meta.env.BASE_URL}photos/${c.photo}.jpg`}
                  alt={clone ? '' : c.caption}
                />
                <span className="photo-number">
                  0{i + 1} <span>/ TRAINING SPLIT</span>
                </span>
              </div>
              <div className="card-caption">
                <p className="eyebrow">{c.muscles}</p>
                <h2>{c.name}</h2>
                <div className="card-footer">
                  <span>{rows.length} exercises</span>
                  <span>
                    Strength & conditioning <b aria-hidden="true">→</b>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="carousel-arrows">
        <button aria-label="Previous workout" onClick={() => choose((selected + 3) % 4)}>
          ←
        </button>
        <span>SWIPE TO EXPLORE</span>
        <button aria-label="Next workout" onClick={() => choose((selected + 1) % 4)}>
          →
        </button>
      </div>
    </div>
  );
}
