import type { FinishReason, ResearchEvent, SSEEvent, TokenUsage } from '../types';
import { getBase, authHeaders } from './api';
import { timeZoneHeaders } from './timezone';

/**
 * Read a server-sent event stream.
 *
 * Network chunks can split the stream anywhere, including between an `event:`
 * line and its `data:` line, so parser state lives across reads. An event is
 * dispatched at the blank line that ends it (or at the end of the stream).
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName: string | undefined;
  let dataLines: string[] = [];

  /** Consume one line; returns a finished event when the line completes one. */
  const takeLine = (raw: string): SSEEvent | undefined => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') {
      const finished = dataLines.length
        ? { event: eventName, data: dataLines.join('\n') }
        : undefined;
      eventName = undefined;
      dataLines = [];
      return finished;
    }
    const colon = line.indexOf(':');
    if (colon === 0) return undefined; // comment / keep-alive
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value.trim();
    else if (field === 'data') dataLines.push(value);
    return undefined;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop() || '';
      // At the end of the stream, an extra blank line flushes the last event.
      if (done) lines.push('');

      for (const line of lines) {
        const finished = takeLine(line);
        if (!finished) continue;
        if (finished.data === '[DONE]') return;
        yield finished;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Tutor chat ────────────────────────────────────────────────────────

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Base64 image data, without the `data:` URL prefix. */
  images?: string[];
}

export interface TutorChatRequest {
  model: string;
  messages: TutorMessage[];
  adultConfirmed: boolean;
}

export type TutorEvent =
  | { type: 'meta'; model: string; provider: 'gemini' | 'local' }
  | { type: 'delta'; text: string }
  | { type: 'notice'; code: string; message: string }
  /** A settings change the tutor proposes; the user decides. */
  | { type: 'action'; setting: string; value: string }
  | { type: 'done'; finishReason: FinishReason; usage?: TokenUsage }
  | { type: 'error'; code: string; message: string; retryable: boolean };

type TutorError = Extract<TutorEvent, { type: 'error' }>;

const NETWORK_ERROR: TutorError = {
  type: 'error',
  code: 'network',
  message: 'Could not reach the app server. Check that it is running, then retry.',
  retryable: true,
};

const CUT_OFF_ERROR: TutorError = {
  type: 'error',
  code: 'network',
  message: 'The reply was cut off before it finished.',
  retryable: true,
};

async function errorFromResponse(response: Response): Promise<TutorError> {
  let detail: unknown;
  try {
    detail = ((await response.json()) as { detail?: unknown })?.detail;
  } catch {
    // Not a JSON error body.
  }
  const info = detail && typeof detail === 'object'
    ? (detail as { code?: unknown; message?: unknown })
    : undefined;
  const message =
    typeof info?.message === 'string' && info.message
      ? info.message
      : typeof detail === 'string' && detail
        ? detail
        : `The server could not answer (HTTP ${response.status}).`;
  return {
    type: 'error',
    code: typeof info?.code === 'string' ? info.code : 'internal',
    message,
    retryable: response.status === 429 || response.status >= 500,
  };
}

function parseTutorEvent({ event, data }: SSEEvent): TutorEvent | undefined {
  let payload: any;
  try {
    payload = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object') return undefined;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');

  switch (event) {
    case 'meta':
      return { type: 'meta', model: text(payload.model), provider: payload.provider };
    case 'delta':
      return { type: 'delta', text: text(payload.text) };
    case 'notice':
      return { type: 'notice', code: text(payload.code), message: text(payload.message) };
    case 'action':
      return { type: 'action', setting: text(payload.setting), value: text(payload.value) };
    case 'done':
      return {
        type: 'done',
        finishReason:
          payload.finish_reason === 'length' || payload.finish_reason === 'blocked'
            ? payload.finish_reason
            : 'stop',
        usage: payload.usage ?? undefined,
      };
    case 'error':
      return {
        type: 'error',
        code: text(payload.code) || 'internal',
        message: text(payload.message) || 'Something went wrong while answering.',
        retryable: payload.retryable === true,
      };
    default:
      return undefined;
  }
}

/**
 * Stream one tutor reply from POST /v1/tutor/chat.
 *
 * Always ends with exactly one `done` or `error` event, including for HTTP and
 * network failures and for streams that stop early. The only thing thrown is
 * the AbortError of a request the caller cancelled.
 */
export async function* streamTutorChat(
  request: TutorChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<TutorEvent> {
  try {
    const response = await fetch(`${getBase()}/v1/tutor/chat`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', ...timeZoneHeaders() }),
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      yield await errorFromResponse(response);
      return;
    }
    if (!response.body) {
      yield CUT_OFF_ERROR;
      return;
    }

    let started = false;
    try {
      for await (const raw of readSSE(response.body)) {
        const event = parseTutorEvent(raw);
        if (!event) continue;
        started = true;
        yield event;
        if (event.type === 'done' || event.type === 'error') return;
      }
    } catch (err) {
      if (signal?.aborted || !started) throw err;
      yield CUT_OFF_ERROR;
      return;
    }
    yield CUT_OFF_ERROR;
  } catch (err) {
    if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') throw err;
    yield NETWORK_ERROR;
  }
}

// ── Deep Research ─────────────────────────────────────────────────────

export async function* streamResearch(
  query: string,
  model?: string,
  signal?: AbortSignal,
): AsyncGenerator<ResearchEvent> {
  // /api/research is mounted at the server root — strip any trailing /v1
  // from the base so configurations like "http://host:8000/v1" still resolve.
  const base = getBase().replace(/\/v1\/?$/, '');
  const response = await fetch(`${base}/api/research`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, ...(model ? { model } : {}) }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Research request failed: ${response.status}`);
  }

  for await (const { data } of readSSE(response.body!)) {
    let parsed: ResearchEvent;
    try {
      parsed = JSON.parse(data) as ResearchEvent;
    } catch {
      continue; // skip malformed chunks
    }
    yield parsed;
    if (parsed.type === 'done') return;
  }
}
