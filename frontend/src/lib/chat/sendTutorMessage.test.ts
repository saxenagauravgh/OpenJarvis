import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

type Reply = (signal: AbortSignal) => Response | Promise<Response>;

const encoder = new TextEncoder();
const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const delta = (text: string) => frame('delta', { text });
const done = (finish_reason = 'stop') =>
  frame('done', {
    finish_reason,
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  });
const failure = frame('error', { code: 'busy', message: 'The model is busy.', retryable: true });
const sse =
  (...frames: string[]): Reply =>
  () =>
    new Response(frames.join(''));

let replies: Reply[];
let requests: any[];

beforeEach(() => {
  vi.resetModules();
  replies = [];
  requests = [];
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith('/v1/tutor/chat')) return new Response('', { status: 404 });
      requests.push(JSON.parse(init.body as string));
      return replies.shift()!(init.signal!);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  const { useAppStore } = await import('../store');
  const chat = await import('./sendTutorMessage');
  useAppStore.getState().confirmAdult();
  const send = (content: string, extra: Record<string, unknown> = {}) =>
    chat.sendTutorMessage({
      conversationId: useAppStore.getState().activeId,
      model: 'gemini-2.5-flash',
      content,
      ...extra,
    });
  const messages = () => useAppStore.getState().messages;
  return { store: useAppStore, chat, send, messages };
}

const file = {
  id: 'att1',
  name: 'q.jpg',
  mime: 'image/jpeg',
  size: 3,
  kind: 'image' as const,
};

describe('sendTutorMessage', () => {
  it('streams a reply and records how it was answered', async () => {
    replies.push(
      sse(
        frame('meta', { model: 'gemini-2.5-flash', provider: 'gemini' }),
        delta('F = '),
        delta('ma'),
        done(),
      ),
    );
    const { store, send, messages } = await load();

    const reply = await send('Second law?');

    expect(requests[0]).toEqual({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Second law?' }],
      adultConfirmed: true,
      webSearch: 'auto',
      team: false,
    });
    expect(messages()).toHaveLength(2);
    expect(messages()[1]).toMatchObject({
      role: 'assistant',
      content: 'F = ma',
      finishReason: 'stop',
      usage: { total_tokens: 7 },
      telemetry: { engine: 'gemini', model_id: 'gemini-2.5-flash' },
    });
    expect(messages()[1].error).toBeUndefined();
    expect(reply?.content).toBe('F = ma');
    expect(store.getState().streamState.isStreaming).toBe(false);
    const saved = JSON.parse(localStorage.getItem('openjarvis-conversations')!);
    expect(Object.values<any>(saved.conversations)[0].messages[1].content).toBe('F = ma');
  });

  it('stores an error apart from the text and does not resend it', async () => {
    replies.push(sse(failure), sse(delta('ok'), done()));
    const { store, send, messages } = await load();

    const reply = await send('q1');

    expect(messages()[1]).toMatchObject({
      content: '',
      error: { code: 'busy', message: 'The model is busy.', retryable: true },
    });
    expect(reply?.error?.code).toBe('busy');
    expect(store.getState().streamState.isStreaming).toBe(false);

    await send('q2');

    expect(requests[1].messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'user', content: 'q2' },
    ]);
  });

  it('keeps partial text beside the error when a stream is cut off', async () => {
    replies.push(sse(delta('partial')));
    const { send, messages } = await load();

    await send('q');

    expect(messages()[1]).toMatchObject({ content: 'partial', error: { code: 'network' } });
  });

  it('treats an empty reply as an error', async () => {
    replies.push(sse(done()));
    const { send } = await load();

    expect((await send('q'))?.error).toMatchObject({ code: 'internal', retryable: true });
  });

  it('does not call a blocked reply an error', async () => {
    replies.push(sse(done('blocked')));
    const { send } = await load();

    const reply = await send('q');

    expect(reply?.finishReason).toBe('blocked');
    expect(reply?.error).toBeUndefined();
  });

  it('records a fallback notice on the message', async () => {
    replies.push(
      sse(
        frame('notice', { code: 'fallback_local', message: 'Using the model on this computer.' }),
        frame('meta', { model: 'qwen2.5:3b', provider: 'local' }),
        delta('hi'),
        done(),
      ),
    );
    const { send, messages } = await load();

    await send('q');

    expect(messages()[1]).toMatchObject({
      notices: [{ code: 'fallback_local', message: 'Using the model on this computer.' }],
      telemetry: { engine: 'local', model_id: 'qwen2.5:3b' },
    });
  });

  it('continues a reply that reached the length limit', async () => {
    replies.push(sse(delta('step 1'), done('length')), sse(delta('step 2'), done()));
    const { store, chat, send, messages } = await load();

    expect((await send('q'))?.finishReason).toBe('length');
    await chat.continueTutorMessage(store.getState().activeId!, 'gemini-2.5-flash');

    expect(requests[1].messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'step 1' },
      { role: 'user', content: 'Continue exactly where you stopped.' },
    ]);
    expect(messages()).toHaveLength(4);
  });

  it('keeps files with the conversation and sends their ids on every turn', async () => {
    replies.push(sse(delta('a1'), done('length')), sse(delta('a2'), done()));
    const { store, chat, send, messages } = await load();

    await send('read this', { files: [{ ...file, warning: 'Only 3 pages read.' }] });
    await chat.continueTutorMessage(store.getState().activeId!, 'gemini-2.5-flash');

    expect(requests[0].messages).toEqual([
      { role: 'user', content: 'read this', files: ['att1'] },
    ]);
    expect(requests[1].messages).toEqual([
      { role: 'user', content: 'read this', files: ['att1'] },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'Continue exactly where you stopped.' },
    ]);
    expect(messages()[0].files).toEqual([file]);
    const saved = JSON.parse(localStorage.getItem('openjarvis-conversations')!);
    expect(Object.values<any>(saved.conversations)[0].messages[0].files).toEqual([file]);
  });

  it('retries a failed reply in place, with its files, after a relaunch', async () => {
    replies.push(sse(failure), sse(delta('answer'), done()));
    const first = await load();
    const failed = await first.send('read this', { files: [file] });
    const conversationId = first.store.getState().activeId!;

    vi.resetModules(); // relaunch
    const { chat, messages } = await load();
    const result = await chat.retryTutorMessage(conversationId, failed!.id, 'gemini-2.5-flash');

    expect(result.status).toBe('sent');
    expect(requests[1].messages).toEqual([
      { role: 'user', content: 'read this', files: ['att1'] },
    ]);
    expect(messages().map((m) => m.content)).toEqual(['read this', 'answer']);
    expect(messages()[1].error).toBeUndefined();
  });

  it('does not retry an older image question, whose images were not kept', async () => {
    const { store, chat, messages } = await load();
    const conversationId = store.getState().createConversation('gemini-2.5-flash');
    store.getState().addMessage(conversationId, {
      id: 'q',
      role: 'user',
      content: 'read this',
      timestamp: 0,
      attachments: ['q.jpg'],
    });
    store.getState().addMessage(conversationId, {
      id: 'r',
      role: 'assistant',
      content: '',
      timestamp: 0,
      error: { code: 'busy', message: 'The model is busy.', retryable: true },
    });

    const result = await chat.retryTutorMessage(conversationId, 'r', 'gemini-2.5-flash');

    expect(result.status).toBe('images-missing');
    expect(requests).toHaveLength(0);
    expect(messages()[1].error).toBeDefined();
  });

  it('records a missing attachment notice', async () => {
    replies.push(
      sse(
        frame('notice', { code: 'attachment_missing', message: 'q.jpg is no longer available.' }),
        delta('hi'),
        done(),
      ),
    );
    const { send } = await load();

    expect((await send('q', { files: [file] }))?.notices).toEqual([
      { code: 'attachment_missing', message: 'q.jpg is no longer available.' },
    ]);
  });

  it('keeps what arrived when the user stops, without an error', async () => {
    replies.push(
      (signal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(delta('so far')));
              signal.addEventListener('abort', () =>
                controller.error(new DOMException('Aborted', 'AbortError')),
              );
            },
          }),
        ),
    );
    const { store, chat, send, messages } = await load();

    const pending = send('q');
    await vi.waitFor(() => expect(store.getState().streamState.content).toBe('so far'));
    chat.abortTutorStream();
    const reply = await pending;

    expect(reply).toMatchObject({ content: 'so far', stopped: true });
    expect(messages()[1].error).toBeUndefined();
    expect(store.getState().streamState.isStreaming).toBe(false);
  });

  it('asks for confirmation again when the server refuses it', async () => {
    replies.push(() =>
      Response.json(
        { detail: { code: 'age_unconfirmed', message: 'Confirm your age.' } },
        { status: 403 },
      ),
    );
    const { store, send } = await load();

    await send('q');

    expect(store.getState().adultConfirmed).toBe(false);
  });

  it('sends nothing while another reply is streaming', async () => {
    const { store, send } = await load();
    store.getState().setStreamState({ isStreaming: true });

    expect(await send('q')).toBeNull();
    expect(requests).toHaveLength(0);
  });
});

describe('web search and the expert team', () => {
  const asked = () => requests.map(({ webSearch, team }) => [webSearch, team]);
  const source = { title: 'NASA', url: 'https://nasa.gov/moon' };

  it('builds the request from the settings, ignoring the Web pill for speech', async () => {
    replies.push(...Array.from({ length: 3 }, () => sse(delta('a'), done())));
    const { store, send } = await load();
    store.getState().updateSettings({ webAlways: true, expertTeam: true });

    await send('typed');
    await send('spoken', { spoken: true });
    store.getState().updateSettings({ webSearchEnabled: false });
    await send('off');

    expect(asked()).toEqual([
      ['always', true],
      ['auto', true],
      ['off', true],
    ]);
  });

  it('keeps choices on Retry; Continue neither re-searches nor re-runs the team', async () => {
    replies.push(
      sse(failure),
      sse(delta('a'), done('length')),
      sse(delta('b'), done('length')),
      sse(delta('c'), done()),
    );
    const { store, chat, send, messages } = await load();
    store.getState().updateSettings({ webAlways: true, expertTeam: true });
    const failed = await send('q');
    store.getState().updateSettings({ webAlways: false, expertTeam: false });
    const conversationId = store.getState().activeId!;

    await chat.retryTutorMessage(conversationId, failed!.id, 'gemini-2.5-flash');
    await chat.continueTutorMessage(conversationId, 'gemini-2.5-flash');
    // The Settings switch still wins over an earlier choice.
    store.getState().updateSettings({ webSearchEnabled: false });
    await chat.continueTutorMessage(conversationId, 'gemini-2.5-flash');

    expect(asked()).toEqual([
      ['always', true],
      ['always', true],
      ['auto', false],
      ['off', false],
    ]);
    expect(messages()[2].choices).toEqual({ web: false, team: false });
  });

  it('shows progress while streaming and keeps it on the finished reply', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    replies.push(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              stream = controller;
            },
          }),
        ),
      sse(delta('next'), done()),
    );
    const { send, messages } = await load();
    const push = (text: string) => stream.enqueue(encoder.encode(text));
    const member = (status: string) =>
      frame('team', { member: 'physics', label: 'Physics expert', status });

    const pending = send('q');
    await vi.waitFor(() => expect(stream).toBeDefined());
    push(member('working') + frame('searching', { query: 'moon gravity' }));
    await vi.waitFor(() => expect(messages()[1].searching).toBe('moon gravity'));
    expect(messages()[1].team).toEqual([
      { member: 'physics', label: 'Physics expert', status: 'working' },
    ]);

    push(frame('sources', { items: [source] }));
    await vi.waitFor(() => expect(messages()[1].webSources).toEqual([source]));
    expect(messages()[1].searching).toBeUndefined();

    push(frame('searching', { query: 'again' }) + delta('1.62'));
    await vi.waitFor(() => expect(messages()[1].content).toBe('1.62'));
    expect(messages()[1].searching).toBeUndefined();

    push(frame('sources', { items: [source] }) + member('done') + done());
    stream.close();
    await pending;

    expect(messages()[1]).toMatchObject({
      content: '1.62',
      webSearches: ['moon gravity', 'again'],
      webSources: [source],
      team: [{ member: 'physics', label: 'Physics expert', status: 'done' }],
    });
    expect(messages()[1].searching).toBeUndefined();

    await send('q2');
    expect(requests[1].messages[1]).toEqual({ role: 'assistant', content: '1.62' });
  });

  it('records the notices for a failed search or an unavailable team', async () => {
    replies.push(
      sse(
        frame('notice', { code: 'search_failed', message: 'The search failed.' }),
        frame('notice', { code: 'team_unavailable', message: 'The team is unavailable.' }),
        delta('hi'),
        done(),
      ),
    );
    const { send } = await load();

    expect((await send('q'))?.notices?.map((n) => n.code)).toEqual([
      'search_failed',
      'team_unavailable',
    ]);
  });

  it('forgets a search that was still running when the app closed', async () => {
    const first = await load();
    const conversationId = first.store.getState().createConversation('gemini-2.5-flash');
    first.store.getState().addMessage(conversationId, {
      id: 'r',
      role: 'assistant',
      content: '',
      timestamp: 0,
      live: true,
      searching: 'x',
      webSearches: ['x'],
    });

    vi.resetModules(); // relaunch
    const { messages } = await load();

    expect(messages()[0].searching).toBeUndefined();
    expect(messages()[0].webSearches).toEqual(['x']);
    expect(localStorage.getItem('openjarvis-conversations')).not.toContain('"searching"');
  });
});
