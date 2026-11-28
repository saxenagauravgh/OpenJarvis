/**
 * A small parser for the functions of x that an answer asks to have plotted.
 * It builds closures from a fixed grammar; nothing is ever evaluated as code.
 *
 *   sum     = product (('+' | '-') product)*
 *   product = signed (('*' | '/') signed | power)*      (a bare power is "2x")
 *   signed  = ('+' | '-') signed | power
 *   power   = primary ('^' signed)?
 *   primary = number | 'x' | 'pi' | 'e' | name '(' sum ')' | '(' sum ')'
 *
 * Implicit multiplication binds like '*', so 1/2x is (1/2)x. `log` is base 10.
 */

export type MathFunction = (x: number) => number;

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Longest first, so "exp" is not read as e times x times p. */
const NAMES = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), 'x'].sort(
  (a, b) => b.length - a.length,
);

const MAX_LENGTH = 300;

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'symbol'; symbol: string };

function tokenize(source: string): Token[] {
  const text = source.replace(/−/g, '-').replace(/π/g, ' pi ').replace(/\*\*/g, '^');
  const tokens: Token[] = [];
  const number = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (/\s/.test(char)) {
      at += 1;
      continue;
    }
    number.lastIndex = at;
    const digits = number.exec(text);
    if (digits) {
      tokens.push({ kind: 'number', value: Number(digits[0]) });
      at = number.lastIndex;
    } else if ('+-*/^()'.includes(char)) {
      tokens.push({ kind: 'symbol', symbol: char });
      at += 1;
    } else {
      const name = NAMES.find((candidate) => text.startsWith(candidate, at));
      if (!name) throw new Error(`Unknown symbol "${char}"`);
      tokens.push({ kind: 'name', name });
      at += name.length;
    }
  }
  return tokens;
}

interface Node {
  run: MathFunction;
  /** The value does not depend on x. */
  constant: boolean;
}

const fixed = (value: number): Node => ({ run: () => value, constant: true });

const combine = (a: Node, b: Node, op: (u: number, v: number) => number): Node => ({
  run: (x) => op(a.run(x), b.run(x)),
  constant: a.constant && b.constant,
});

/**
 * a to the power b. A constant exponent with an odd denominator, as in x^(1/3),
 * has a real value for negative a, which Math.pow reports as NaN.
 */
function power(base: Node, exponent: Node): Node {
  if (exponent.constant) {
    const e = exponent.run(0);
    if (Number.isFinite(e) && !Number.isInteger(e)) {
      for (let q = 3; q <= 99; q += 2) {
        const p = Math.round(e * q);
        if (Math.abs(e * q - p) < 1e-12) {
          const sign = p % 2 === 0 ? 1 : -1;
          return {
            run: (x) => {
              const b = base.run(x);
              return b < 0 ? sign * Math.pow(-b, e) : Math.pow(b, e);
            },
            constant: base.constant,
          };
        }
      }
    }
  }
  return combine(base, exponent, Math.pow);
}

/** Compile an expression in x. Throws an Error with a readable message. */
export function compileExpression(source: string): MathFunction {
  const body = source.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=/, '');
  if (body.length > MAX_LENGTH) throw new Error('The expression is too long');
  const tokens = tokenize(body);
  let at = 0;

  const peek = () => tokens[at];
  const isSymbol = (symbol: string) => {
    const token = peek();
    return token?.kind === 'symbol' && token.symbol === symbol;
  };
  const take = (symbol: string) => {
    if (!isSymbol(symbol)) return false;
    at += 1;
    return true;
  };
  const expect = (symbol: string) => {
    if (!take(symbol)) throw new Error(`Expected "${symbol}"`);
  };

  const sum = (): Node => {
    let left = product();
    for (;;) {
      if (take('+')) left = combine(left, product(), (u, v) => u + v);
      else if (take('-')) left = combine(left, product(), (u, v) => u - v);
      else return left;
    }
  };

  const product = (): Node => {
    let left = signed();
    for (;;) {
      if (take('*')) left = combine(left, signed(), (u, v) => u * v);
      else if (take('/')) left = combine(left, signed(), (u, v) => u / v);
      // "2x", "3sin(x)", "(x+1)(x-1)". A number never follows implicitly.
      else if (peek()?.kind === 'name' || isSymbol('(')) {
        left = combine(left, raised(), (u, v) => u * v);
      } else return left;
    }
  };

  const signed = (): Node => {
    if (take('+')) return signed();
    if (take('-')) {
      const inner = signed();
      return { run: (x) => -inner.run(x), constant: inner.constant };
    }
    return raised();
  };

  const raised = (): Node => {
    const base = primary();
    return take('^') ? power(base, signed()) : base;
  };

  const primary = (): Node => {
    const token = tokens[at];
    if (!token) throw new Error('The expression is incomplete');
    at += 1;
    if (token.kind === 'number') return fixed(token.value);
    if (token.kind === 'name') {
      if (token.name === 'x') return { run: (x) => x, constant: false };
      if (token.name in CONSTANTS) return fixed(CONSTANTS[token.name]);
      const apply = FUNCTIONS[token.name];
      expect('(');
      const inner = sum();
      expect(')');
      return { run: (x) => apply(inner.run(x)), constant: inner.constant };
    }
    if (token.symbol === '(') {
      const inner = sum();
      expect(')');
      return inner;
    }
    throw new Error(`Unexpected "${token.symbol}"`);
  };

  const result = sum();
  if (at < tokens.length) throw new Error('Unexpected text after the expression');
  return result.run;
}
