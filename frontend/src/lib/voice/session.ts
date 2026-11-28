/**
 * One live voice connection: the microphone is streamed to the server and its
 * speech is played back. Everything is released when the session ends, however
 * it ends.
 */
import { buildWsProtocols } from '../useAgentEvents';
import { publishLevel } from '../voice-level';
import {
  liveVoiceUrl,
  parseServerMessage,
  startMessage,
  stopMessage,
  textMessage,
  type LiveHistoryTurn,
  type ServerMessage,
} from './protocol';

export type LivePhase = 'connecting' | 'listening' | 'speaking';

export interface LiveStatus {
  phase: LivePhase;
  /** The user's voice is being picked up right now. */
  hearing: boolean;
}

export interface LiveEnd {
  /** 'stopped' means the app asked for it. */
  reason: 'stopped' | 'failed';
  /** The server never became ready. */
  beforeReady: boolean;
  code?: string;
  message?: string;
}

export interface LiveSessionCallbacks {
  onStatus: (status: LiveStatus) => void;
  /** Conversation events. Errors and closing arrive through onEnd. */
  onMessage: (message: ServerMessage) => void;
  /** Called exactly once. */
  onEnd: (end: LiveEnd) => void;
  /**
   * How far the reply being played has got (0 to 1), or null when nothing is
   * playing. Used to highlight the words being spoken.
   */
  onPlayback?: (playback: { turnId: string; fraction: number } | null) => void;
}

export interface LiveSession {
  /** False if the server has not been ready yet. */
  sendText: (text: string) => boolean;
  /** Silence the reply being played. */
  flush: () => void;
  stop: () => void;
}

export const READY_TIMEOUT_MS = 20000;
/** About a second of audio: beyond this the connection is not keeping up. */
export const MAX_BUFFERED_BYTES = 32000;
const HEARING_RMS = 0.025;
const HEARING_HOLD_MS = 400;
const OPEN = 1;

/** Why the server closed the session, in words. */
const CLOSE_REASONS: Record<string, string> = {
  idle: 'It was quiet for a while.',
  replaced: 'Talk was started somewhere else.',
};

const workletUrl = (name: string) =>
  `${import.meta.env.BASE_URL ?? '/'}audio/${name}.worklet.js`;

/**
 * Start a session. Call this directly from the click that asks for it: the
 * browser only lets audio start during a user gesture.
 */
export function startLiveSession(
  options: { history: LiveHistoryTurn[]; adultConfirmed: boolean; webSearch: 'auto' | 'off' },
  callbacks: LiveSessionCallbacks,
): LiveSession {
  let ended = false;
  let ready = false;
  let everReady = false;
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let socket: WebSocket | null = null;
  let capture: AudioWorkletNode | null = null;
  let playback: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let speaking = false;
  let hearing = false;
  let lastHeard = 0;
  let status: LiveStatus | null = null;
  // The reply in progress, so that one the user silenced stays silent.
  let replying = false;
  let replyTurn: string | undefined;
  let muted = false;

  const report = () => {
    if (ended) return;
    const phase: LivePhase = !ready ? 'connecting' : speaking ? 'speaking' : 'listening';
    const next = { phase, hearing: phase === 'listening' && hearing };
    if (status?.phase === next.phase && status.hearing === next.hearing) return;
    status = next;
    callbacks.onStatus(next);
  };

  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        if (socket.readyState === OPEN) socket.send(stopMessage());
        socket.close();
      } catch {
        // Already gone.
      }
      socket = null;
    }
    for (const track of stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    stream = null;
    for (const node of [capture, playback]) {
      if (!node) continue;
      node.port.onmessage = null;
      node.disconnect();
    }
    capture = playback = null;
    source?.disconnect();
    source = null;
    void context?.close().catch(() => {});
    context = null;
    publishLevel(0);
  };

  const end = (details: Omit<LiveEnd, 'beforeReady'>) => {
    if (ended) return;
    ended = true;
    release();
    callbacks.onEnd({ ...details, beforeReady: !everReady });
  };

  const fail = (message: string, code?: string) => end({ reason: 'failed', message, code });

  // The reply now in the speaker: its samples sent so far and its turn.
  let pushed = 0;
  let playingTurn: string | undefined;
  let newReply = true;

  const silence = () => {
    playback?.port.postMessage({ type: 'flush' });
    speaking = false;
    newReply = true;
    callbacks.onPlayback?.(null);
    publishLevel(0);
  };

  const onServerMessage = (message: ServerMessage) => {
    if (message.type === 'state') {
      if (message.state === 'closed') {
        fail(CLOSE_REASONS[message.reason ?? ''] ?? 'The server closed the session.');
        return;
      }
      ready = message.state === 'ready';
      if (ready) {
        everReady = true;
        if (timer) clearTimeout(timer);
        timer = null;
      } else {
        hearing = false;
      }
      // A new connection starts no reply half way through.
      if (message.state === 'reconnecting') replying = muted = false;
      report();
      return;
    }
    if (message.type === 'error') {
      fail(message.message, message.code);
      return;
    }
    if (message.type === 'interrupted') {
      silence();
      replying = muted = false;
      replyTurn = undefined;
    } else if (message.type === 'turn_complete') {
      // Its audio may still be playing; the next audio belongs to a new reply.
      newReply = true;
      replying = muted = false;
      replyTurn = undefined;
    } else {
      if (muted && replyTurn !== undefined && message.turnId !== replyTurn) {
        muted = replying = false;
      }
      if (message.type !== 'transcript' || message.role === 'assistant') {
        replying = true;
        replyTurn = message.turnId;
        if (!newReply) playingTurn ??= message.turnId;
      }
    }
    callbacks.onMessage(message);
    report();
  };

  const onAudio = (pcm: ArrayBuffer) => {
    replying = true;
    if (muted || !playback || !pcm.byteLength) return;
    if (newReply) {
      newReply = false;
      pushed = 0;
      playingTurn = replyTurn;
    }
    pushed += pcm.byteLength >> 1;
    playback.port.postMessage({ type: 'audio', pcm }, [pcm]);
    speaking = true;
    report();
  };

  const onMicChunk = (pcm: ArrayBuffer, level: number) => {
    // While reconnecting, the server holds recent audio for the new connection.
    if (ended || !everReady || socket?.readyState !== OPEN) return;
    // Late audio is useless in a conversation: drop it rather than queue it.
    if (socket.bufferedAmount <= MAX_BUFFERED_BYTES) socket.send(pcm);
    if (speaking || !ready) return;
    publishLevel(level * 7);
    const now = Date.now();
    if (level > HEARING_RMS) lastHeard = now;
    hearing = now - lastHeard < HEARING_HOLD_MS;
    report();
  };

  const connect = () => {
    const ws = new WebSocket(liveVoiceUrl(), buildWsProtocols());
    socket = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () =>
      ws.send(startMessage(options.history, options.adultConfirmed, options.webSearch));
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        onAudio(event.data as ArrayBuffer);
        return;
      }
      const message = parseServerMessage(event.data);
      if (message) onServerMessage(message);
    };
    ws.onerror = () => fail('Could not reach the live voice service.');
    ws.onclose = () => fail('The live voice connection closed.');
    timer = setTimeout(() => fail('Live voice took too long to start.'), READY_TIMEOUT_MS);
  };

  const open = async () => {
    // Everything up to the first await runs inside the user's click.
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    context = ctx;
    void ctx.resume().catch(() => {});
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone not supported in this browser.');
    }
    const microphone = navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then(
        (granted) => {
          // Permission can arrive after the user has already given up.
          if (ended) granted.getTracks().forEach((track) => track.stop());
          else stream = granted;
          return granted;
        },
        () => {
          throw new Error('Microphone access denied.');
        },
      );
    await Promise.all([
      microphone,
      ctx.audioWorklet.addModule(workletUrl('pcm-capture')),
      ctx.audioWorklet.addModule(workletUrl('pcm-playback')),
    ]);
    if (ended || !stream) return;
    void ctx.resume().catch(() => {});

    playback = new AudioWorkletNode(ctx, 'pcm-playback', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    playback.port.onmessage = ({ data }) => {
      if (data.type === 'level') {
        speaking = true;
        publishLevel(data.level * 4);
        if (playingTurn !== undefined && pushed > 0) {
          const fraction = 1 - Math.min(data.remaining ?? 0, pushed) / pushed;
          callbacks.onPlayback?.({ turnId: playingTurn, fraction });
        }
      } else if (data.type === 'drained') {
        speaking = false;
        publishLevel(0);
        callbacks.onPlayback?.(null);
      }
      report();
    };
    playback.connect(ctx.destination);

    capture = new AudioWorkletNode(ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    capture.port.onmessage = ({ data }) => onMicChunk(data.pcm, data.level);
    source = ctx.createMediaStreamSource(stream);
    source.connect(capture);
    // The node only runs while connected to the output; it writes silence.
    capture.connect(ctx.destination);

    for (const track of stream.getTracks()) {
      track.onended = () => fail('The microphone was disconnected.');
    }
    connect();
  };

  open().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
  // After the caller has the session in hand.
  queueMicrotask(report);

  return {
    sendText: (text) => {
      if (ended || !everReady || socket?.readyState !== OPEN) return false;
      socket.send(textMessage(text));
      return true;
    },
    flush: () => {
      if (ended) return;
      silence();
      // The rest of this reply may still be on its way.
      if (replying) muted = true;
      report();
    },
    stop: () => end({ reason: 'stopped' }),
  };
}
