/** The live session with stand-ins for the microphone, audio and socket. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

class FakeSocket {
  static last: FakeSocket | undefined;
  readyState = 0;
  bufferedAmount = 0;
  binaryType = '';
  sent: any[] = [];
  closed = false;
  onopen: null | (() => void) = null;
  onmessage: null | ((event: { data: unknown }) => void) = null;
  onclose: null | (() => void) = null;
  onerror: null | (() => void) = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: unknown) {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({
      data: message instanceof ArrayBuffer ? message : JSON.stringify(message),
    });
  }
  ready() {
    this.open();
    this.receive({ type: 'state', state: 'ready' });
  }
}

let track: { stop: ReturnType<typeof vi.fn>; onended: null | (() => void) };
let nodes: Record<string, any>;
let contextClosed: boolean;
let microphone: () => Promise<unknown>;
let order: string[];

beforeEach(() => {
  vi.resetModules();
  FakeSocket.last = undefined;
  track = { stop: vi.fn(), onended: null };
  nodes = {};
  contextClosed = false;
  order = [];
  microphone = async () => ({ getTracks: () => [track] });
  const connectable = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost:8000' },
    AudioContext: class {
      destination = {};
      audioWorklet = { addModule: vi.fn(async () => {}) };
      constructor() {
        order.push('context');
      }
      resume = async () => void order.push('resume');
      createMediaStreamSource = connectable;
      close = async () => {
        contextClosed = true;
      };
    },
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn((constraints) => {
        order.push('microphone');
        expect(constraints.audio).toEqual({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        return microphone();
      }),
    },
  });
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage: vi.fn(), onmessage: null };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor(_context: unknown, name: string) {
        nodes[name] = this;
      }
    },
  );
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const last = (list: unknown[]) => list[list.length - 1];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function begin() {
  const { useAppStore } = await import('../store');
  const { startLiveTalk } = await import('./live-talk');
  useAppStore.getState().confirmAdult();
  const handlers = {
    onStatus: vi.fn(),
    onNotice: vi.fn(),
    onFallback: vi.fn(),
    onEnd: vi.fn(),
  };
  const talk = startLiveTalk(handlers);
  const atClick = [...order];
  await settle();
  return { talk, handlers, store: useAppStore, atClick, socket: () => FakeSocket.last! };
}

const released = () => {
  expect(track.stop).toHaveBeenCalled();
  expect(contextClosed).toBe(true);
};

describe('fallback to the Standard voice', () => {
  const expectFallback = (handlers: Awaited<ReturnType<typeof begin>>['handlers']) => {
    expect(handlers.onFallback).toHaveBeenCalledTimes(1);
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onNotice).toHaveBeenCalledTimes(1);
    expect(handlers.onNotice.mock.calls[0][0]).toContain('Standard voice');
  };

  it('happens when the microphone is refused', async () => {
    microphone = async () => {
      throw new Error('NotAllowedError');
    };
    const { handlers, socket, store } = await begin();
    expectFallback(handlers);
    expect(socket()).toBeUndefined();
    expect(contextClosed).toBe(true);
    expect(store.getState().conversations).toEqual([]);
  });

  it('happens on a server error before ready', async () => {
    const { handlers, socket } = await begin();
    socket().open();
    socket().receive({ type: 'error', code: 'no_key', message: 'No key.', retryable: false });
    socket()?.onclose?.();
    expectFallback(handlers);
    expect(socket().closed).toBe(true);
    released();
  });

  it('happens when the connection drops before ready', async () => {
    const { handlers, socket } = await begin();
    socket().onclose!();
    expectFallback(handlers);
    released();
  });

  it('happens when the server never becomes ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { useAppStore } = await import('../store');
    const { startLiveTalk } = await import('./live-talk');
    useAppStore.getState().confirmAdult();
    const onFallback = vi.fn();
    startLiveTalk({ onFallback, onStatus: vi.fn(), onNotice: vi.fn(), onEnd: vi.fn() });
    await vi.advanceTimersByTimeAsync(20000);
    expect(onFallback).toHaveBeenCalledTimes(1);
    released();
  });

  it('does not happen after ready', async () => {
    const { handlers, socket } = await begin();
    socket().ready();
    socket().onclose!();
    expect(handlers.onFallback).not.toHaveBeenCalled();
    expect(handlers.onNotice.mock.calls[0][0]).toContain('Live voice ended');
    released();
  });

  it('does not happen when the user stops first, even before permission', async () => {
    let grant!: (stream: unknown) => void;
    microphone = () => new Promise((resolve) => (grant = resolve));
    const { talk, handlers, socket } = await begin();
    talk.stop();
    grant({ getTracks: () => [track] });
    await settle();
    expect(handlers.onFallback).not.toHaveBeenCalled();
    expect(handlers.onNotice).not.toHaveBeenCalled();
    expect(socket()).toBeUndefined();
    released();
  });

  it('asks for the age confirmation again instead', async () => {
    const { handlers, socket, store } = await begin();
    socket().open();
    socket().receive({ type: 'error', code: 'age_unconfirmed', message: 'x', retryable: false });
    expect(handlers.onFallback).not.toHaveBeenCalled();
    expect(store.getState().adultConfirmed).toBe(false);
  });
});

describe('a live session', () => {
  it('starts audio inside the click and sends the history first', async () => {
    const { useAppStore } = await import('../store');
    const id = useAppStore.getState().createConversation('m');
    useAppStore.getState().addMessage(id, { id: 'q', role: 'user', content: 'Earlier', timestamp: 0 });
    const { socket, atClick } = await begin();
    expect(atClick).toEqual(['context', 'resume', 'microphone']);
    expect(socket().url).toBe('ws://localhost:8000/v1/voice/live');
    socket().open();
    expect(socket().sent).toEqual([
      {
        type: 'start',
        v: 1,
        adultConfirmed: true,
        history: [{ role: 'user', text: 'Earlier' }],
        webSearch: 'auto',
      },
    ]);
  });

  it('asks for no web search when it is switched off', async () => {
    const { useAppStore } = await import('../store');
    useAppStore.getState().updateSettings({ webSearchEnabled: false });
    const { socket } = await begin();
    socket().open();
    expect(socket().sent[0].webSearch).toBe('off');
  });

  it('saves a search and its sources on the answer', async () => {
    const { socket, store } = await begin();
    socket().ready();
    socket().receive({ type: 'searching', turnId: 1, query: 'moon gravity' });
    expect(store.getState().messages[0]).toMatchObject({
      role: 'assistant',
      searching: 'moon gravity',
    });
    const items = [{ title: 'NASA', url: 'https://nasa.gov/moon' }];
    socket().receive({ type: 'sources', turnId: 1, items });
    socket().receive({ type: 'transcript', turnId: 1, role: 'assistant', delta: '1.62.' });
    socket().receive({ type: 'turn_complete', turnId: 1 });
    const [reply] = store.getState().messages;
    expect(reply).toMatchObject({
      content: '1.62.',
      webSearches: ['moon gravity'],
      webSources: items,
    });
    expect(reply.searching).toBeUndefined();
  });

  it('sends microphone audio once ready, dropping it when backed up', async () => {
    const { socket } = await begin();
    const mic = () =>
      nodes['pcm-capture'].port.onmessage({ data: { pcm: new ArrayBuffer(960), level: 0.1 } });
    socket().open();
    mic();
    expect(socket().sent).toHaveLength(1);
    socket().receive({ type: 'state', state: 'ready' });
    mic();
    expect(socket().sent).toHaveLength(2);
    socket().bufferedAmount = 100000;
    mic();
    expect(socket().sent).toHaveLength(2);
  });

  it('saves the conversation, including typed messages', async () => {
    const { talk, socket, store } = await begin();
    expect(talk.sendText('too soon')).toBe(false);
    socket().ready();
    socket().receive({ type: 'transcript', turnId: 1, role: 'user', delta: 'What' });
    socket().receive({ type: 'transcript', turnId: 1, role: 'user', delta: ' is g?' });
    socket().receive({ type: 'transcript', turnId: 1, role: 'assistant', delta: '9.8.' });
    socket().receive({ type: 'turn_complete', turnId: 1 });
    expect(talk.sendText('Units?')).toBe(true);
    expect(last(socket().sent)).toEqual({ type: 'text', text: 'Units?' });
    const { messages, conversations } = store.getState();
    expect(messages.map((m) => m.content)).toEqual(['What is g?', '9.8.', 'Units?']);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toBe('What is g?');
    expect(store.getState().streamState.isStreaming).toBe(false);
  });

  it('keeps a silenced reply silent until the next one', async () => {
    const { talk, socket } = await begin();
    socket().ready();
    const played = () =>
      nodes['pcm-playback'].port.postMessage.mock.calls.map(([m]: any) => m.type);
    socket().receive(new ArrayBuffer(4));
    talk.flush();
    socket().receive(new ArrayBuffer(4));
    expect(played()).toEqual(['audio', 'flush']);
    socket().receive({ type: 'turn_complete', turnId: 1 });
    socket().receive(new ArrayBuffer(4));
    expect(played()).toEqual(['audio', 'flush', 'audio']);
    socket().receive({ type: 'interrupted', turnId: 2 });
    expect(last(played())).toBe('flush');
  });

  it('releases everything and says goodbye on stop', async () => {
    const { talk, socket, handlers } = await begin();
    socket().ready();
    talk.stop();
    talk.stop();
    expect(last(socket().sent)).toEqual({ type: 'stop' });
    expect(socket().closed).toBe(true);
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    released();
  });

  it('stops when the user changes chats, marking the reply stopped', async () => {
    const { socket, store, handlers } = await begin();
    socket().ready();
    socket().receive({ type: 'transcript', turnId: 1, role: 'assistant', delta: 'Half' });
    const first = store.getState().activeId!;
    store.getState().createConversation('m');
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    released();
    const saved = store.getState().conversations.find((c) => c.id === first)!;
    expect(saved.messages[0]).toMatchObject({ content: 'Half', stopped: true });
  });
});

describe('highlighting in live voice', () => {
  it('follows the spoken reply as it plays and clears afterwards', async () => {
    const { socket, store } = await begin();
    const { useTtsStore } = await import('../tts');
    socket().ready();
    socket().receive({
      type: 'transcript',
      turnId: 1,
      role: 'assistant',
      delta: 'Force equals mass times acceleration.',
    });
    socket().receive(new ArrayBuffer(4800)); // 2400 samples of reply audio
    const playback = nodes['pcm-playback'].port;
    playback.onmessage!({ data: { type: 'level', level: 0.2, remaining: 1200 } });

    const reply = last(store.getState().messages) as { id: string; role: string };
    expect(reply.role).toBe('assistant');
    expect(useTtsStore.getState().speakingId).toBe(reply.id);
    const caption = useTtsStore.getState().caption!;
    expect(caption.charIndex).toBeGreaterThan(0);
    expect(caption.charIndex).toBeLessThan(caption.text.length);

    playback.onmessage!({ data: { type: 'drained' } });
    expect(useTtsStore.getState().caption).toBeNull();
  });
});
