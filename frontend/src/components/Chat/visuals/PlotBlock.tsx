import { useMemo, type ReactNode } from 'react';
import { buildPlot, formatTick, type PlotData } from '../../../lib/visuals/plot';

// Literal colours on a white card, so graphs look the same in every theme and
// on paper. Dashes tell the curves apart without colour.
const STYLES = [
  { color: '#1d4ed8' },
  { color: '#dc2626', dash: '8 4' },
  { color: '#047857', dash: '2 3' },
  { color: '#b45309', dash: '10 4 2 4' },
  { color: '#7c3aed', dash: '5 2' },
  { color: '#0e7490', dash: '14 4' },
];

const WIDTH = 600;
const PLOT_HEIGHT = 340;

/** Labels are drawn as plain text, so drop any maths delimiters. */
const plain = (label: string) => label.replace(/\$/g, '');

function Graph({ plot }: { plot: PlotData }) {
  const left = plot.yLabel ? 76 : 56;
  const right = 24;
  const top = 14;
  const bottom = plot.xLabel ? 46 : 26;
  const width = WIDTH - left - right;
  const height = PLOT_HEIGHT;
  const [x0, x1] = plot.x;
  const [y0, y1] = plot.y;
  const px = (x: number) => left + ((x - x0) / (x1 - x0)) * width;
  // Far outside the frame the exact height no longer matters.
  const reach = (y1 - y0) * 20;
  const py = (y: number) =>
    top + ((y1 - Math.min(Math.max(y, y0 - reach), y1 + reach)) / (y1 - y0)) * height;
  const axisY = y0 <= 0 && y1 >= 0 ? py(0) : top + height;
  const axisX = x0 <= 0 && x1 >= 0 ? px(0) : left;
  const name = plot.title ?? `Graph of ${plot.curves.map((c) => c.label).join(', ') || 'points'}`;

  return (
    <svg
      className="graph-svg"
      viewBox={`0 0 ${WIDTH} ${top + height + bottom}`}
      role="img"
      aria-label={plain(name)}
      fontSize="11"
    >
      <g stroke="#e2e8f0" strokeWidth="1">
        {plot.xTicks.map((t) => (
          <line key={`x${t}`} x1={px(t)} x2={px(t)} y1={top} y2={top + height} />
        ))}
        {plot.yTicks.map((t) => (
          <line key={`y${t}`} x1={left} x2={left + width} y1={py(t)} y2={py(t)} />
        ))}
      </g>
      <rect x={left} y={top} width={width} height={height} fill="none" stroke="#cbd5e1" />
      <g stroke="#475569" strokeWidth="1.25">
        <line className="graph-x-axis" x1={left} x2={left + width} y1={axisY} y2={axisY} />
        <line className="graph-y-axis" x1={axisX} x2={axisX} y1={top} y2={top + height} />
      </g>
      <g fill="#334155">
        {plot.xTicks.map((t) => (
          <text key={`x${t}`} x={px(t)} y={top + height + 16} textAnchor="middle">
            {formatTick(t)}
          </text>
        ))}
        {plot.yTicks.map((t) => (
          <text key={`y${t}`} x={left - 6} y={py(t) + 4} textAnchor="end">
            {formatTick(t)}
          </text>
        ))}
        {plot.xLabel && (
          <text x={left + width / 2} y={top + height + 37} textAnchor="middle" fontSize="13">
            {plain(plot.xLabel)}
          </text>
        )}
        {plot.yLabel && (
          <text
            transform={`translate(14 ${top + height / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="13"
          >
            {plain(plot.yLabel)}
          </text>
        )}
      </g>
      {/* A nested <svg> clips the curves to the frame without needing ids. */}
      <svg
        x={left}
        y={top}
        width={width}
        height={height}
        viewBox={`${left} ${top} ${width} ${height}`}
        overflow="hidden"
      >
        {plot.curves.map((curve, i) => (
          <path
            key={i}
            className="graph-curve"
            d={curve.segments
              .map(
                (segment) =>
                  `M${segment.map(([x, y]) => `${px(x).toFixed(2)},${py(y).toFixed(2)}`).join('L')}`,
              )
              .join('')}
            fill="none"
            stroke={STYLES[i % STYLES.length].color}
            strokeDasharray={STYLES[i % STYLES.length].dash}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <g fill="#0f172a">
        {plot.points.map((point, i) => {
          const x = px(point.x);
          const y = py(point.y);
          const flip = x > left + width * 0.75;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="3.5" />
              {point.label && (
                <text
                  x={flip ? x - 7 : x + 7}
                  y={y < top + 18 ? y + 16 : y - 7}
                  textAnchor={flip ? 'end' : 'start'}
                  stroke="#ffffff"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {plain(point.label)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** A ```plot block drawn as a graph, or its code when it cannot be drawn. */
export function PlotBlock({ code, codeView }: { code: string; codeView: ReactNode }) {
  const result = useMemo(() => {
    try {
      return { plot: buildPlot(code) };
    } catch (error) {
      return { reason: (error as Error).message };
    }
  }, [code]);

  if (!result.plot) {
    return (
      <div data-no-speech>
        <p className="visual-error">This graph could not be drawn. {result.reason}.</p>
        {codeView}
      </div>
    );
  }

  const { plot } = result;
  return (
    <div className="visual-block" data-no-speech dir="ltr">
      <figure className="answer-figure">
        {plot.title && <figcaption>{plain(plot.title)}</figcaption>}
        <Graph plot={plot} />
        {plot.curves.length > 0 && (
          <div className="graph-legend">
            {plot.curves.map((curve, i) => (
              <span key={i}>
                <svg width="28" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    x2="28"
                    y1="4"
                    y2="4"
                    stroke={STYLES[i % STYLES.length].color}
                    strokeDasharray={STYLES[i % STYLES.length].dash}
                    strokeWidth="2"
                  />
                </svg>
                {plain(curve.label)}
              </span>
            ))}
          </div>
        )}
      </figure>
    </div>
  );
}
