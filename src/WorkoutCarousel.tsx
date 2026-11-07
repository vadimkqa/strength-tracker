import { useImperativeHandle, useRef, useState, type Ref, type CSSProperties } from 'react';
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
  const gesture = useRef<{
    x: number;
    y: number;
    dx: number;
    index: number | null;
    id: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const choose = (index: number) => {
    setOffset(0);
    onSelect((index + 4) % 4);
  };
  useImperativeHandle(ref, () => ({ select: choose }));
  return (
    <div className="carousel-shell playing-stack-shell">
      <div
        className="carousel playing-stack"
        role="region"
        aria-roledescription="carousel"
        aria-label="Workout selection"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            choose(selected + (e.key === 'ArrowRight' ? 1 : -1));
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.pointerType === 'mouse') e.preventDefault();
          suppressClick.current = false;
          const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card-index]');
          gesture.current = {
            x: e.clientX,
            y: e.clientY,
            dx: 0,
            index: card ? Number(card.dataset.cardIndex) : null,
            id: e.pointerId,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          g.dx = e.clientX - g.x;
          if (Math.abs(g.dx) > Math.abs(e.clientY - g.y))
            setOffset(Math.max(-90, Math.min(90, g.dx)));
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g) return;
          gesture.current = null;
          suppressClick.current = Math.abs(g.dx) > 8;
          setOffset(0);
          if (Math.abs(g.dx) > 45 && Math.abs(g.dx) > Math.abs(e.clientY - g.y))
            choose(selected + (g.dx < 0 ? 1 : -1));
          else if (Math.abs(g.dx) < 8 && Math.abs(e.clientY - g.y) < 8 && g.index !== null)
            choose(g.index);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          gesture.current = null;
          setOffset(0);
        }}
      >
        {workouts.map((card, index) => {
          const distance = (index - selected + 4) % 4;
          const position =
            distance === 0
              ? 'front'
              : distance === 1
                ? 'next'
                : distance === 3
                  ? 'previous'
                  : 'back';
          const session = rotation?.sessions.find(
            (s) => s.week === rotationWeek && s.workout === card.key,
          );
          const rows = rotation
            ? session
              ? plan[session.key] || []
              : []
            : plan[templateKey(card.key, week)] || plan[card.key] || [];
          const day = session?.day || (rotation ? 'Unscheduled' : card.key.split(' · ')[0]);
          const intensity = session?.intensity || (week === 'easy' ? 'easy' : 'hard');
          const cores = rows.filter((r) => r[3]?.kind === 'core' || /^core\b/i.test(r[0])).length,
            optional = rows.filter((r) => r[3]?.optional).length;
          return (
            <article
              key={card.key}
              data-card-index={index}
              className={`workout-card stack-card stack-${position} ${distance === 0 ? 'selected' : ''}`}
              aria-label={card.name}
              aria-hidden={position === 'back' || undefined}
              style={{ '--drag-x': distance === 0 ? `${offset}px` : '0px' } as CSSProperties}
            >
              <button
                className="stack-card-select"
                tabIndex={position === 'back' ? -1 : 0}
                aria-current={position === 'front' ? 'true' : undefined}
                aria-label={
                  position === 'front' ? `Selected ${card.name}` : `Bring ${card.name} to front`
                }
                onClick={() => {
                  if (!suppressClick.current) choose(index);
                }}
              />
              <span className="stack-peek-label" aria-hidden="true">
                {card.name}
              </span>
              <div className="stack-card-top">
                <span>{day}</span>
                <span>{rotation ? `Week ${rotationWeek}` : 'YOUR TRAINING'}</span>
              </div>
              <div className="photo">
                <img
                  draggable={false}
                  src={`${import.meta.env.BASE_URL}photos/${card.photo}.jpg`}
                  alt={card.caption}
                />
                <span className="stack-intensity">{intensity === 'hard' ? 'HEAVY' : 'EASY'}</span>
              </div>
              <div className="card-caption">
                <p className="eyebrow">{card.muscles}</p>
                <h2>{card.name}</h2>
                <div className="card-footer">
                  <span>
                    {rows.length} exercises{cores ? ` · ${cores} core` : ''}
                    {optional ? ` · ${optional} optional` : ''}
                  </span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="carousel-arrows stack-navigation">
        <button aria-label="Previous workout" onClick={() => choose(selected - 1)}>
          ←
        </button>
        <span aria-live="polite">
          {workouts[selected].name} · {selected + 1} / 4
        </span>
        <button aria-label="Next workout" onClick={() => choose(selected + 1)}>
          →
        </button>
      </div>
    </div>
  );
}
