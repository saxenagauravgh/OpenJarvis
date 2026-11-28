import { create } from 'zustand';
import { synthesizeSpeech, fetchTtsHealth } from './api';
import { toSpeakableText } from './message-text';
import { charIndexAtFraction } from './caption';

export type TtsState = 'idle' | 'loading' | 'speaking';

/**
 * Voice output is a single shared resource: one utterance at a time, for the
 * whole app. The state lives in one store rather than per component, because a
 * per-component hook would give every message its own audio element -- two
 * replies would then talk over each other, and autoplay would make that the
 * normal case rather than the exception.
 */
interface TtsStore {
  state: TtsState;
  /** id of the message currently loading or speaking, if any. */
  speakingId: string | null;
  error: string | null;
  /** Message whose read-aloud attempt failed, if any. */
  errorId: string | null;
  /** null until the health probe has answered. */
  available: boolean | null;
  /** Last message spoken by autoplay, so a re-render never repeats it. */
  autoSpokenId: string | null;
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  ensureHealth: () => Promise<void>;
  markAutoSpoken: (id: string) => void;
  /** Text being read aloud and the position of the current word in it. */
  caption: { text: string; charIndex: number } | null;
}

// Playback handles are not render state -- keeping them out of the store avoids
// re-rendering every subscriber when an audio element is swapped.
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let controller: AbortController | null = null;
let token = 0;
let healthProbe: Promise<void> | null = null;
let captionFrame = 0;

function stopCaptions(): void {
  if (captionFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(captionFrame);
  }
  captionFrame = 0;
  useTtsStore.setState({ caption: null });
}

function showCaption(text: string, charIndex: number): void {
  const now = useTtsStore.getState().caption;
  if (now?.text === text && now.charIndex === charIndex) return;
  useTtsStore.setState({ caption: { text, charIndex } });
}

/** Follow the audio, moving the highlight to the word it has probably reached. */
function followAudio(el: HTMLAudioElement, text: string): void {
  if (typeof requestAnimationFrame !== 'function') return;
  if (captionFrame) cancelAnimationFrame(captionFrame);
  const tick = () => {
    if (audio !== el) return;
    const fraction = el.duration > 0 ? el.currentTime / el.duration : 0;
    showCaption(text, charIndexAtFraction(text, fraction || 0));
    captionFrame = requestAnimationFrame(tick);
  };
  tick();
}
/** True when the server has no TTS backend and we speak with the OS voices. */
let useBrowserVoice = false;

/** The OS speech engine exposed to the webview, if any (macOS WKWebView has one). */
function browserSynth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

/** Prefer an Indian English voice, then any local English voice. */
function pickBrowserVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  const byLang = (prefix: string) =>
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix) && v.localService) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
  return byLang('en-in') ?? byLang('en-gb') ?? byLang('en') ?? voices[0] ?? null;
}

const FIRST_CHUNK_CHARS = 240;
const CHUNK_CHARS = 1200;

/** Split speech at sentence ends: a short first piece, then longer ones. */
export function splitForSpeech(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  const limit = () => (chunks.length === 0 ? FIRST_CHUNK_CHARS : CHUNK_CHARS);
  for (const sentence of text.split(/(?<=[.!?;:।])\s+/)) {
    // A sentence longer than a whole piece is broken between words.
    const units = sentence.length > CHUNK_CHARS ? sentence.split(/\s+/) : [sentence];
    for (const unit of units) {
      if (current && current.length + unit.length + 1 > limit()) {
        chunks.push(current);
        current = '';
      }
      current = current ? `${current} ${unit}` : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Only a stream ending in the active conversation may trigger autoplay. */
export function shouldAutoplayFinishedReply(
  previousStreamingConversationId: string | null,
  activeId: string | null,
  streamIsActive: boolean,
  lastMessage: { id: string; role: string } | undefined,
  autoSpokenId: string | null,
): boolean {
  return previousStreamingConversationId !== null
    && previousStreamingConversationId === activeId
    && !streamIsActive
    && lastMessage !== undefined
    && lastMessage.role === 'assistant'
    && lastMessage.id !== autoSpokenId;
}

function teardown(): void {
  if (audio) {
    // Detach first: clearing src re-runs the media load algorithm, which fails
    // on an empty source and dispatches an `error` event. With the handler
    // still attached that surfaces as a bogus "Playback failed" after every
    // successful utterance.
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = '';
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  if (controller) {
    controller.abort();
    controller = null;
  }
  browserSynth()?.cancel();
  stopCaptions();
}

export const useTtsStore = create<TtsStore>((set, get) => ({
  state: 'idle',
  speakingId: null,
  error: null,
  errorId: null,
  available: null,
  autoSpokenId: null,
  caption: null,

  ensureHealth: () => {
    if (healthProbe) return healthProbe;
    healthProbe = fetchTtsHealth()
      .then((health) => {
        // No server voice: speak with the OS voices instead, when present.
        useBrowserVoice = !health.available && browserSynth() !== null;
        set({ available: health.available || useBrowserVoice });
        if (!health.available && !useBrowserVoice) healthProbe = null;
      })
      .catch(() => {
        useBrowserVoice = browserSynth() !== null;
        set({ available: useBrowserVoice });
        if (!useBrowserVoice) healthProbe = null;
      });
    return healthProbe;
  },

  markAutoSpoken: (id: string) => set({ autoSpokenId: id }),

  speak: async (id: string, text: string) => {
    const trimmed = toSpeakableText(text);
    if (!trimmed) return;

    // Bump before teardown so a synthesis still in flight is both aborted and
    // fenced off by the token, even if the abort loses the race.
    token += 1;
    const mine = token;
    teardown();
    set({ state: 'loading', speakingId: id, error: null, errorId: null });

    const speakWithBrowser = (synth: SpeechSynthesis, spoken: string = trimmed) => {
      const utterance = new SpeechSynthesisUtterance(spoken);
      const voice = pickBrowserVoice(synth);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.onstart = () => {
        if (mine !== token) return;
        set({ state: 'speaking', speakingId: id });
        showCaption(spoken, 0);
      };
      utterance.onboundary = (event) => {
        if (mine === token) showCaption(spoken, event.charIndex);
      };
      utterance.onend = () => {
        if (mine !== token) return;
        set({ state: 'idle', speakingId: null });
        stopCaptions();
      };
      utterance.onerror = (event) => {
        if (mine !== token) return;
        // cancel() from stop()/a newer utterance reports interrupted/canceled.
        const benign = event.error === 'interrupted' || event.error === 'canceled';
        set({
          state: 'idle',
          speakingId: null,
          error: benign ? null : 'Speech playback failed',
          errorId: benign ? null : id,
        });
      };
      synth.speak(utterance);
    };

    const synth = useBrowserVoice ? browserSynth() : null;
    if (synth) {
      speakWithBrowser(synth);
      return;
    }

    const ac = new AbortController();
    controller = ac;

    // Long replies are synthesized in pieces so speech starts after the first
    // sentence or two, and the next piece is fetched while this one plays.
    const chunks = splitForSpeech(trimmed);
    const fetchChunk = (index: number) => {
      const request = synthesizeSpeech(chunks[index], { signal: ac.signal });
      request.catch(() => {}); // awaited later; must not count as unhandled
      return request;
    };

    const playFrom = async (index: number, pending: Promise<Blob>): Promise<void> => {
      try {
        const blob = await pending;
        if (mine !== token) return;
        const next = index + 1 < chunks.length ? fetchChunk(index + 1) : null;

        if (objectUrl) URL.revokeObjectURL(objectUrl);
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        const el = new Audio(url);
        audio = el;

        el.onended = () => {
          if (mine !== token) return;
          if (next) {
            void playFrom(index + 1, next);
            return;
          }
          teardown();
          set({ state: 'idle', speakingId: null });
        };
        el.onerror = () => {
          if (mine !== token) return;
          teardown();
          set({ state: 'idle', speakingId: null, error: 'Playback failed', errorId: id });
        };

        await el.play();
        if (mine === token) {
          set({ state: 'speaking', speakingId: id });
          followAudio(el, chunks[index]);
        }
      } catch (err) {
        if (mine !== token) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        teardown();
        // The server voice failed (quota, offline): the OS voice reads the rest.
        const fallback = browserSynth();
        if (fallback) {
          speakWithBrowser(fallback, chunks.slice(index).join(' '));
          return;
        }
        set({
          state: 'idle',
          speakingId: null,
          error: err instanceof Error ? err.message : 'Speech synthesis failed',
          errorId: id,
        });
      }
    };

    await playFrom(0, fetchChunk(0));
  },

  stop: () => {
    token += 1;
    teardown();
    set({ state: 'idle', speakingId: null, error: null, errorId: null });
  },
}));

/** Test seam: reset module-level playback handles between cases. */
export function __resetTtsForTests(): void {
  teardown();
  token = 0;
  healthProbe = null;
  useBrowserVoice = false;
  useTtsStore.setState({
    state: 'idle',
    speakingId: null,
    error: null,
    errorId: null,
    available: null,
    autoSpokenId: null,
    caption: null,
  });
}
