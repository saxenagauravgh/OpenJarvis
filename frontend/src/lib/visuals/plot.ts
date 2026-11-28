/** Turn a ```plot block (JSON) into the lines, points and ticks of a graph. */

import { compileExpression, type MathFunction } from './expression';

export type Range = [number, number];
export type XY = [number, number];

export interface PlotSpec {
  title?: string;
  x: Range;
  y?: Range;
  functions: { expr: string; label: string; f: MathFunction }[];
  points: { x: number; y: number; label?: string }[];
  xLabel?: string;
  yLabel?: string;
}

export interface PlotData extends Omit<PlotSpec, 'y' | 'functions'> {
  y: Range;
  /** Each curve is a list of unbroken pieces. */
  curves: { label: string; segments: XY[][] }[];
  xTicks: number[];
  yTicks: number[];
}

const MAX_SOURCE = 20_000;
const MAX_FUNCTIONS = 6;
const MAX_POINTS = 100;
const MAX_VALUE = 1e12;
export const SAMPLES = 1000;

function text(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`"${name}" must be text`);
  return value.slice(0, 200);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_VALUE;
}

function range(value: unknown, name: string): Range {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isNumber)) {
    throw new Error(`"${name}" must be two numbers, [min, max]`);
  }
  const [min, max] = value as Range;
  const scale = Math.max(Math.abs(min), Math.abs(max));
  if (!(max - min > Math.max(scale * 1e-9, 1e-9))) {
    throw new Error(`"${name}" needs min to be less than max`);
  }
  return [min, max];
}

function list(value: unknown, name: string, limit: number): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object')) {
    throw new Error(`"${name}" must be a list`);
  }
  if (value.length > limit) throw new Error(`Too many ${name} (at most ${limit})`);
  return value as Record<string, unknown>[];
}

/** Read and check the JSON of a plot block. Throws an Error with a readable message. */
export function parsePlot(source: string): PlotSpec {
  if (source.length > MAX_SOURCE) throw new Error('The graph description is too long');
  let raw: any;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error('The graph description is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The graph description must be a JSON object');
  }
  const functions = list(raw.functions, 'functions', MAX_FUNCTIONS).map((item) => {
    if (typeof item.expr !== 'string' || !item.expr.trim()) {
      throw new Error('Each function needs an "expr"');
    }
    const expr = item.expr.trim();
    const label = text(item.label, 'label') ?? `y = ${expr}`;
    return { expr, label, f: compileExpression(expr) };
  });
  const points = list(raw.points, 'points', MAX_POINTS).map((item) => {
    if (!isNumber(item.x) || !isNumber(item.y)) {
      throw new Error('Each point needs numbers "x" and "y"');
    }
    return { x: item.x, y: item.y, label: text(item.label, 'label') };
  });
  if (!functions.length && !points.length) throw new Error('There is nothing to plot');
  return {
    title: text(raw.title, 'title'),
    x: range(raw.x, 'x'),
    y: raw.y === undefined || raw.y === null ? undefined : range(raw.y, 'y'),
    functions,
    points,
    xLabel: text(raw.xLabel, 'xLabel'),
    yLabel: text(raw.yLabel, 'yLabel'),
  };
}

function sample(f: MathFunction, [min, max]: Range): XY[] {
  return Array.from({ length: SAMPLES + 1 }, (_, i): XY => {
    const x = i === SAMPLES ? max : min + ((max - min) * i) / SAMPLES;
    return [x, f(x)];
  });
}

/** Points from a defined value towards a place where the function is undefined. */
function towards(f: MathFunction, from: XY, bad: number): XY[] {
  const found: XY[] = [];
  let good = from[0];
  let edge = bad;
  for (let i = 0; i < 50; i += 1) {
    const mid = (good + edge) / 2;
    if (mid === good || mid === edge) break;
    const y = f(mid);
    if (Number.isFinite(y)) {
      found.push([mid, y]);
      good = mid;
    } else {
      edge = mid;
    }
  }
  return found;
}

/**
 * Look for a jump or an asymptote between a and b, returning the tiny interval
 * around it. A continuous function's change shrinks as the interval is halved;
 * across a break it never does.
 */
function findBreak(f: MathFunction, a: XY, b: XY, tolerance: number): [number, number] | null {
  const halve = (lo: XY, hi: XY, depth: number) => {
    const x = (lo[0] + hi[0]) / 2;
    const mid: XY = [x, f(x)];
    const change = Math.max(Math.abs(mid[1] - lo[1]), Math.abs(hi[1] - mid[1]));
    return { lo, mid, hi, depth, change };
  };
  const open = [halve(a, b, 0)];
  // Always split the part that changes most: it closes in on any break, even
  // where both sides rise together as in 1/x^2.
  for (let budget = 200; budget > 0; budget -= 1) {
    let worst = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].change > open[worst].change) worst = i;
    const { lo, mid, hi, depth, change } = open[worst];
    if (!Number.isFinite(mid[1])) return [mid[0], mid[0]];
    if (change <= tolerance) return null;
    if (depth === 50 || mid[0] === lo[0] || mid[0] === hi[0]) return [lo[0], hi[0]];
    const first = halve(lo, mid, depth + 1);
    const second = halve(mid, hi, depth + 1);
    // An undefined value is itself the break.
    for (const half of [first, second]) {
      if (!Number.isFinite(half.mid[1])) return [half.mid[0], half.mid[0]];
    }
    open.splice(worst, 1, first, second);
  }
  // Out of patience, as with very rapid oscillation: join the samples.
  return null;
}

/** The points that carry each side of a break from a and b up to it. */
function upTo(f: MathFunction, a: XY, b: XY, [low, high]: [number, number]) {
  const side = (end: number, near: number): XY[] => {
    const xs = [near];
    for (let k = 40; k > 0; k -= 1) xs.push(near + (end - near) / 2 ** k);
    return [...new Set(xs)]
      .filter((x) => x !== end)
      .map((x): XY => [x, f(x)])
      .filter((p) => Number.isFinite(p[1]));
  };
  return { left: side(a[0], low).reverse(), right: side(b[0], high) };
}

/** The unbroken pieces of a sampled curve. */
function segmentsOf(f: MathFunction, samples: XY[], tolerance: number) {
  const segments: XY[][] = [];
  let current: XY[] = [];
  let broken = false;
  const close = () => {
    if (current.length > 1) segments.push(current);
    current = [];
  };
  samples.forEach((point, i) => {
    const previous = samples[i - 1];
    const defined = Number.isFinite(point[1]);
    if (!defined) broken = true;
    if (!previous) {
      if (defined) current.push(point);
      return;
    }
    const wasDefined = Number.isFinite(previous[1]);
    if (wasDefined && defined) {
      const gap = findBreak(f, previous, point, tolerance);
      if (gap) {
        broken = true;
        const { left, right } = upTo(f, previous, point, gap);
        current.push(...left);
        close();
        current.push(...right);
      }
      current.push(point);
    } else if (wasDefined) {
      current.push(...towards(f, previous, point[0]));
      close();
    } else if (defined) {
      current.push(...towards(f, point, previous[0]).reverse(), point);
    }
  });
  close();
  return { segments, broken };
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.round(q * (sorted.length - 1))];
}

/** The y values worth showing for one curve: an asymptote must not flatten it. */
function interestingRange(f: MathFunction, samples: XY[]): Range | null {
  const values = samples.map((p) => p[1]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const min = values[0];
  const max = values[values.length - 1];
  const low = quantile(values, 0.05);
  const high = quantile(values, 0.95);
  const core = high - low;
  if (core > 0 && max - min > 3 * core && segmentsOf(f, samples, core / 100).broken) {
    return [Math.max(min, low - core / 2), Math.min(max, high + core / 2)];
  }
  return [min, max];
}

/** A step of 1, 2, 2.5 or 5 times a power of ten giving about `count` intervals. */
export function tickStep(span: number, count: number): number {
  const rough = span / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const factor = [1, 2, 2.5, 5, 10].find((m) => m * power >= rough * (1 - 1e-9)) ?? 10;
  return factor * power;
}

export function ticks([min, max]: Range, count = 8): number[] {
  const step = tickStep(max - min, count);
  const first = Math.ceil(min / step - 1e-6);
  const last = Math.floor(max / step + 1e-6);
  const out: number[] = [];
  for (let i = first; i <= last && out.length <= 50; i += 1) {
    // Round away the binary noise of 0.1 * 3.
    out.push(i === 0 ? 0 : Number((i * step).toPrecision(12)));
  }
  return out;
}

export function formatTick(value: number): string {
  const size = Math.abs(value);
  if (size !== 0 && (size >= 1e5 || size < 1e-3)) {
    return value.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e');
  }
  return String(Number(value.toPrecision(10)));
}

function autoRange(values: number[]): Range {
  let min = Math.min(...values);
  let max = Math.max(...values);
  const flat = Math.max(Math.abs(min), Math.abs(max), 1) * 1e-9;
  const pad = max - min > flat ? (max - min) * 0.05 : Math.max(Math.abs(max) * 0.1, 1);
  min -= pad;
  max += pad;
  // Finish on round numbers.
  const step = tickStep(max - min, 10);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

export function buildPlot(source: string): PlotData {
  const spec = parsePlot(source);
  const sampled = spec.functions.map((fn) => ({ ...fn, samples: sample(fn.f, spec.x) }));
  const visible = spec.points.filter((p) => p.x >= spec.x[0] && p.x <= spec.x[1]);

  let y = spec.y;
  if (!y) {
    const values = sampled.flatMap((fn) => interestingRange(fn.f, fn.samples) ?? []);
    values.push(...visible.map((p) => p.y));
    if (!values.length) throw new Error('There is nothing to draw in this range');
    y = autoRange(values);
  }
  const [low, high] = y;
  // Under a pixel on screen.
  const tolerance = (high - low) / 500;
  const curves = sampled.map((fn) => ({
    label: fn.label,
    segments: segmentsOf(fn.f, fn.samples, tolerance).segments,
  }));
  const points = visible.filter((p) => p.y >= low && p.y <= high);
  const drawn = curves.some((c) => c.segments.some((s) => s.some((p) => p[1] >= low && p[1] <= high)));
  if (!drawn && !points.length) throw new Error('There is nothing to draw in this range');

  return {
    title: spec.title,
    x: spec.x,
    y,
    points,
    xLabel: spec.xLabel,
    yLabel: spec.yLabel,
    curves,
    xTicks: ticks(spec.x, 8),
    yTicks: ticks(y, 7),
  };
}
