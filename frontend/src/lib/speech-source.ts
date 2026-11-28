/** Hand out a reply piece by piece for speaking, even while it is still arriving. */

import { toSpeakableText } from './message-text';

export interface SpeechSource {
  /** The next piece to speak; null when there is nothing more. */
  next: () => Promise<string | null>;
  /** Stop waiting for more text. */
  close: () => void;
}

export interface LiveSpeechSource extends SpeechSource {
  /** The whole reply received so far. */
  update: (content: string) => void;
  /** The reply is complete. */
  end: (content?: string) => void;
}

export function listSource(pieces: string[]): SpeechSource {
  let index = 0;
  return {
    next: async () => (index < pieces.length ? pieces[index++] : null),
    close: () => {
      index = pieces.length;
    },
  };
}

/** A short first piece starts speech sooner; longer ones need fewer requests. */
const FIRST_MIN = 40;
const LATER_MIN = 280;
const LATER_MAX = 1200;

/** Sentence ends in `text` after `from` that are not inside maths or code. */
function sentenceEnds(text: string, from: number): number[] {
  const ends: number[] = [];
  for (const match of text.slice(from).matchAll(/[.!?।:](?=\s)|\n/g)) {
    const end = from + match.index + match[0].length;
    const before = text.slice(from, end);
    const dollars = (before.replace(/\\\$/g, '').match(/\$/g) ?? []).length;
    const fences = (before.match(/```/g) ?? []).length;
    if (dollars % 2 === 0 && fences % 2 === 0) ends.push(end);
  }
  return ends;
}

export function liveSource(): LiveSpeechSource {
  let raw = '';
  let used = 0;
  let first = true;
  let ended = false;
  let closed = false;
  let wake: (() => void) | null = null;
  const signal = () => {
    wake?.();
    wake = null;
  };

  /** Where the next piece stops, or null while there is not yet enough text. */
  const cut = (): number | null => {
    const ends = sentenceEnds(raw, used);
    if (first) {
      const end = ends.find((e) => e - used >= FIRST_MIN);
      if (end !== undefined) return end;
    } else {
      const fitting = ends.filter((e) => e - used <= LATER_MAX);
      const end = fitting.length ? fitting[fitting.length - 1] : ends[0];
      if (end !== undefined && (end - used >= LATER_MIN || ended)) {
        if (!ended || raw.length - used > LATER_MAX) return end;
      }
    }
    return ended ? raw.length : null;
  };

  return {
    next: async () => {
      while (!closed) {
        const end = cut();
        if (end !== null && end > used) {
          const spoken = toSpeakableText(raw.slice(used, end));
          used = end;
          if (!spoken) continue;
          first = false;
          return spoken;
        }
        if (ended) return null;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      return null;
    },
    update: (content) => {
      if (ended) return;
      raw = content;
      signal();
    },
    end: (content) => {
      if (content !== undefined) raw = content;
      ended = true;
      signal();
    },
    close: () => {
      closed = true;
      signal();
    },
  };
}
