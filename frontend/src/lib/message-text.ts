/** Text helpers shared between the message renderer and voice output. */

/**
 * A fenced code block, to its closing fence or to the end of a text that is
 * still arriving. Captures the whole block, the fence and the language.
 */
const FENCE =
  /^([ \t>]*(?:(?:[-*+]|\d+[.)])[ \t]+)?(`{3,}|~{3,})[ \t]*([\w-]*)[^`\n]*(?:\n[\s\S]*?)??(?:\n[ \t>]*\2[`~]*[ \t\r]*(?=\n|$)|(?![\s\S])))/gm;

/** Whether a fenced code block, as written in the Markdown, has its closing fence. */
export function isFenceClosed(block: string): boolean {
  const lines = block.trimEnd().split('\n');
  const fence = /(`{3,}|~{3,})/.exec(lines[0])?.[1];
  if (!fence) return true;
  const last = lines[lines.length - 1].replace(/^[ \t>]*/, '');
  return lines.length > 1 && last.startsWith(fence) && /^(?:`+|~+)$/.test(last);
}

/**
 * Rewrite LaTeX \(...\) and \[...\] delimiters (common in local-model output)
 * as $...$ and $$...$$, which the markdown math renderer understands.
 */
export function normalizeMathDelimiters(text: string): string {
  // Drawings and graph descriptions must reach their renderers untouched.
  const blocks: string[] = [];
  return text
    .replace(FENCE, (block: string, _all: string, _fence: string, lang: string) =>
      /^(?:svg|plot)$/i.test(lang) ? `\u0000${blocks.push(block) - 1}\u0000` : block,
    )
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, expr: string) => `$$${expr}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, expr: string) => `$${expr}$`)
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)]);
}

/** Remove <think> reasoning blocks so they are neither shown nor spoken. */
export function stripThinkTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/i, '');
  return cleaned.trim();
}

const MATH_WORDS: Record<string, string> = {
  times: 'times',
  cdot: 'times',
  div: 'divided by',
  pm: 'plus or minus',
  approx: 'approximately',
  le: 'less than or equal to',
  leq: 'less than or equal to',
  ge: 'greater than or equal to',
  geq: 'greater than or equal to',
  neq: 'not equal to',
  ne: 'not equal to',
  to: 'to',
  rightarrow: 'gives',
  longrightarrow: 'gives',
  Rightarrow: 'implies',
  implies: 'implies',
  infty: 'infinity',
  circ: 'degrees',
  degree: 'degrees',
  propto: 'is proportional to',
  therefore: 'therefore',
  quad: ' ',
  qquad: ' ',
  left: '',
  right: '',
  boxed: '',
  displaystyle: '',
};

/** Read the inside of \ce{...}: reactions, charges and states. */
function chemistryToSpeech(formula: string): string {
  return formula
    .replace(/<=>>|<<=>|<=>/g, ' is in equilibrium with ')
    .replace(/<->/g, ' resonates with ')
    .replace(/->(?:\s*\[[^\]]*\])*/g, ' gives ')
    .replace(/\^\s*\{?\s*(\d*)\s*([+-])\s*\}?/g, (_m, n: string, sign: string) =>
      ` ${n} ${sign === '+' ? 'plus' : 'minus'} `,
    )
    .replace(/(?<=[\p{L}\p{N})\]}])\+(?!\p{L})/gu, ' plus ')
    .replace(/(?<=[\p{L}\p{N})\]}])-(?=\s|$|\()/gu, ' minus ')
    .replace(/\+/g, ' plus ')
    .replace(/=/g, ' double bond ')
    .replace(/[_^{}$-]/g, ' ');
}

/** Read the inside of \pu{...}: a quantity with its units. */
function unitsToSpeech(quantity: string): string {
  return quantity
    .replace(
      /(\d)[eE]\+?(-?)(\d+)/g,
      (_m, digit: string, sign: string, n: string) =>
        `${digit} times 10 to the power ${sign ? 'minus ' : ''}${n}`,
    )
    .replace(/(?<=[\p{L})}])\^?\{?-(\d+)\}?/gu, ' to the power minus $1 ')
    .replace(/\//g, ' per ')
    .replace(/[_^{}$*.](?!\d)/g, ' ');
}

/** Replace each \ce{...} and \pu{...}, whose braces may nest, with words. */
function speakChemistry(expr: string): string {
  let out = expr;
  for (let found = /\\(ce|pu)\s*\{/.exec(out); found; found = /\\(ce|pu)\s*\{/.exec(out)) {
    const start = found.index + found[0].length;
    let depth = 1;
    let end = start;
    for (; end < out.length; end += 1) {
      if (out[end] === '{') depth += 1;
      else if (out[end] === '}') depth -= 1;
      if (!depth) break;
    }
    const read = found[1] === 'ce' ? chemistryToSpeech : unitsToSpeech;
    out = `${out.slice(0, found.index)} ${read(out.slice(start, end))} ${out.slice(end + 1)}`;
  }
  return out;
}

/** Read one LaTeX math expression the way a teacher would say it. */
export function mathToSpeech(expr: string): string {
  let m = speakChemistry(expr);
  m = m.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, ' $1 ');
  // \frac{a}{b} -> "a over b", innermost first so nesting resolves.
  for (let i = 0; i < 5; i += 1) {
    const next = m
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 ')
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, ' $1 root of $2 ')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, ' square root of $1 ');
    if (next === m) break;
    m = next;
  }
  m = m.replace(/\^\s*\{?\s*\\circ\s*\}?/g, ' degrees ');
  m = m.replace(/\^\s*\{?\s*2\s*\}?(?![0-9])/g, ' squared ');
  m = m.replace(/\^\s*\{?\s*3\s*\}?(?![0-9])/g, ' cubed ');
  m = m.replace(/\^\s*\{([^{}]*)\}/g, ' to the power $1 ');
  m = m.replace(/\^\s*(-?[A-Za-z0-9]+)/g, ' to the power $1 ');
  m = m.replace(/_\s*\{([^{}]*)\}/g, '$1');
  m = m.replace(/_\s*([A-Za-z0-9])/g, '$1');
  m = m.replace(/\\([A-Za-z]+)/g, (_match, name: string) =>
    name in MATH_WORDS ? ` ${MATH_WORDS[name]} ` : ` ${name} `,
  );
  m = m.replace(/\\[,;:! ]/g, ' ');
  m = m.replace(/=/g, ' equals ');
  m = m.replace(/\+/g, ' plus ');
  m = m.replace(/(^|[\s(])-(?=\s*[\w(])/g, '$1 minus ');
  m = m.replace(/\s-\s/g, ' minus ');
  m = m.replace(/</g, ' less than ').replace(/>/g, ' greater than ');
  m = m.replace(/[{}\\]/g, ' ');
  return m.replace(/\s{2,}/g, ' ').trim();
}

/** Replace $...$, $$...$$, \(...\) and \[...\] spans with spoken maths. */
function speakMathSpans(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, e: string) => ` ${mathToSpeech(e)} `)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, e: string) => ` ${mathToSpeech(e)} `)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, e: string) => mathToSpeech(e))
    .replace(/\$([^$\n]+?)\$/g, (_m, e: string) => mathToSpeech(e));
}

/**
 * Turn a (usually markdown) answer into text that sounds right when read aloud: no emphasis
 * markers, heading hashes, list bullets, link syntax, bare URLs or emoji, code blocks replaced
 * by a short note, LaTeX maths read out in words, and a pause after lines that lack final
 * punctuation.
 */
export function toSpeakableText(text: string): string {
  let t = stripThinkTags(text);
  t = t.replace(FENCE, (block: string, _all: string, _fence: string, lang: string) => {
    if (/^svg$/i.test(lang)) return '\nA diagram is shown on screen.\n';
    if (/^plot$/i.test(lang)) return '\nA graph is shown on screen.\n';
    return block;
  });
  t = t.replace(/```[\s\S]*?```/g, ' (code block omitted). ');
  t = speakMathSpans(t);
  t = t.replace(/`([^`]*)`/g, '$1');
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  t = t.replace(/https?:\/\/\S+/g, '');
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  t = t.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '');
  t = t.replace(/\*{1,3}|~~/g, '');
  t = t.replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '');
  t = t.replace(/[\p{Extended_Pictographic}️‍]/gu, '');
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Only separate multiple lines; a single line is spoken as written.
  const sentences =
    lines.length > 1 ? lines.map((l) => (/[.!?:;]$/.test(l) ? l : `${l}.`)) : lines;
  return sentences.join(' ').replace(/\s{2,}/g, ' ').trim();
}
