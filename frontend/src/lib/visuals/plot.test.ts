import { describe, expect, it } from 'vitest';
import { buildPlot, formatTick, parsePlot, ticks, type PlotData, type XY } from './plot';

const plot = (spec: object) => buildPlot(JSON.stringify(spec));
const one = (expr: string, x: [number, number], y?: [number, number]): PlotData =>
  plot({ x, y, functions: [{ expr }] });
const pieces = (data: PlotData) => data.curves[0].segments;
const last = (piece: XY[]) => piece[piece.length - 1];

describe('parsePlot', () => {
  it('reads every field', () => {
    const spec = parsePlot(
      JSON.stringify({
        title: 'Parabola', x: [-3, 3], y: [-5, 5], xLabel: 't', yLabel: 'v',
        functions: [{ expr: 'x^2-4', label: 'f' }, { expr: 'x' }],
        points: [{ x: 2, y: 0, label: 'root' }],
      }),
    );
    expect(spec).toMatchObject({ title: 'Parabola', x: [-3, 3], y: [-5, 5], xLabel: 't' });
    expect(spec.functions.map((f) => f.label)).toEqual(['f', 'y = x']);
    expect(spec.points).toEqual([{ x: 2, y: 0, label: 'root' }]);
  });

  it.each([
    ['not json', 'valid JSON'],
    ['[1]', 'JSON object'],
    ['{"functions":[{"expr":"x"}]}', '"x"'],
    ['{"x":[1,1],"functions":[{"expr":"x"}]}', 'less than'],
    ['{"x":[0,"2"],"functions":[{"expr":"x"}]}', 'two numbers'],
    ['{"x":[0,1],"y":[5,0],"functions":[{"expr":"x"}]}', 'less than'],
    ['{"x":[0,1]}', 'nothing to plot'],
    ['{"x":[0,1],"functions":[{"label":"f"}]}', 'expr'],
    ['{"x":[0,1],"functions":[{"expr":"x+"}]}', 'incomplete'],
    ['{"x":[0,1],"points":[{"x":1}]}', 'point'],
    ['{"x":[0,1],"functions":"x"}', 'list'],
  ])('explains what is wrong with %s', (source, reason) => {
    expect(() => parsePlot(source)).toThrow(reason);
  });
});

describe('buildPlot', () => {
  it('plots accurate values over the whole range', () => {
    const data = one('x^2-4', [-3, 3]);
    expect(pieces(data)).toHaveLength(1);
    const piece = pieces(data)[0];
    expect(piece[0]).toEqual([-3, 5]);
    expect(last(piece)).toEqual([3, 5]);
    for (const [x, y] of piece) expect(y).toBeCloseTo(x * x - 4, 10);
    expect(data.y[0]).toBeLessThanOrEqual(-4);
    expect(data.y[1]).toBeGreaterThanOrEqual(5);
    expect(data.xTicks).toContain(0);
  });

  it.each([
    [[-5, 5]],
    // Zero falls between two samples here.
    [[-5, 5.003]],
  ] as [[number, number]][])('breaks 1/x at zero over %j', (x) => {
    const data = one('1/x', x);
    const [left, right, ...rest] = pieces(data);
    expect(rest).toHaveLength(0);
    // Each branch runs off its end of the graph.
    expect(last(left)[0]).toBeLessThan(0);
    expect(last(left)[1]).toBeLessThan(data.y[0]);
    expect(right[0][0]).toBeGreaterThan(0);
    expect(right[0][1]).toBeGreaterThan(data.y[1]);
    // The asymptote does not flatten the rest of the curve.
    expect(data.y[1]).toBeLessThan(20);
  });

  it('breaks 1/x^2 although both sides rise', () => {
    expect(pieces(one('1/x^2', [-5, 5.003], [0, 100]))).toHaveLength(2);
  });

  it.each(['abs(1/x)', '1/(x-1.2345)^2'])('breaks %s wherever it falls', (expr) => {
    for (const end of [4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7]) {
      expect(pieces(one(expr, [-4, end]))).toHaveLength(2);
    }
  });

  it('breaks tan x at each asymptote', () => {
    const data = one('tan(x)', [-4, 4]);
    expect(pieces(data)).toHaveLength(3);
    expect(data.y[1]).toBeLessThan(40);
    for (const piece of pieces(data)) {
      // Rising throughout: no line joins +infinity to -infinity.
      for (let i = 1; i < piece.length; i += 1) {
        expect(piece[i][1]).toBeGreaterThanOrEqual(piece[i - 1][1]);
      }
    }
  });

  it('breaks the steps of floor(x)', () => {
    const data = one('floor(x)', [-2.5, 2.5]);
    expect(pieces(data)).toHaveLength(6);
    for (const piece of pieces(data)) expect(new Set(piece.map((p) => p[1])).size).toBe(1);
  });

  it('keeps steep but continuous curves whole', () => {
    expect(pieces(one('atan(10000x)', [-5, 5.003]))).toHaveLength(1);
    expect(pieces(one('1000x', [-5, 5], [-1, 1]))).toHaveLength(1);
    expect(pieces(one('abs(x)', [-1, 1]))).toHaveLength(1);
  });

  it('keeps a narrow peak in view', () => {
    expect(one('exp(-100x^2)', [-10, 10]).y[1]).toBeGreaterThanOrEqual(1);
  });

  it('draws up to the edge of the domain', () => {
    const [piece] = pieces(one('sqrt(x - 0.0005)', [-1, 4]));
    expect(piece[0][0]).toBeCloseTo(0.0005, 8);
    expect(piece[0][1]).toBeCloseTo(0, 4);
  });

  it('keeps given ranges and drops points outside them', () => {
    const data = plot({
      x: [0, 10], y: [0, 10],
      points: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 1, y: 20 }],
    });
    expect(data.y).toEqual([0, 10]);
    expect(data.points).toEqual([{ x: 1, y: 1, label: undefined }]);
  });

  it('gives a flat line some height', () => {
    const data = one('3', [0, 1]);
    expect(data.y[0]).toBeLessThan(3);
    expect(data.y[1]).toBeGreaterThan(3);
  });

  it('says when there is nothing to draw', () => {
    expect(() => one('sqrt(x)', [-5, -1])).toThrow('nothing to draw');
    expect(() => one('x', [0, 1], [5, 6])).toThrow('nothing to draw');
  });
});

describe('ticks', () => {
  it('uses round steps without binary noise', () => {
    expect(ticks([0, 1], 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(ticks([-10, 10], 8)).toEqual([-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10]);
  });

  it('formats large and small numbers compactly', () => {
    expect(formatTick(0)).toBe('0');
    expect(formatTick(-2.5)).toBe('-2.5');
    expect(formatTick(200000)).toBe('2e5');
    expect(formatTick(0.00025)).toBe('2.5e-4');
  });
});
