import { describe, expect, it } from 'vitest';
import { isFenceClosed, normalizeMathDelimiters, toSpeakableText } from './message-text';

describe('toSpeakableText', () => {
  it('removes emphasis markers so they are not read aloud', () => {
    expect(toSpeakableText('This is **very important** and *useful*.')).toBe(
      'This is very important and useful.',
    );
  });

  it('drops headings, bullets and numbering and pauses between lines', () => {
    const out = toSpeakableText('## Steps\n- first\n- second\n1. third');
    expect(out).toBe('Steps. first. second. third.');
  });

  it('keeps link text, drops URLs and inline code ticks', () => {
    expect(toSpeakableText('See [the docs](https://x.dev/a) and run `ls` now. https://x.dev')).toBe(
      'See the docs and run ls now.',
    );
  });

  it('replaces code blocks and removes emoji and think tags', () => {
    const out = toSpeakableText('<think>hmm</think>Done 😀\n```py\nprint(1)\n```');
    expect(out).toContain('code block omitted');
    expect(out).not.toMatch(/print|😀|think|hmm/);
  });

  it('keeps snake_case words intact', () => {
    expect(toSpeakableText('use file_read now')).toBe('use file_read now');
  });
});

describe('toSpeakableText maths', () => {
  it('reads inline LaTeX as words', () => {
    expect(toSpeakableText('Solve $3x^2 - 12 = 0$.')).toBe('Solve 3x squared minus 12 equals 0.');
  });

  it('reads fractions, roots and degrees', () => {
    const spoken = toSpeakableText('$$h = \\frac{u^2}{2g}$$ and $\\sqrt{x}$ at $30^\\circ$');
    expect(spoken).toContain('h equals u squared over 2g');
    expect(spoken).toContain('square root of x');
    expect(spoken).toContain('30 degrees');
  });

  it('leaves text without maths unchanged', () => {
    expect(toSpeakableText('The pH is 2.')).toBe('The pH is 2.');
  });
});

describe('normalizeMathDelimiters', () => {
  it('converts \\( \\) and \\[ \\] to dollar delimiters', async () => {
    const { normalizeMathDelimiters } = await import('./message-text');
    expect(normalizeMathDelimiters('p = \\(\\frac{5}{8}\\)')).toBe('p = $\\frac{5}{8}$');
    expect(normalizeMathDelimiters('\\[ x^2 \\]')).toBe('$$ x^2 $$');
    expect(normalizeMathDelimiters('no maths here')).toBe('no maths here');
  });
});

describe('toSpeakableText pictures', () => {
  it('announces diagrams and graphs instead of reading them', () => {
    const out = toSpeakableText(
      'Look.\n\n```svg\n<svg><text>secret</text></svg>\n```\n\n~~~plot\n{"x":[0,1]}\n~~~\n\nDone.',
    );
    expect(out).toBe('Look. A diagram is shown on screen. A graph is shown on screen. Done.');
  });

  it('keeps an unfinished drawing quiet', () => {
    expect(toSpeakableText('Here:\n```svg\n<svg><rect')).toBe(
      'Here: A diagram is shown on screen.',
    );
  });

  it('does not mistake another block\'s closing fence for an opening one', () => {
    const out = toSpeakableText('```py\nx = 1\n```\nThen\n```plot\n{}\n```\nEnd.');
    expect(out).toContain('code block omitted');
    expect(out).toContain('Then. A graph is shown on screen. End.');
  });
});

describe('toSpeakableText chemistry', () => {
  it('reads reactions, charges and equilibria', () => {
    expect(toSpeakableText('$\\ce{2H2 + O2 -> 2H2O}$')).toBe('2H2 plus O2 gives 2H2O');
    expect(toSpeakableText('$\\ce{N2 + 3H2 <=> 2NH3}$')).toBe(
      'N2 plus 3H2 is in equilibrium with 2NH3',
    );
    expect(toSpeakableText('$\\ce{Na+ + Cl- ->[\\Delta] NaCl}$')).toBe(
      'Na plus plus Cl minus gives NaCl',
    );
    expect(toSpeakableText('$\\ce{SO4^{2-}}$')).toBe('SO4 2 minus');
  });

  it('reads units', () => {
    expect(toSpeakableText('$\\pu{1.2e-3 mol L-1}$')).toBe(
      '1.2 times 10 to the power minus 3 mol L to the power minus 1',
    );
  });
});

describe('fenced blocks', () => {
  it('knows when a block has closed', () => {
    expect(isFenceClosed('```svg\n<svg/>\n```')).toBe(true);
    expect(isFenceClosed('````plot\n{}\n````')).toBe(true);
    expect(isFenceClosed('```svg\n<svg/>')).toBe(false);
    expect(isFenceClosed('```svg\n<svg/>\n``')).toBe(false);
    expect(isFenceClosed('```svg')).toBe(false);
  });

  it('does not rewrite maths delimiters inside drawings and graphs', () => {
    const block = '```plot\n{"title":"\\\\(x\\\\)"}\n```';
    expect(normalizeMathDelimiters(`\\(a\\)\n${block}\n\\(b\\)`)).toBe(`$a$\n${block}\n$b$`);
  });
});
