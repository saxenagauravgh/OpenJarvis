/** Helpers for highlighting words while a reply is read aloud. */

export interface WordSpan {
  start: number;
  end: number;
}

export function wordSpans(text: string): WordSpan[] {
  return Array.from(text.matchAll(/\S+/g), (m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** Rough speaking time of a word: its length, plus a pause after punctuation. */
function weight(word: string): number {
  const pause = /[.!?।]$/.test(word) ? 6 : /[,;:]$/.test(word) ? 3 : 0;
  return word.length + 1 + pause;
}

/**
 * Start of the word probably being spoken after `fraction` of the audio. The
 * speech service gives no word timings, so this is an estimate.
 */
export function charIndexAtFraction(text: string, fraction: number): number {
  const spans = wordSpans(text);
  if (!spans.length) return 0;
  const weights = spans.map((s) => weight(text.slice(s.start, s.end)));
  const total = weights.reduce((a, b) => a + b, 0);
  let reached = Math.min(Math.max(fraction, 0), 1) * total;
  for (let i = 0; i < spans.length; i += 1) {
    reached -= weights[i];
    if (reached < 0) return spans[i].start;
  }
  return spans[spans.length - 1].start;
}

/** The sentence around `charIndex`, so only a readable amount is shown. */
export function sentenceAround(text: string, charIndex: number): WordSpan {
  let start = 0;
  for (const match of text.matchAll(/[.!?।]\s+/g)) {
    const next = match.index + match[0].length;
    if (next > charIndex) return { start, end: match.index + 1 };
    start = next;
  }
  return { start, end: text.length };
}
