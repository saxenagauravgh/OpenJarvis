import { create } from 'zustand';
import { synthesizeSpeech, fetchTtsHealth } from './api';
import { toSpeakableText } from './message-text';
import { charIndexAtFraction } from './caption';
import { ENVELOPE_STEP_SECONDS, publishLevel, wavEnvelope } from './voice-level';
import {
  listSource,
  liveSource,
  type LiveSpeechSource,
  type SpeechSource,
} from './speech-source';

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
  /** Speak a reply while it is still being written. */
  speakLive: (id: string) => Pick<LiveSpeechSource, 'update' | 'end'>;
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
let activeSource: SpeechSource | null = null;
let speechSpeed = 1;

/** Set how fast replies are spoken (1 is normal). */
export function setSpeechSpeed(speed: number): void {
  speechSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function stopCaptions(): void {
  if (captionFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(captionFrame);
  }
  captionFrame = 0;
  publishLevel(0);
  useTtsStore.setState({ caption: null });
}

function showCaption(text: string, charIndex: number): void {
  const now = useTtsStore.getState().caption;
  if (now?.text === text && now.charIndex === charIndex) return;
  useTtsStore.setState({ caption: { text, charIndex } });
}

/** Follow the audio, moving the highlight to the word it has probably reached. */
function followAudio(el: HTMLAudioElement, text: string, blob: Blob): void {
  if (typeof requestAnimationFrame !== 'function') return;
  if (captionFrame) cancelAnimationFrame(captionFrame);
  let envelope: number[] = [];
  void blob
    .arrayBuffer?.()
    .then((data) => {
      envelope = wavEnvelope(data);
    })
    .catch(() => {});
  const tick = () => {
    if (audio !== el) return;
    const fraction = el.duration > 0 ? el.currentTime / el.duration : 0;
    showCaption(text, charIndexAtFraction(text, fraction || 0));
    publishLevel(envelope[Math.floor(el.currentTime / ENVELOPE_STEP_SECONDS)] ?? 0);
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

/** The Mac voice the user chose. When installed it is used for all speech. */
export const PREFERRED_VOICE = 'Rishi';

function preferredVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const matches = voices.filter((v) => v.name?.startsWith(PREFERRED_VOICE));
  // An Enhanced or Premium download of the same voice sounds better.
  return matches.find((v) => /enhanced|premium/i.test(v.name)) ?? matches[0];
}

/** Prefer the chosen voice, then Indian English, then any local English voice. */
function pickBrowserVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  const byLang = (prefix: string) =>
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix) && v.localService) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
  return (
    preferredVoice(voices) ??
    byLang('en-in') ??
    byLang('en-gb') ??
    byLang('en') ??
    voices[0] ??
    null
  );
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
  activeSource?.close();
  activeSource = null;
  stopCaptions();
}

/** Speak a source piece by piece, fetching the next while one plays. */
async function playSource(id: string, source: SpeechSource): Promise<void> {
  // Bump before teardown so a synthesis still in flight is both aborted and
  // fenced off by the token, even if the abort loses the race.
  token += 1;
  const mine = token;
  teardown();
  activeSource = source;
  const set = useTtsStore.setState;
  set({ state: 'loading', speakingId: id, error: null, errorId: null });

  const ac = new AbortController();
  controller = ac;
  let browser = useBrowserVoice && browserSynth() !== null;

  type Piece = { text: string; audio: Promise<Blob> | null };
  const fetchPiece = async (): Promise<Piece | null> => {
    const text = await source.next();
    if (text === null || mine !== token) return null;
    const speed = speechSpeed === 1 ? undefined : speechSpeed;
    const request = browser
      ? null
      : synthesizeSpeech(text, { signal: ac.signal, ...(speed ? { speed } : {}) });
    request?.catch(() => {}); // awaited later; must not count as unhandled
    return { text, audio: request };
  };

  const finish = (error: string | null = null) => {
    teardown();
    set({ state: 'idle', speakingId: null, error, errorId: error ? id : null });
  };

  const speakWithBrowser = (synth: SpeechSynthesis, spoken: string) => {
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = speechSpeed;
    const hindi = /[\u0900-\u097F]/.test(spoken)
      ? synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('hi'))
      : undefined;
    const voice = hindi ?? pickBrowserVoice(synth);
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
      if (mine !== token) return;
      showCaption(spoken, event.charIndex);
      // The OS voice gives no audio to measure: pulse on each word instead.
      publishLevel(0.45 + Math.min((event.charLength || 5) / 14, 0.5));
      window.setTimeout(() => publishLevel(0.2), 140);
    };
    utterance.onend = () => {
      if (mine !== token) return;
      set({ state: 'loading', speakingId: id });
      void playNext(fetchPiece());
    };
    utterance.onerror = (event) => {
      if (mine !== token) return;
      // cancel() from stop()/a newer utterance reports interrupted/canceled.
      const benign = event.error === 'interrupted' || event.error === 'canceled';
      finish(benign ? null : 'Speech playback failed');
    };
    synth.speak(utterance);
  };

  const playNext = async (pending: Promise<Piece | null>): Promise<void> => {
    let piece: Piece | null = null;
    try {
      piece = await pending;
      if (mine !== token) return;
      if (!piece) {
        finish();
        return;
      }
      const synth = browser ? browserSynth() : null;
      if (synth) {
        speakWithBrowser(synth, piece.text);
        return;
      }
      const blob = await (piece.audio as Promise<Blob>);
      if (mine !== token) return;
      const next = fetchPiece();
      next.catch(() => {});

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const url = URL.createObjectURL(blob);
      objectUrl = url;
      const el = new Audio(url);
      audio = el;
      const spoken = piece.text;

      el.onended = () => {
        if (mine !== token) return;
        // Done with this element: its later events must not count.
        el.onended = null;
        el.onerror = null;
        publishLevel(0);
        // Quiet until the next piece is ready.
        set({ state: 'loading', speakingId: id });
        void playNext(next);
      };
      el.onerror = () => {
        if (mine === token) finish('Playback failed');
      };

      await el.play();
      if (mine === token) {
        set({ state: 'speaking', speakingId: id });
        followAudio(el, spoken, blob);
      }
    } catch (err) {
      if (mine !== token) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // The server voice failed (quota, offline): the OS voice carries on.
      const fallback = browserSynth();
      if (fallback && piece) {
        browser = true;
        speakWithBrowser(fallback, piece.text);
        return;
      }
      finish(err instanceof Error ? err.message : 'Speech synthesis failed');
    }
  };

  await playNext(fetchPiece());
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
    // Long replies are synthesized in pieces so speech starts sooner.
    await playSource(id, listSource(splitForSpeech(trimmed)));
  },

  speakLive: (id: string) => {
    const source = liveSource();
    void playSource(id, source);
    return { update: source.update, end: source.end };
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
