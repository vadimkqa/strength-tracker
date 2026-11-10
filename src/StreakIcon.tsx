import { useId } from 'react';
import { type StreakLevel, levelFor } from './streak';
export function StreakIcon({
  level = levelFor(0),
  className = '',
}: {
  level?: StreakLevel;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const materials = {
    purple: ['#4f2b72', '#ba83ee', '#70439b'],
    silver: ['#637084', '#edf0f7', '#8d9aaf'],
    gold: ['#8f6925', '#f5daa0', '#b88a37'],
    diamond: ['#447d9c', '#d6f7ff', '#83bfd5'],
    crystal: ['#7864a7', '#f1dfff', '#78c5d2'],
  };
  const colors = materials[level.material],
    barbell = level.type === 'barbell',
    plates = level.plates;
  return (
    <svg
      className={`streak-icon ${className}`}
      viewBox="0 0 180 84"
      role="img"
      aria-label={level.name}
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset=".43" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
      </defs>
      <ellipse cx="90" cy="67" rx={barbell ? 76 : 54} ry="7" fill="#9856dd" opacity=".08" />
      <rect
        x={barbell ? 8 : 35}
        y="38"
        width={barbell ? 164 : 110}
        height="8"
        rx="4"
        fill={`url(#${id}-metal)`}
        stroke={colors[1]}
        strokeOpacity=".5"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${80 + i * 5} 39v6`} stroke={colors[0]} strokeOpacity=".5" />
      ))}
      {plates === 0
        ? [50, 118].map((x) => (
            <g key={x}>
              <rect x={x} y="23" width="12" height="38" rx="5" fill={`url(#${id}-metal)`} />
              <path d={`M${x + 3} 28v28`} stroke={colors[1]} opacity=".45" />
            </g>
          ))
        : Array.from({ length: plates }, (_, i) =>
            [-1, 1].map((side) => {
              const x =
                side < 0
                  ? 90 - (barbell ? 40 : 26) - (i + 1) * 9
                  : 90 + (barbell ? 40 : 26) + i * 9;
              const h = level.weeks >= 6 ? 54 - i * 3 : 42 + i * 5,
                y = (84 - h) / 2;
              return (
                <g key={`${side}-${i}`}>
                  <rect
                    x={x}
                    y={y}
                    width="8"
                    height={h}
                    rx={level.material === 'diamond' || level.material === 'crystal' ? 1 : 3}
                    fill={`url(#${id}-metal)`}
                    stroke={colors[1]}
                    strokeWidth=".7"
                  />
                  <path d={`M${x + 2} ${y + 4}v${h - 8}`} stroke={colors[1]} opacity=".6" />
                  {['diamond', 'crystal'].includes(level.material) && (
                    <path
                      d={`M${x} ${y + h / 3}l8 ${h / 3}-8 ${h / 3}M${x + 8} ${y}l-8 ${h / 3} 8 ${h / 3}`}
                      fill="none"
                      stroke={colors[0]}
                      strokeWidth=".8"
                      opacity=".65"
                    />
                  )}
                </g>
              );
            }),
          )}
      {level.material === 'crystal' && (
        <g fill="none" stroke={colors[1]} strokeWidth="1">
          <path d="m33 12 3-6 3 6-3 6ZM141 66l3-6 3 6-3 6Z" />
        </g>
      )}
    </svg>
  );
}
