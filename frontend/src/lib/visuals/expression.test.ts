import { describe, expect, it } from 'vitest';
import { compileExpression } from './expression';

const at = (expression: string, x = 0) => compileExpression(expression)(x);

describe('compileExpression', () => {
  it('follows operator precedence and parentheses', () => {
    expect(at('1 + 2 * 3')).toBe(7);
    expect(at('(1 + 2) * 3')).toBe(9);
    expect(at('8 / 4 / 2')).toBe(1);
    expect(at('2 - 3 - 4')).toBe(-5);
    expect(at('2^3^2')).toBe(512);
    expect(at('x^2 - 4', 3)).toBe(5);
  });

  it('applies unary minus after powers', () => {
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('(-x)^2', 3)).toBe(9);
    expect(at('2^-x', 1)).toBe(0.5);
    expect(at('3 - -x', 2)).toBe(5);
  });

  it('multiplies implicitly', () => {
    expect(at('2x', 4)).toBe(8);
    expect(at('2x^2', 3)).toBe(18);
    expect(at('3sin(x)', Math.PI / 2)).toBeCloseTo(3);
    expect(at('(x+1)(x-1)', 3)).toBe(8);
    expect(at('x(x+1)', 2)).toBe(6);
    expect(at('2pix', 1)).toBeCloseTo(2 * Math.PI);
    expect(at('2πx', 1)).toBeCloseTo(2 * Math.PI);
    expect(at('xsin(x)', 2)).toBeCloseTo(2 * Math.sin(2));
    expect(at('1/2x', 4)).toBe(2);
  });

  it('knows the constants and functions', () => {
    expect(at('pi')).toBe(Math.PI);
    expect(at('e^x', 1)).toBeCloseTo(Math.E);
    expect(at('2e', 0)).toBeCloseTo(2 * Math.E);
    expect(at('exp(x)', 2)).toBeCloseTo(Math.exp(2));
    expect(at('ln(e)')).toBeCloseTo(1);
    expect(at('log(1000)')).toBeCloseTo(3);
    expect(at('sqrt(abs(x))', -9)).toBe(3);
    expect(at('floor(x) + ceil(x)', 1.5)).toBe(3);
    for (const name of ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'] as const) {
      expect(at(`${name}(x)`, 0.3)).toBeCloseTo(Math[name](0.3));
    }
  });

  it('reads scientific notation and a leading "y ="', () => {
    expect(at('1.5e-3x', 2)).toBeCloseTo(0.003);
    expect(at('y = x + 1', 1)).toBe(2);
    expect(at('f(x) = x**2', 3)).toBe(9);
  });

  it('takes real odd roots of negative numbers', () => {
    expect(at('x^(1/3)', -8)).toBeCloseTo(-2);
    expect(at('x^(2/3)', -8)).toBeCloseTo(4);
    expect(at('x^0.5', -4)).toBeNaN();
  });

  it('is undefined outside the domain', () => {
    expect(at('sqrt(x)', -1)).toBeNaN();
    expect(at('1/x', 0)).toBe(Infinity);
  });

  it.each([
    '', 'x +', '(x', 'x)', 'sin x', '2 3', 'x2', 'y + 1', 'foo(x)', 'constructor',
    'alert(1)', 'x; x', 'window.location', 'x => x', '`x`', 'x'.repeat(301),
  ])('rejects %j', (expression) => {
    expect(() => compileExpression(expression)).toThrow();
  });
});
