import { useAppStore, generateId } from '../store';
import { streamTutorChat } from '../sse';
import { fetchSavings } from '../api';
import { buildTutorHistory } from './history';
import { parseAction } from '../setting-actions';
import type {
  ChatAttachment,
  ChatMessage,
  FinishReason,
  MessageError,
  MessageNotice,
  TokenUsage,
} from '../../types';

export const CONTINUE_PROMPT = 'Continue exactly where you stopped.';

export interface SendTutorOptions {
  /** Conversation to send in; a new one is created when null. */
  conversationId: string | null;
  model: string;
  content: string;
  /** Uploaded files to send with the message. */
  files?: ChatAttachment[];
}

export type RetryResult =
  | { status: 'sent'; reply: ChatMessage }
  /** An earlier version sent images that were not kept, so it was not resent. */
  | { status: 'images-missing' }
  | { status: 'unavailable' };

let activeRun: AbortController | null = null;

/** Stop the reply being generated, if any. What has arrived is kept. */
export function abortTutorStream(): void {
  activeRun?.abort();
}

function conversationMessages(conversationId: string): ChatMessage[] {
  const conversation = useAppStore
    .getState()
    .conversations.find((c) => c.id === conversationId);
  return conversation?.messages ?? [];
}

/**
 * Add the user's message and stream the tutor's reply to it. Resolves with the
 * finished reply, or null if nothing was sent.
 */
export async function sendTutorMessage({
  conversationId,
  model,
  content,
  files = [],
}: SendTutorOptions): Promise<ChatMessage | null> {
  const store = useAppStore.getState();
  if (!content || !model || store.streamState.isStreaming) return null;

  const convId = conversationId || store.createConversation(model);
  const question: ChatMessage = {
    id: generateId(),
    role: 'user',
    content,
    timestamp: Date.now(),
    files: files.length
      ? files.map(({ id, name, mime, size, kind }) => ({ id, name, mime, size, kind }))
      : undefined,
  };
  store.addMessage(convId, question);

  return streamReply(convId, model, question);
}

/** Replace a failed reply, which must be the last message, with a new attempt. */
export async function retryTutorMessage(
  conversationId: string,
  messageId: string,
  model: string,
): Promise<RetryResult> {
  const store = useAppStore.getState();
  const messages = conversationMessages(conversationId);
  const failed = messages[messages.length - 1];
  const question = messages[messages.length - 2];
  if (
    !model ||
    store.streamState.isStreaming ||
    failed?.id !== messageId ||
    !failed.error ||
    question?.role !== 'user'
  ) {
    return { status: 'unavailable' };
  }
  if (question.attachments?.length && !question.files?.length) {
    return { status: 'images-missing' };
  }

  store.removeMessage(conversationId, failed.id);
  return { status: 'sent', reply: await streamReply(conversationId, model, question) };
}

/** Ask the tutor to carry on with a reply that hit the length limit. */
export function continueTutorMessage(
  conversationId: string,
  model: string,
): Promise<ChatMessage | null> {
  return sendTutorMessage({ conversationId, model, content: CONTINUE_PROMPT });
}

async function streamReply(
  convId: string,
  model: string,
  question: ChatMessage,
): Promise<ChatMessage> {
  const store = useAppStore.getState();

  // Built before the reply placeholder exists.
  const history = buildTutorHistory(conversationMessages(convId));

  const reply: ChatMessage = {
    id: generateId(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  };
  store.addMessage(convId, reply);

  const controller = new AbortController();
  activeRun = controller;
  const startTime = Date.now();
  const timer = setInterval(() => {
    if (activeRun === controller && !controller.signal.aborted) {
      store.setStreamState({ elapsedMs: Date.now() - startTime });
    }
  }, 100);

  store.setStreamState({
    conversationId: convId,
    isStreaming: true,
    phase: 'Generating...',
    elapsedMs: 0,
    activeToolCalls: [],
    content: '',
  });
  const preview = `${question.content.slice(0, 80)}${question.content.length > 80 ? '...' : ''}`;
  store.addLogEntry({
    timestamp: Date.now(),
    level: 'info',
    category: 'chat',
    message: `Request: "${preview}" → ${model}`,
  });

  let content = '';
  let usage: TokenUsage | undefined;
  let finishReason: FinishReason | undefined;
  let error: MessageError | undefined;
  let answeredBy = model;
  let provider: string | undefined;
  let ttftMs: number | undefined;
  let lastFlush = 0;
  const notices: MessageNotice[] = [];

  try {
    for await (const event of streamTutorChat(
      { model, messages: history, adultConfirmed: useAppStore.getState().adultConfirmed },
      controller.signal,
    )) {
      if (controller.signal.aborted) break;
      if (event.type === 'meta') {
        answeredBy = event.model || model;
        provider = event.provider;
      } else if (event.type === 'delta') {
        if (!event.text) continue;
        ttftMs ??= Date.now() - startTime;
        content += event.text;
        store.setStreamState({ content, phase: '' });
        const now = Date.now();
        if (now - lastFlush >= 80) {
          store.patchMessage(convId, reply.id, { content });
          lastFlush = now;
        }
      } else if (event.type === 'notice') {
        notices.push({ code: event.code, message: event.message });
        store.patchMessage(convId, reply.id, { content, notices: [...notices] });
      } else if (event.type === 'action') {
        const action = parseAction(event.setting, event.value);
        if (action) store.patchMessage(convId, reply.id, { content, action });
      } else if (event.type === 'done') {
        finishReason = event.finishReason;
        usage = event.usage;
      } else {
        error = { code: event.code, message: event.message, retryable: event.retryable };
      }
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      error = {
        code: 'internal',
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  } finally {
    clearInterval(timer);
  }

  const stopped = controller.signal.aborted && !finishReason && !error;
  if (!content && !error && !stopped && finishReason !== 'blocked') {
    error = {
      code: 'internal',
      message: 'No response was generated. Please try again.',
      retryable: true,
    };
  }
  const totalMs = Date.now() - startTime;
  const finished: Partial<ChatMessage> = {
    content,
    usage,
    finishReason,
    error,
    stopped: stopped || undefined,
    notices: notices.length ? notices : undefined,
    telemetry: {
      engine: provider,
      model_id: answeredBy,
      total_ms: totalMs,
      ttft_ms: ttftMs,
      tokens_per_sec: usage?.completion_tokens
        ? usage.completion_tokens / (totalMs / 1000)
        : undefined,
    },
  };
  try {
    store.patchMessage(convId, reply.id, finished);
  } finally {
    // Even if saving failed, the chat must not stay busy. A newer run owns the
    // stream state if one started after this was stopped.
    if (activeRun === controller) {
      activeRun = null;
      store.resetStream();
    }
  }
  store.addLogEntry({
    timestamp: Date.now(),
    level: error ? 'error' : 'info',
    category: 'chat',
    message: error
      ? `Chat error (${error.code}): ${error.message}`
      : `Response: ${content.length} chars`,
  });
  // The server did not accept the confirmation: ask again.
  if (error?.code === 'age_unconfirmed') store.revokeAdultConfirmation();

  fetchSavings()
    .then((data) => useAppStore.getState().setSavings(data))
    .catch(() => {});

  return { ...reply, ...finished };
}
