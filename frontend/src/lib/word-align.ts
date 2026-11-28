/** Find, in the displayed answer, the word that is currently being spoken. */

export const normalizeWord = (word: string) =>
  word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Index in `shown` of the spoken word `spoken[at]`, or -1. The two differ where
 * maths is read as words, so candidates are scored by how many of the preceding
 * words also match, preferring one at or after `from`. A word with no match
 * falls back to the nearest earlier spoken word that has one.
 */
export function locateWord(
  shown: string[],
  spoken: string[],
  at: number,
  from: number,
): number {
  for (let k = Math.min(at, spoken.length - 1); k >= 0 && k > at - 12; k -= 1) {
    if (!spoken[k]) continue;
    let best = -1;
    let bestScore = 0;
    for (let j = 0; j < shown.length; j += 1) {
      if (shown[j] !== spoken[k]) continue;
      let context = 0;
      for (let back = 1; back <= 4; back += 1) {
        if (j - back >= 0 && shown[j - back] === spoken[k - back]) context += 1;
      }
      const ahead = j >= from ? 1 : 0;
      const nearness = 1 / (1 + Math.abs(j - from));
      const score = context * 10 + ahead * 2 + nearness;
      if (score > bestScore) {
        best = j;
        bestScore = score;
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}
