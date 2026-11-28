import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, Paperclip, Search, AudioLines, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, generateId } from '../../lib/store';
import { streamResearch } from '../../lib/sse';
import { abortTutorStream, sendTutorMessage } from '../../lib/chat/sendTutorMessage';
import { isSpeakableReply } from '../../lib/chat/history';
import { listConnectors, getSyncStatus } from '../../lib/connectors-api';
import { resolveChatEngine } from '../../lib/chat-telemetry';
import { MicButton } from './MicButton';
import type { OrbState } from './VoiceOrb';
import { isEcho } from '../../lib/voice-detector';
import { useSpeech } from '../../hooks/useSpeech';
import { useTtsStore } from '../../lib/tts';
import type {
  ChatMessage,
  MessageError,
  MessageTelemetry,
  ResearchSearchTrace,
  ResearchSource,
  TokenUsage,
} from '../../types';

// While Deep Research is toggled on, poll connected sources for sync
// progress so we can surface "Searching over N items — sync in progress"
// next to the toggle. Polling is gated on `enabled` so toggling DR off
// stops the network chatter immediately.
function useResearchCorpusSync(enabled: boolean): {
  syncing: boolean;
  itemsSynced: number;
} {
  const [state, setState] = useState({ syncing: false, itemsSynced: 0 });

  useEffect(() => {
    if (!enabled) {
      setState({ syncing: false, itemsSynced: 0 });
      return;
    }
    let cancelled = false;

    const poll = async () => {
      try {
        const list = await listConnectors();
        const connected = list.filter((c) => c.connected);
        if (connected.length === 0) {
          if (!cancelled) setState({ syncing: false, itemsSynced: 0 });
          return;
        }
        const results = await Promise.all(
          connected.map(async (c) => {
            try {
              return await getSyncStatus(c.connector_id);
            } catch {
              return null;
            }
          }),
        );
        let syncing = false;
        let itemsSynced = 0;
        for (const r of results) {
          if (!r) continue;
          if (r.state === 'syncing') syncing = true;
          itemsSynced += r.items_synced ?? 0;
        }
        if (!cancelled) setState({ syncing, itemsSynced });
      } catch {
        // Network blip — leave previous state intact.
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return state;
}

interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
}

const MAX_IMAGES = 4;

/** Read an image file, downscaled to at most `maxDim` px, as a JPEG data URL. */
async function imageFileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read ${file.name || 'image'}`));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Rough check for models that can read images (cloud models and local vision models). */
function modelSeesImages(model: string): boolean {
  return /^(gemini|gpt-|o[134]-|claude)/.test(model) || /(vl|vision|llava|moondream|gemma3)/i.test(model);
}

export function InputArea() {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeId = useAppStore((s) => s.activeId);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const streamState = useAppStore((s) => s.streamState);
  const messages = useAppStore((s) => s.messages);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const setStreamState = useAppStore((s) => s.setStreamState);
  const resetStream = useAppStore((s) => s.resetStream);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const deepResearch = useAppStore((s) => s.deepResearch);
  const setDeepResearch = useAppStore((s) => s.setDeepResearch);
  const corpusSync = useResearchCorpusSync(deepResearch);
  const isCurrentChatStreaming = streamState.isStreaming && streamState.conversationId === activeId;

  const {
    state: speechState,
    error: speechError,
    available: speechAvailable,
    startRecording,
    stopRecording,
    cancelRecording,
    listen,
    hearing,
  } = useSpeech();
  const conversationMode = useAppStore((s) => s.conversationMode);
  const setConversationMode = useAppStore((s) => s.setConversationMode);
  const ttsState = useTtsStore((s) => s.state);
  const ttsAvailable = useTtsStore((s) => s.available);
  const autoSpokenId = useTtsStore((s) => s.autoSpokenId);

  // Abort in-flight stream when the user switches models mid-generation.
  // This prevents errors from trying to continue a stream with a stale model.
  const prevModelRef = useRef(selectedModel);
  useEffect(() => {
    if (prevModelRef.current !== selectedModel && streamState.isStreaming) {
      abortRef.current?.abort();
      abortTutorStream();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      abortRef.current = null;
    }
    prevModelRef.current = selectedModel;
  }, [selectedModel, streamState.isStreaming, resetStream]);

  const micDisabled = !speechEnabled || !speechAvailable || streamState.isStreaming;
  const micReason: 'not-enabled' | 'no-backend' | 'streaming' | undefined =
    !speechEnabled ? 'not-enabled'
    : !speechAvailable ? 'no-backend'
    : streamState.isStreaming ? 'streaming'
    : undefined;

  useEffect(() => {
    if (speechError) {
      toast.error(speechError, { duration: 8000 });
    }
  }, [speechError]);

  const handleMicClick = useCallback(async () => {
    if (speechState === 'recording') {
      try {
        const text = await stopRecording();
        if (text) {
          setInput((prev) => (prev ? prev + ' ' + text : text));
        }
      } catch {
        // Error is captured in useSpeech
      }
    } else {
      await startRecording();
    }
  }, [speechState, startRecording, stopRecording]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortTutorStream();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    resetStream();
  }, [resetStream]);

  const addImageFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    const room = MAX_IMAGES - attachedImages.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES} images per message`);
      return;
    }
    const added: AttachedImage[] = [];
    for (const file of images.slice(0, room)) {
      try {
        added.push({ id: generateId(), name: file.name || 'image.jpg', dataUrl: await imageFileToDataUrl(file) });
      } catch (err: any) {
        toast.error(err?.message || 'Could not read image');
      }
    }
    if (added.length) setAttachedImages((prev) => [...prev, ...added].slice(0, MAX_IMAGES));
  }, [attachedImages.length]);

  /** Send the typed or spoken question; resolves with the finished reply. */
  const sendMessage = useCallback(async (spokenText?: string): Promise<ChatMessage | null> => {
    const images = attachedImages;
    const typed = (spokenText ?? input).trim();
    const content = typed || (images.length ? 'Please help me with the question in this image.' : '');
    if (!content || streamState.isStreaming) return null;
    if (!selectedModel) {
      toast.error('Pick a model first (⌘K)');
      return null;
    }

    setInput('');
    setAttachedImages([]);
    if (images.length && !modelSeesImages(selectedModel)) {
      toast.warning(`${selectedModel} may not be able to read images. Try gemini-2.5-flash.`);
    }

    // Everything but Deep Research goes to the tutor route.
    if (!deepResearch) {
      return sendTutorMessage({
        conversationId: activeId,
        model: selectedModel,
        content,
        images,
      });
    }

    let convId = activeId;
    if (!convId) {
      convId = createConversation(selectedModel);
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: images.length ? images.map((img) => img.name) : undefined,
    };
    addMessage(convId, userMsg);

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isResearch: true,
    };
    addMessage(convId, assistantMsg);

    // Start streaming
    const startTime = Date.now();
    const timer = setInterval(() => {
      setStreamState({ elapsedMs: Date.now() - startTime });
    }, 100);
    timerRef.current = timer;

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedContent = '';
    let usage: TokenUsage | undefined;
    let failure: MessageError | undefined;
    let stopped = false;
    const researchTraces: ResearchSearchTrace[] = [];
    const researchSourcesByRef = new Map<number, ResearchSource>();
    const flushSources = () =>
      Array.from(researchSourcesByRef.values()).sort((a, b) => a.ref - b.ref);
    let lastFlush = 0;
    let ttftMs: number | undefined;

    setStreamState({
      conversationId: convId,
      isStreaming: true,
      phase: 'Researching...',
      elapsedMs: 0,
      activeToolCalls: [],
      content: '',
    });
    useAppStore.getState().addLogEntry({
      timestamp: Date.now(),
      level: 'info',
      category: 'chat',
      message: `Research: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`,
    });

    try {
      for await (const ev of streamResearch(
        content,
        selectedModel,
        controller.signal,
      )) {
        if (ev.type === 'search_call') {
          const trace: ResearchSearchTrace = {
            id: generateId(),
            query: ev.arguments?.query ?? '',
            person: ev.arguments?.person,
            timeRange: ev.arguments?.time_range,
            status: 'pending',
          };
          researchTraces.push(trace);
          setStreamState({ phase: `Searching: ${trace.query}` });
          updateLastAssistant(
            convId,
            accumulatedContent,
            undefined,
            undefined,
            undefined,
            undefined,
            [...researchTraces],
            flushSources(),
          );
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(),
            level: 'info',
            category: 'tool',
            message: `Search: "${trace.query}"${trace.person ? ` (person: ${trace.person})` : ''}`,
          });
        } else if (ev.type === 'search_result') {
          const pending = [...researchTraces].reverse().find((t) => t.status === 'pending');
          if (pending) {
            pending.status = 'complete';
            pending.numHits = ev.num_hits;
            pending.topTitles = ev.top_titles;
          }
          if (ev.sources) {
            for (const src of ev.sources) {
              if (src && typeof src.ref === 'number' && !researchSourcesByRef.has(src.ref)) {
                researchSourcesByRef.set(src.ref, src);
              }
            }
          }
          updateLastAssistant(
            convId,
            accumulatedContent,
            undefined,
            undefined,
            undefined,
            undefined,
            [...researchTraces],
            flushSources(),
          );
        } else if (ev.type === 'synthesis') {
          if (!ttftMs) ttftMs = Date.now() - startTime;
          accumulatedContent += ev.text;
          setStreamState({ content: accumulatedContent, phase: '' });
          const now = Date.now();
          if (now - lastFlush >= 80) {
            updateLastAssistant(
              convId,
              accumulatedContent,
              undefined,
              undefined,
              undefined,
              undefined,
              [...researchTraces],
              flushSources(),
            );
            lastFlush = now;
          }
        } else if (ev.type === 'system_metrics') {
          // Live GPU sample — feed straight to the System panel so Power
          // (W) and Energy (kJ) tick up in real time as the agent runs.
          useAppStore.getState().setLiveEnergy({
            power_w: ev.power_w,
            energy_j: ev.energy_j,
            duration_s: ev.duration_s,
          });
        } else if (ev.type === 'error') {
          // Backend setup/worker failure (Ollama down, planner model
          // missing, KnowledgeStore locked, etc.). Without surfacing the
          // message, the user sees only the generic "No response was
          // generated" fallback and has no way to self-diagnose.
          const msg = ev.message || 'Research failed (no detail provided)';
          failure = { code: 'internal', message: msg, retryable: false };
          setStreamState({ phase: '' });
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(),
            level: 'error',
            category: 'chat',
            message: `Deep Research error: ${msg}`,
          });
          toast.error(msg, { duration: 8000 });
        } else if (ev.type === 'done') {
          if (ev.usage) {
            usage = {
              prompt_tokens: ev.usage.prompt_tokens ?? 0,
              completion_tokens: ev.usage.completion_tokens ?? 0,
              total_tokens:
                ev.usage.total_tokens ??
                (ev.usage.prompt_tokens ?? 0) +
                  (ev.usage.completion_tokens ?? 0),
            };
            // Optimistically roll this research turn into the session
            // counters so the Session panel updates the moment the
            // stream finishes, regardless of how /v1/savings aggregates
            // research telemetry server-side.
            useAppStore.getState().incrementSavings(usage);
          }
          // Hold the final live numbers visible for a beat so the panel
          // doesn't flash to 0 between the SSE close and the next
          // /v1/telemetry/energy poll picking up the persisted record.
          window.setTimeout(() => {
            useAppStore.getState().setLiveEnergy(null);
          }, 1500);
          break;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled or model switch — keep whatever was accumulated
        stopped = true;
      } else {
        const errMsg = err?.message || String(err);
        failure = { code: 'internal', message: errMsg, retryable: false };
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'error', category: 'chat',
          message: `Stream error: ${errMsg}`,
        });
      }
      // If we tore out mid-research, make sure the live System panel
      // numbers don't get stuck on the last sample.
      useAppStore.getState().setLiveEnergy(null);
    }

    if (!accumulatedContent && !failure && !stopped) {
      failure = {
        code: 'internal',
        message: 'No response was generated. Please try again.',
        retryable: false,
      };
    }
    const totalMs = Date.now() - startTime;
    const appState = useAppStore.getState();
    const selectedOwner = appState.models.find((m) => m.id === selectedModel)?.owned_by;
    const telemetry: MessageTelemetry = {
      engine: resolveChatEngine({
        serverEngine: appState.serverInfo?.engine,
        selectedModel,
        selectedOwner,
      }),
      model_id: selectedModel,
      total_ms: totalMs,
      ttft_ms: ttftMs,
      tokens_per_sec: usage?.completion_tokens
        ? usage.completion_tokens / (totalMs / 1000)
        : undefined,
    };
    const finished: Partial<ChatMessage> = {
      content: accumulatedContent,
      usage,
      telemetry,
      error: failure,
      stopped: stopped || undefined,
      researchTraces: researchTraces.length > 0 ? researchTraces : undefined,
      researchSources: researchSourcesByRef.size > 0 ? flushSources() : undefined,
    };
    useAppStore.getState().patchMessage(convId, assistantMsg.id, finished);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    resetStream();
    useAppStore.getState().addLogEntry({
      timestamp: Date.now(), level: 'info', category: 'chat',
      message: `Response: ${accumulatedContent.length} chars`,
    });
    abortRef.current = null;
    // Session counters were updated from the `done` event's usage payload;
    // re-fetching savings here could overwrite them with a stale snapshot.
    return { ...assistantMsg, ...finished };
  }, [
    input,
    attachedImages,
    activeId,
    selectedModel,
    streamState.isStreaming,
    createConversation,
    addMessage,
    updateLastAssistant,
    setStreamState,
    resetStream,
    deepResearch,
  ]);

  // ── Conversation mode: listen → send → speak → listen again ──────────
  const sendRef = useRef(sendMessage);
  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);
  const conversationRef = useRef(conversationMode);
  useEffect(() => {
    conversationRef.current = conversationMode;
  }, [conversationMode]);
  const phaseRef = useRef<'idle' | 'listening' | 'waiting'>('idle');
  const [conversationPhase, setConversationPhase] = useState<'idle' | 'listening' | 'waiting'>('idle');
  const setPhase = useCallback((phase: 'idle' | 'listening' | 'waiting') => {
    phaseRef.current = phase;
    setConversationPhase(phase);
  }, []);
  const lastMessage = messages[messages.length - 1];
  const talkTurnRef = useRef(0);

  const listeningRef = useRef(false);
  const [listenRound, setListenRound] = useState(0);

  /** Is Jarvis still producing, or about to speak, an answer? */
  const jarvisBusy = useCallback(() => {
    const app = useAppStore.getState();
    const tts = useTtsStore.getState();
    if (app.streamState.isStreaming || tts.state !== 'idle') return true;
    if (phaseRef.current !== 'waiting' || tts.available !== true) return false;
    const last = app.messages[app.messages.length - 1];
    return !(last?.role === 'assistant' && tts.autoSpokenId === last.id);
  }, []);

  const pauseConversation = useCallback((message?: string) => {
    setPhase('idle');
    setConversationMode(false);
    if (message) toast(message);
  }, [setConversationMode, setPhase]);

  /** One round of listening, which may begin while Jarvis is still answering. */
  const runListen = useCallback(() => {
    if (listeningRef.current || !conversationRef.current) return;
    listeningRef.current = true;
    if (phaseRef.current === 'idle') setPhase('listening');
    let interrupted = '';
    let wasInterrupted = false;

    listen({
      isBusy: jarvisBusy,
      isPlaying: () => useTtsStore.getState().state === 'speaking',
      onQuiet: () => setPhase('listening'),
      onSpeech: (duringReply) => {
        if (duringReply) {
          wasInterrupted = true;
          interrupted = useTtsStore.getState().caption?.text ?? '';
          talkTurnRef.current += 1; // the old reply no longer drives the loop
          abortTutorStream();
          const tts = useTtsStore.getState();
          const messagesNow = useAppStore.getState().messages;
          const last = messagesNow[messagesNow.length - 1];
          if (last?.role === 'assistant') tts.markAutoSpoken(last.id);
          tts.stop();
        }
        setPhase('listening');
      },
    })
      .then((heard) => {
        listeningRef.current = false;
        if (!conversationRef.current) {
          setPhase('idle');
          return;
        }
        const text = heard.trim();
        if (wasInterrupted && (!text || isEcho(text, interrupted))) {
          if (text) {
            toast('Jarvis heard its own voice. Headphones make interrupting work better.');
          }
          setPhase('idle');
          setListenRound((n) => n + 1);
          return;
        }
        if (!text) {
          pauseConversation('Conversation paused — click Talk to continue.');
          return;
        }
        setPhase('waiting');
        const turn = ++talkTurnRef.current;
        void sendRef.current(text).catch(() => null).then((reply) => {
          // ChatArea speaks an answer. Anything else would leave the loop
          // waiting for speech that never comes, so pause it.
          if (turn !== talkTurnRef.current || !conversationRef.current) return;
          if (isSpeakableReply(reply)) return;
          cancelRecording();
          pauseConversation('Conversation paused: there was no answer to read. See the chat.');
        });
        setListenRound((n) => n + 1);
      })
      .catch(() => {
        listeningRef.current = false;
        pauseConversation();
      });
  }, [listen, jarvisBusy, cancelRecording, pauseConversation, setPhase]);

  useEffect(() => {
    if (!conversationMode) {
      if (listeningRef.current) cancelRecording();
      if (phaseRef.current !== 'idle') setPhase('idle');
      return;
    }
    if (listeningRef.current || speechState !== 'idle') return;
    // While waiting for an answer, start at once so it can be interrupted.
    const delay = phaseRef.current === 'waiting' ? 100 : 300;
    const timer = window.setTimeout(runListen, delay);
    return () => window.clearTimeout(timer);
  }, [conversationMode, listenRound, speechState, runListen, cancelRecording, setPhase]);

  // Leaving the chat page must release the microphone.
  useEffect(() => () => cancelRecording(), [cancelRecording]);

  const toggleConversation = useCallback(() => {
    // A reply still in flight belongs to the previous session.
    talkTurnRef.current += 1;
    if (conversationMode) {
      setConversationMode(false);
      useTtsStore.getState().stop();
      return;
    }
    if (!speechAvailable) {
      toast.error('Speech recognition is not available. Check that the OpenJarvis backend is running.');
      return;
    }
    if (!selectedModel) {
      toast.error('Pick a model first (⌘K)');
      return;
    }
    // Interrupt Jarvis if it is still talking, then start listening.
    useTtsStore.getState().stop();
    void useTtsStore.getState().ensureHealth();
    setConversationMode(true);
  }, [conversationMode, speechAvailable, selectedModel, setConversationMode]);

  const orbState: OrbState =
    conversationPhase === 'listening'
      ? speechState === 'transcribing' ? 'transcribing' : 'listening'
      : ttsState === 'speaking' || ttsState === 'loading'
        ? 'speaking'
        : streamState.isStreaming || conversationPhase === 'waiting'
          ? 'thinking'
          : 'idle';
  const setVoiceOrbState = useAppStore((s) => s.setVoiceOrbState);
  useEffect(() => {
    setVoiceOrbState(orbState);
  }, [orbState, setVoiceOrbState]);
  const setUserSpeaking = useAppStore((s) => s.setUserSpeaking);
  useEffect(() => {
    setUserSpeaking(hearing);
  }, [hearing, setUserSpeaking]);

  const conversationLabel = !conversationMode
    ? 'Talk'
    : conversationPhase === 'listening'
      ? speechState === 'transcribing' ? 'Got it…' : 'Listening…'
      : ttsState === 'speaking' || ttsState === 'loading'
        ? 'Jarvis speaking…'
        : 'Jarvis thinking…';

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      void addImageFiles(files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="px-4 pb-4 pt-2" style={{ maxWidth: 'var(--chat-max-width)', margin: '0 auto', width: '100%' }}>
      <div className="mb-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDeepResearch(!deepResearch)}
            disabled={streamState.isStreaming}
            aria-pressed={deepResearch}
            className="hud-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
            style={{
              background: deepResearch ? 'var(--color-accent-subtle)' : 'transparent',
              border: `1px solid ${deepResearch ? 'var(--color-accent)' : 'var(--color-border)'}`,
              color: deepResearch ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            }}
            title={deepResearch ? 'Deep Research: on' : 'Deep Research: off'}
          >
            <Search size={12} />
            Deep Research
          </button>
          <button
            type="button"
            onClick={toggleConversation}
            aria-pressed={conversationMode}
            className="hud-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer"
            style={{
              background: conversationMode ? 'var(--color-accent-subtle)' : 'transparent',
              border: `1px solid ${conversationMode ? 'var(--color-accent)' : 'var(--color-border)'}`,
              color: conversationMode ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            }}
            title={conversationMode ? 'Stop the voice conversation' : 'Talk to Jarvis hands-free: speak, pause, and it answers aloud'}
          >
            <AudioLines size={12} className={conversationMode ? 'animate-pulse' : undefined} />
            {conversationLabel}
          </button>
        </div>
        {attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachedImages.map((img) => (
              <div
                key={img.id}
                className="relative rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--color-border)' }}
                title={img.name}
              >
                <img src={img.dataUrl} alt={img.name} className="h-14 w-14 object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))}
                  className="absolute top-0.5 right-0.5 rounded-full p-0.5 cursor-pointer"
                  style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
                  aria-label={`Remove ${img.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        {deepResearch && corpusSync.syncing && corpusSync.itemsSynced > 0 && (
          <div
            className="text-[11px] leading-snug"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Searching over{' '}
            <span key={corpusSync.itemsSynced} className="sync-bump" style={{ color: 'var(--color-text-secondary)' }}>
              {corpusSync.itemsSynced.toLocaleString()}
            </span>{' '}
            items — sync in progress, results will improve as more data is indexed.
          </div>
        )}
      </div>
      <div
        className="hud-frame flex items-center gap-2 rounded-2xl px-4 py-3 transition-shadow"
        style={{
          background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            void addImageFiles(files);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={streamState.isStreaming || attachedImages.length >= MAX_IMAGES}
          className="p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
          style={{ color: 'var(--color-text-tertiary)' }}
          title="Attach an image (photo of a question, diagram, notes)"
          aria-label="Attach image"
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={selectedModel ? 'Message OpenJarvis...' : 'Pick a model first (⌘K)...'}
          rows={1}
          className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
          style={{ color: 'var(--color-text)', maxHeight: '200px' }}
          disabled={streamState.isStreaming || modelLoading}
        />
        {isCurrentChatStreaming ? (
          <button
            onClick={stopStreaming}
            className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer"
            style={{ background: 'var(--color-error)', color: 'var(--color-on-accent)' }}
            title="Stop generating"
          >
            <Square size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <MicButton
              state={speechState}
              onClick={handleMicClick}
              disabled={micDisabled}
              reason={micReason}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={
                streamState.isStreaming ||
                (!input.trim() && attachedImages.length === 0) ||
                modelLoading ||
                !selectedModel
              }
              title={selectedModel ? 'Send message' : 'Pick a model first (⌘K)'}
              className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
              style={{
                background: input.trim() || attachedImages.length ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: input.trim() || attachedImages.length ? 'white' : 'var(--color-text-tertiary)',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center mt-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>
          <kbd className="font-mono">Enter</kbd> to send &middot;{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
}
