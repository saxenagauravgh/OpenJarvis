import { useEffect, useRef } from 'react';
import { useTtsStore } from '../../lib/tts';
import { wordSpans } from '../../lib/caption';
import { locateWord, normalizeWord } from '../../lib/word-align';

const WORD = 'speech-word';
const SENTENCE = 'speech-sentence';

interface ShownWord {
  norm: string;
  node: Text;
  start: number;
  end: number;
}

/** The visible words of a rendered answer, skipping typeset maths and code. */
function shownWords(root: Element): ShownWord[] {
  const words: ShownWord[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('.katex, pre, button')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (const span of wordSpans(text)) {
      const norm = normalizeWord(text.slice(span.start, span.end));
      if (norm) words.push({ norm, node: node as Text, ...span });
    }
  }
  return words;
}

function range(from: ShownWord, to: ShownWord): Range {
  const result = document.createRange();
  result.setStart(from.node, from.start);
  result.setEnd(to.node, to.end);
  return result;
}

function clearHighlights(): void {
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  CSS.highlights.delete(WORD);
  CSS.highlights.delete(SENTENCE);
}

/**
 * Highlights, inside the chat answer itself, the sentence and word being read
 * aloud. It only paints ranges, so the rendered answer is never changed.
 */
export function SpeechHighlighter() {
  const caption = useTtsStore((s) => s.caption);
  const speakingId = useTtsStore((s) => s.speakingId);
  const position = useRef({ id: '', index: 0 });

  useEffect(() => {
    if (!caption || !speakingId || typeof CSS === 'undefined' || !CSS.highlights) {
      clearHighlights();
      return;
    }
    const root = document.querySelector(`[data-message-id="${CSS.escape(speakingId)}"]`);
    if (!root) {
      clearHighlights();
      return;
    }
    if (position.current.id !== speakingId) position.current = { id: speakingId, index: 0 };

    const shown = shownWords(root);
    const spans = wordSpans(caption.text);
    const spoken = spans.map((s) => normalizeWord(caption.text.slice(s.start, s.end)));
    const at = spans.reduce((found, s, i) => (s.start <= caption.charIndex ? i : found), 0);
    const index = locateWord(
      shown.map((w) => w.norm),
      spoken,
      at,
      position.current.index,
    );
    if (index < 0) return;
    position.current.index = index;

    // The sentence around the word, within the same block of text.
    const ends = (w: ShownWord) => /[.!?।]/.test(w.node.data.slice(w.start, w.end).slice(-1));
    const block = (w: ShownWord) => w.node.parentElement?.closest('p, li, h1, h2, h3, h4, td');
    const home = block(shown[index]);
    let first = index;
    while (first > 0 && !ends(shown[first - 1]) && block(shown[first - 1]) === home) first -= 1;
    let last = index;
    while (last < shown.length - 1 && !ends(shown[last]) && block(shown[last + 1]) === home) {
      last += 1;
    }

    const sentence = new Highlight(range(shown[first], shown[last]));
    const word = new Highlight(range(shown[index], shown[index]));
    word.priority = 1;
    CSS.highlights.set(SENTENCE, sentence);
    CSS.highlights.set(WORD, word);
    shown[index].node.parentElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [caption, speakingId]);

  useEffect(() => clearHighlights, []);
  return null;
}
