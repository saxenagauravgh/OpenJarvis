import { describe, expect, it } from 'vitest';
import { charIndexAtFraction, sentenceAround, wordSpans } from './caption';

const text = 'Force equals mass times acceleration. Now double the mass, what happens?';

describe('speech captions', () => {
  it('moves forward through the words as the audio plays', () => {
    const seen = [0, 0.25, 0.5, 0.75, 1].map((f) => charIndexAtFraction(text, f));
    expect(seen[0]).toBe(0);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    const words = wordSpans(text);
    expect(seen[4]).toBe(words[words.length - 1].start);
  });

  it('shows the sentence that holds the current word', () => {
    const first = sentenceAround(text, 6);
    expect(text.slice(first.start, first.end)).toBe('Force equals mass times acceleration.');
    const second = sentenceAround(text, text.indexOf('double'));
    expect(text.slice(second.start, second.end)).toBe('Now double the mass, what happens?');
  });

  it('copes with empty text', () => {
    expect(charIndexAtFraction('', 0.5)).toBe(0);
  });
});
