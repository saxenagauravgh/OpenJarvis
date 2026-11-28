import { describe, expect, it } from 'vitest';
import { checkSvg, MAX_SVG_BYTES, svgDataUrl } from './svg';

const NS = 'http://www.w3.org/2000/svg';
const valid = (code: string) => {
  const result = checkSvg(code);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe('checkSvg', () => {
  it('accepts a drawing and reads its title', () => {
    const result = valid(
      `<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="${NS}" viewBox="0 0 10 10">` +
        '<title>Forces &amp; motion</title><g><circle r="2" /></g><text>a &#945;</text></svg>',
    );
    expect(result.title).toBe('Forces & motion');
    expect(result.sized).toBe(false);
  });

  it('adds what an image needs and models leave out', () => {
    const result = valid('<svg width="200" height="100"><use xlink:href="#a"/></svg>');
    expect(result.svg).toContain(`<svg xmlns="${NS}"`);
    expect(result.svg).toContain('xmlns:xlink=');
    expect(result.svg).toContain('viewBox="0 0 200 100"');
    expect(result.sized).toBe(true);
    expect(valid(result.svg).svg).toBe(result.svg);
  });

  it('treats a percentage width as unsized', () => {
    expect(valid('<svg width="100%" viewBox="0 0 4 3"></svg>').sized).toBe(false);
  });

  it.each([
    ['plain text', 'hello'],
    ['another root', '<div><svg></svg></div>'],
    ['two drawings', '<svg></svg><svg></svg>'],
    ['text after', '<svg></svg> done'],
    ['unclosed', '<svg><g></svg>'],
    ['cut off', '<svg><rect width="1"'],
    ['unclosed comment', '<svg><!-- x </svg>'],
    ['unquoted attribute', '<svg width=5></svg>'],
    ['repeated attribute', '<svg><rect x="1" x="2"/></svg>'],
    ['HTML entity', '<svg><text>a&nbsp;b</text></svg>'],
    ['bare ampersand', '<svg><text>R & D</text></svg>'],
    ['stray <', '<svg><text>1 < 2</text></svg>'],
    ['entity declarations', '<!DOCTYPE svg [<!ENTITY a "b">]><svg></svg>'],
    ['control character', '<svg>\u0001</svg>'],
    ['lone surrogate', '<svg><text>\ud800</text></svg>'],
  ])('rejects %s', (_name, code) => {
    expect(checkSvg(code).ok).toBe(false);
  });

  it('rejects drawings over the size limit, counted in bytes', () => {
    const wrap = (body: string) => `<svg><text>${body}</text></svg>`;
    expect(checkSvg(wrap('a'.repeat(MAX_SVG_BYTES)))).toEqual({
      ok: false,
      reason: 'it is too large',
    });
    expect(checkSvg(wrap('π'.repeat(MAX_SVG_BYTES / 2))).ok).toBe(false);
    expect(checkSvg(wrap('😀 a')).ok).toBe(true);
  });

  it('encodes the drawing into a data URL', () => {
    const url = svgDataUrl('<svg><text fill="#f00">π</text></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(url).not.toMatch(/[<>"#]/);
  });
});
