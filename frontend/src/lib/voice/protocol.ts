/** The wire format of the live voice socket, /v1/voice/live. */
import { getBase } from '../api';
import { buildTutorHistory } from '../chat/history';
import { safeSources } from '../chat/web';
import type { ChatMessage, WebSource } from '../../types';

export type LiveRole = 'user' | 'assistant';

// Within the server's limits; larger values are cut off or refused.
export const MAX_LIVE_TEXT_CHARS = 4000;
const MAX_HISTORY_TURNS = 40;
const MAX_HISTORY_TEXT_CHARS = 6000;

export interface LiveHistoryTurn {
  role: LiveRole;
  text: string;
}

export type ServerState = 'connecting' | 'ready' | 'reconnecting' | 'closed';

export type ServerMessage =
  | { type: 'state'; state: ServerState; reason?: string }
  | { type: 'transcript'; turnId: string; role: LiveRole; delta: string }
  | { type: 'board'; turnId: string; title: string; markdown: string }
  | { type: 'action'; turnId: string; setting: string; value: string }
  | { type: 'searching'; turnId: string; query: string }
  | { type: 'sources'; turnId: string; items: WebSource[] }
  | { type: 'interrupted'; turnId: string }
  | { type: 'turn_complete'; turnId: string }
  | { type: 'error'; code: string; message: string; retryable: boolean };

const STATES: readonly string[] = ['connecting', 'ready', 'reconnecting', 'closed'];

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** A turn id as a string; the server counts turns with numbers. */
const id = (value: unknown): string | null =>
  typeof value === 'number' ? String(value) : text(value) || null;

/** Read one JSON message from the server; null if it is not one we know. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  if (data.type === 'state') {
    const state = text(data.state);
    if (!state || !STATES.includes(state)) return null;
    const reason = text(data.reason);
    return { type: 'state', state: state as ServerState, ...(reason ? { reason } : {}) };
  }
  if (data.type === 'error') {
    return {
      type: 'error',
      code: text(data.code) || 'internal',
      message: text(data.message) || 'Live voice failed.',
      retryable: data.retryable === true,
    };
  }

  const turnId = id(data.turnId);
  if (turnId === null) return null;
  if (data.type === 'interrupted' || data.type === 'turn_complete') {
    return { type: data.type, turnId };
  }
  if (data.type === 'transcript') {
    const delta = text(data.delta);
    if (delta === null || (data.role !== 'user' && data.role !== 'assistant')) return null;
    return { type: 'transcript', turnId, role: data.role, delta };
  }
  if (data.type === 'board') {
    const markdown = text(data.markdown);
    if (markdown === null) return null;
    return { type: 'board', turnId, title: text(data.title) ?? '', markdown };
  }
  if (data.type === 'searching') {
    const query = text(data.query);
    return query ? { type: 'searching', turnId, query } : null;
  }
  if (data.type === 'sources') {
    if (!Array.isArray(data.items)) return null;
    return { type: 'sources', turnId, items: safeSources(data.items) };
  }
  if (data.type === 'action') {
    const setting = text(data.setting);
    const value = typeof data.value === 'number' ? String(data.value) : text(data.value);
    if (setting === null || value === null) return null;
    return { type: 'action', turnId, setting, value };
  }
  return null;
}

export const startMessage = (
  history: LiveHistoryTurn[],
  adultConfirmed: boolean,
  webSearch: 'auto' | 'off',
) => JSON.stringify({ type: 'start', v: 1, adultConfirmed, history, webSearch });

export const textMessage = (value: string) => JSON.stringify({ type: 'text', text: value });

export const stopMessage = () => JSON.stringify({ type: 'stop' });

/** The conversation so far, as sent when a live session starts. */
export function liveHistory(messages: ChatMessage[]): LiveHistoryTurn[] {
  return buildTutorHistory(messages)
    .filter((message) => message.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.role as LiveRole,
      text: message.content.slice(0, MAX_HISTORY_TEXT_CHARS),
    }));
}

export function liveVoiceUrl(): string {
  const base = getBase() || window.location.origin;
  const url = new URL(`${base.replace(/\/+$/, '')}/v1/voice/live`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
