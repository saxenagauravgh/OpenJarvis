import { describe, expect, it } from 'vitest';
import { locateWord, normalizeWord } from './word-align';

const words = (text: string) => text.split(/\s+/).map(normalizeWord);
const shown = words('The force is large. The mass is small, so the force wins.');

describe('locateWord', () => {
  it('uses the surrounding words to choose between repeats', () => {
    const spoken = words('The force is large. The mass is small, so the force wins.');
    expect(locateWord(shown, spoken, 1, 0)).toBe(1);
    expect(locateWord(shown, spoken, 10, 8)).toBe(10);
  });

  it('works for a later piece of the reply', () => {
    expect(locateWord(shown, words('so the force wins.'), 2, 7)).toBe(10);
  });

  it('stays on the last matching word while maths is read out', () => {
    const spoken = words('The mass is small, x squared equals');
    expect(locateWord(shown, spoken, 6, 4)).toBe(7);
  });

  it('reports no match', () => {
    expect(locateWord(shown, words('zebra'), 0, 0)).toBe(-1);
  });
});

describe('Devanagari words', () => {
  it('keeps vowel signs so Hindi words still match', () => {
    const hindi = words('यह जड़त्व का नियम है');
    expect(hindi[4]).toBe('है');
    expect(locateWord(hindi, hindi, 3, 0)).toBe(3);
  });
});
