import { useTtsStore } from '../../lib/tts';
import { sentenceAround, wordSpans } from '../../lib/caption';

/** The sentence being read aloud, with the current word highlighted. */
export function SpeechCaption() {
  const caption = useTtsStore((s) => s.caption);
  if (!caption) return null;

  const sentence = sentenceAround(caption.text, caption.charIndex);
  const shown = caption.text.slice(sentence.start, sentence.end);
  const current = caption.charIndex - sentence.start;

  return (
    <div className="speech-caption" aria-hidden="true">
      {wordSpans(shown).map((span) => {
        const state =
          span.end <= current ? 'spoken' : span.start <= current ? 'current' : 'next';
        return (
          <span key={span.start}>
            <span className={`speech-word speech-word--${state}`}>
              {shown.slice(span.start, span.end)}
            </span>{' '}
          </span>
        );
      })}
    </div>
  );
}
