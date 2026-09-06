'use client';
import { LIMIT, timeLabel, type Point } from '@/lib/telemetry';

export function TemperatureChart({
  points,
  index,
  zone,
}: {
  points: Point[];
  index: number;
  zone: string;
}) {
  const width = 1100,
    height = 170,
    left = 38,
    right = 22,
    top = 15,
    bottom = 27;
  const x = (i: number) =>
    left + (i / (points.length - 1)) * (width - left - right);
  const y = (v: number) => top + ((10 - v) / 10) * (height - top - bottom);
  const paths: string[] = [];
  let path = '';
  points.forEach((p, i) => {
    if (i > index || p.temperature === null || p.sensors < 4) {
      if (path) paths.push(path);
      path = '';
      return;
    }
    path += `${path ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.temperature).toFixed(1)} `;
  });
  if (path) paths.push(path);
  const selected = points[index];
  return (
    <svg
      className="temperature-chart"
      viewBox={`0 0 ${width} ${height}`}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG data visualization uses image semantics.
      role="img"
      aria-label={`${zone} temperature history through ${timeLabel(selected.time, true)} UTC. Dashed line is the ${LIMIT} degree upper limit. Gaps indicate missing data.`}
    >
      <defs>
        <linearGradient id="warm-band" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d99266" stopOpacity=".035" />
          <stop offset="1" stopColor="#d99266" stopOpacity=".07" />
        </linearGradient>
      </defs>
      <rect
        x={left}
        y={top}
        width={width - left - right}
        height={y(5) - top}
        fill="url(#warm-band)"
      />
      {[0, 2, 5, 8, 10].map((v) => (
        <g key={v}>
          <line
            x1={left}
            x2={width - right}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 5 ? '#b59161' : '#26363e'}
            strokeDasharray={v === 5 ? '5 5' : undefined}
          />
          <text x={left - 10} y={y(v) + 4} textAnchor="end">
            {v}°
          </text>
        </g>
      ))}
      <text
        x={width - right}
        y={y(5) - 7}
        textAnchor="end"
        className="threshold-label"
      >
        5 °C upper limit
      </text>
      {[0, 48, 96, 144, 192, 240, 287].map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 5}
          textAnchor={i === 0 ? 'start' : i === 287 ? 'end' : 'middle'}
        >
          {timeLabel(points[i].time, i === 287)}
        </text>
      ))}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#bdf08d"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ))}
      <line
        x1={x(index)}
        x2={x(index)}
        y1={top}
        y2={height - bottom}
        stroke="#cedbcd"
        strokeDasharray="3 4"
        opacity=".6"
      />
      {selected.temperature !== null && selected.sensors === 4 && (
        <circle
          cx={x(index)}
          cy={y(selected.temperature)}
          r="5"
          fill="#c2f878"
          stroke="#17332a"
          strokeWidth="3"
        />
      )}
    </svg>
  );
}
