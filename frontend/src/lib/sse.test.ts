import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSSE, streamResearch, streamTutorChat, type TutorEvent } from './sse';

const encoder = new TextEncoder();

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

const request = {
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user' as const, content: 'hi' }],
  adultConfirmed: true,
  webSearch: 'auto' as const,
  team: false,
};

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const done = frame('done', {
  finish_reason: 'stop',
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
});

function serve(chunks: string[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(streamOf(chunks))));
}

const run = () => collect<TutorEvent>(streamTutorChat(request));

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('readSSE', () => {
  it('keeps the event name when event and data arrive in different chunks', async () => {
    const events = await collect(
      readSSE(streamOf(['event: delta\n', 'data: {"text":"a"}\n', '\n'])),
    );

    expect(events).toEqual([{ event: 'delta', data: '{"text":"a"}' }]);
  });

  it('survives a split at every byte, including inside a character', async () => {
    const bytes = encoder.encode('event: delta\ndata: π ≈ 3\n\ndata: plain\n\n');

    for (let at = 1; at < bytes.length; at += 1) {
      const events = await collect(
        readSSE(streamOf([bytes.slice(0, at), bytes.slice(at)])),
      );
      expect(events).toEqual([
        { event: 'delta', data: 'π ≈ 3' },
        { event: undefined, data: 'plain' },
      ]);
    }
  });

  it('handles CRLF, comments, multi-line data and a missing final blank line', async () => {
    const events = await collect(
      readSSE(streamOf([': ping\r\n\r\nevent: note\r\ndata: one\r\ndata: two\r\n\r\ndata: last'])),
    );

    expect(events).toEqual([
      { event: 'note', data: 'one\ntwo' },
      { event: undefined, data: 'last' },
    ]);
  });

  it('stops at [DONE]', async () => {
    const events = await collect(
      readSSE(streamOf(['data: a\n\ndata: [DONE]\n\ndata: b\n\n'])),
    );

    expect(events.map((e) => e.data)).toEqual(['a']);
  });
});

describe('streamTutorChat', () => {
  it('posts the contract body to the tutor route', async () => {
    serve([done]);

    await run();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/v1/tutor/chat');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(request);
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('reads typed events from a stream split between lines', async () => {
    const all =
      frame('meta', { model: 'qwen2.5:3b', provider: 'local' }) +
      frame('notice', { code: 'fallback_local', message: 'Using the local model.' }) +
      frame('delta', { text: 'Hello' }) +
      done;
    serve(all.split(/(?<=\n)/));

    expect(await run()).toEqual([
      { type: 'meta', model: 'qwen2.5:3b', provider: 'local' },
      { type: 'notice', code: 'fallback_local', message: 'Using the local model.' },
      { type: 'delta', text: 'Hello' },
      {
        type: 'done',
        finishReason: 'stop',
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      },
    ]);
  });

  it('ends at the first done or error', async () => {
    const failure = { code: 'quota', message: 'Quota used up.', retryable: false };
    serve([frame('error', failure) + frame('delta', { text: 'late' }) + done]);

    expect(await run()).toEqual([{ type: 'error', ...failure }]);
  });

  it('reports a stream that ends without done or error', async () => {
    serve([frame('delta', { text: 'half' })]);

    const events = await run();

    expect(events.map((e) => e.type)).toEqual(['delta', 'error']);
    expect(events[1]).toMatchObject({ code: 'network', retryable: true });
  });

  it('reports a connection that drops part way', async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(encoder.encode(frame('delta', { text: 'a' })));
        else controller.error(new TypeError('network lost'));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

    expect((await run()).map((e) => e.type)).toEqual(['delta', 'error']);
  });

  it('turns the age_unconfirmed refusal into an error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: { code: 'age_unconfirmed', message: 'Confirm you are 18 or older.' } },
          { status: 403 },
        ),
      ),
    );

    expect(await run()).toEqual([
      {
        type: 'error',
        code: 'age_unconfirmed',
        message: 'Confirm you are 18 or older.',
        retryable: false,
      },
    ]);
  });

  it('describes other HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));

    expect(await run()).toEqual([
      {
        type: 'error',
        code: 'internal',
        message: 'The server could not answer (HTTP 500).',
        retryable: true,
      },
    ]);
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    expect(await run()).toMatchObject([{ type: 'error', code: 'network', retryable: true }]);
  });

  it('throws, rather than reporting, when the caller cancels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    );

    await expect(run()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('streamResearch', () => {
  it('reads events from split chunks and stops at done', async () => {
    serve([
      'data: {"type":"synth',
      'esis","text":"a"}\n\ndata: not json\n\ndata: {"type":"done"}\n\n',
      'data: {"type":"synthesis","text":"late"}\n\n',
    ]);

    expect(await collect(streamResearch('q'))).toEqual([
      { type: 'synthesis', text: 'a' },
      { type: 'done' },
    ]);
  });
});

describe('web search and expert team events', () => {
  it('reads searching, sources and team progress', async () => {
    serve([
      frame('searching', { query: 'g on the Moon' }),
      frame('sources', {
        items: [
          { title: 'NASA', url: 'https://nasa.gov/moon' },
          { title: 'Bad', url: 'javascript:alert(1)' },
        ],
      }),
      frame('team', { member: 'physics', label: 'Physics expert', status: 'working' }),
      done,
    ]);

    expect((await run()).slice(0, 3)).toEqual([
      { type: 'searching', query: 'g on the Moon' },
      { type: 'sources', items: [{ title: 'NASA', url: 'https://nasa.gov/moon' }] },
      { type: 'team', member: 'physics', label: 'Physics expert', status: 'working' },
    ]);
  });

  it('ignores events it cannot use', async () => {
    serve([
      frame('searching', { query: '' }),
      frame('sources', { items: [{ title: 'x', url: 'file:///etc/passwd' }] }),
      frame('sources', { items: 'none' }),
      frame('team', { member: 'biology', label: 'x', status: 'working' }),
      frame('team', { member: 'maths', label: 'x', status: 'asleep' }),
      done,
    ]);

    expect((await run()).map((event) => event.type)).toEqual(['done']);
  });

  it('sends the web search and team choices', async () => {
    serve([done]);
    await collect(streamTutorChat({ ...request, webSearch: 'always', team: true }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(init!.body as string)).toMatchObject({ webSearch: 'always', team: true });
  });
});
