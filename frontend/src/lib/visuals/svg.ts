/**
 * Check an SVG drawing from an answer before showing it as an image. It is only
 * ever displayed through <img>, where scripts do not run and nothing external
 * loads, so this is about showing a working picture rather than sanitising it.
 */

export const MAX_SVG_BYTES = 100 * 1024;

export type SvgCheck =
  | {
      ok: true;
      /** The drawing, with any missing namespace or viewBox filled in. */
      svg: string;
      title?: string;
      /** It states its own width in absolute units. */
      sized: boolean;
    }
  | { ok: false; reason: string };

const NAME = String.raw`[\p{L}_:][\p{L}\p{M}\p{N}_.:\-]*`;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const BAD_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
const BAD_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|\p{Surrogate}/u;

function decode(text: string): string {
  return text.replace(/&(#x?)?([0-9a-zA-Z]+);/g, (match, numeric: string, body: string) => {
    if (!numeric) return ENTITIES[body] ?? match;
    const code = parseInt(body, numeric === '#x' ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

interface Parsed {
  attributes: Map<string, string>;
  /** Where attributes can be added to the root tag. */
  insertAt: number;
  title?: string;
}

/** Parse `source` as XML with a single <svg> root. Throws the reason it is not. */
function parse(source: string): Parsed {
  const open = new RegExp(`<(${NAME})`, 'uy');
  const attribute = new RegExp(`\\s+(${NAME})\\s*=\\s*(?:"([^<"]*)"|'([^<']*)')`, 'uy');
  const tagEnd = /\s*(\/?)>/y;
  const close = new RegExp(`</(${NAME})\\s*>`, 'uy');
  const stack: string[] = [];
  let root: Parsed | undefined;
  let title: string | undefined;
  /** Depth of the first <title> while it is being read. */
  let titleDepth = 0;
  let titleText = '';
  let at = 0;

  const match = (pattern: RegExp) => {
    pattern.lastIndex = at;
    const found = pattern.exec(source);
    if (found) at = pattern.lastIndex;
    return found;
  };
  const skipPast = (end: string) => {
    const found = source.indexOf(end, at);
    if (found < 0) throw new Error('it is incomplete');
    const body = source.slice(at, found);
    at = found + end.length;
    return body;
  };

  while (at < source.length) {
    if (source.startsWith('<!--', at)) {
      at += 4;
      skipPast('-->');
    } else if (source.startsWith('<![CDATA[', at)) {
      if (!stack.length) throw new Error('it has text outside <svg>');
      at += 9;
      const body = skipPast(']]>');
      if (titleDepth) titleText += body;
    } else if (source.startsWith('<?', at)) {
      at += 2;
      skipPast('?>');
    } else if (source.startsWith('<!', at)) {
      // A plain doctype is allowed; one declaring entities is not.
      if (root || !match(/<!DOCTYPE\s+svg[^<>[\]]*>/iy)) {
        throw new Error('it has an unsupported declaration');
      }
    } else if (source.startsWith('</', at)) {
      const found = match(close);
      if (!found || stack.pop() !== found[1]) throw new Error('its tags do not match');
      if (titleDepth && stack.length < titleDepth) {
        titleDepth = 0;
        title = decode(titleText).replace(/\s+/g, ' ').trim() || undefined;
      }
    } else if (source[at] === '<') {
      const found = match(open);
      if (!found) throw new Error('it has a stray "<"');
      const tag = found[1];
      if (!stack.length) {
        if (root) throw new Error('it holds more than one drawing');
        if (tag !== 'svg') throw new Error('it does not start with <svg>');
      }
      const attributes = new Map<string, string>();
      const insertAt = at;
      for (let next = match(attribute); next; next = match(attribute)) {
        const value = next[2] ?? next[3];
        if (attributes.has(next[1])) throw new Error(`"${next[1]}" is repeated`);
        if (BAD_AMPERSAND.test(value)) throw new Error('it has an unknown "&" entity');
        attributes.set(next[1], value);
      }
      const end = match(tagEnd);
      if (!end) throw new Error(`the <${tag}> tag is malformed`);
      if (!root) root = { attributes, insertAt };
      if (!end[1]) {
        stack.push(tag);
        if (tag === 'title' && title === undefined && !titleDepth) {
          titleDepth = stack.length;
          titleText = '';
        }
      }
    } else {
      const next = source.indexOf('<', at);
      const body = source.slice(at, next < 0 ? source.length : next);
      if (!stack.length && body.trim()) throw new Error('it has text outside <svg>');
      if (BAD_AMPERSAND.test(body)) throw new Error('it has an unknown "&" entity');
      if (titleDepth) titleText += body;
      at += body.length;
    }
  }
  if (!root) throw new Error('there is no <svg> element');
  if (stack.length) throw new Error('it is incomplete');
  return { ...root, title };
}

/** A length in pixels, or null for percentages and other units. */
function pixels(value: string | undefined): number | null {
  const found = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:px)?\s*$/.exec(value ?? '');
  return found && Number(found[1]) > 0 ? Number(found[1]) : null;
}

export function checkSvg(code: string): SvgCheck {
  const source = code.replace(/^﻿/, '').trim();
  if (
    source.length > MAX_SVG_BYTES ||
    new TextEncoder().encode(source).length > MAX_SVG_BYTES
  ) {
    return { ok: false, reason: 'it is too large' };
  }
  if (BAD_CHARACTER.test(source)) return { ok: false, reason: 'it has invalid characters' };
  let parsed: Parsed;
  try {
    parsed = parse(source);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  const { attributes, insertAt, title } = parsed;
  const width = pixels(attributes.get('width'));
  const height = pixels(attributes.get('height'));
  let added = '';
  // An image without the namespace does not render at all.
  if (!attributes.has('xmlns')) added += ' xmlns="http://www.w3.org/2000/svg"';
  if (source.includes('xlink:') && !source.includes('xmlns:xlink')) {
    added += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  }
  // Without a viewBox a shrunken image is cropped instead of scaled.
  if (!attributes.has('viewBox') && width && height) added += ` viewBox="0 0 ${width} ${height}"`;
  return {
    ok: true,
    svg: source.slice(0, insertAt) + added + source.slice(insertAt),
    title,
    sized: width !== null,
  };
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
