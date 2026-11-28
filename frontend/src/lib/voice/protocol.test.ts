import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  liveHistory,
  liveVoiceUrl,
  parseServerMessage,
  startMessage,
  stopMessage,
  textMessage,
} from './protocol';
import type { ChatMessage } from '../../types';

const read = (value: unknown) => parseServerMessage(JSON.stringify(value));

describe('parseServerMessage', () => {
  it.each([
    { type: 'state', state: 'ready' },
    { type: 'state', state: 'closed', reason: 'idle' },
    { type: 'transcript', turnId: 't1', role: 'user', delta: 'Hi' },
    { type: 'board', turnId: 't1', title: 'Ohm', markdown: '$V=IR$' },
    { type: 'action', turnId: 't1', setting: 'theme', value: 'dark' },
    { type: 'interrupted', turnId: 't1' },
    { type: 'turn_complete', turnId: 't1' },
    { type: 'error', code: 'busy', message: 'Busy.', retryable: true },
  ])('reads $type', (message) => {
    expect(read(message)).toEqual(message);
  });

  it('turns numeric turn ids and values into strings', () => {
    expect(read({ type: 'turn_complete', turnId: 3 })).toEqual({
      type: 'turn_complete',
      turnId: '3',
    });
    expect(read({ type: 'action', turnId: 1, setting: 'voice_speed', value: 1.2 })).toMatchObject({
      turnId: '1',
      value: '1.2',
    });
  });

  it.each([
    'not json',
    'null',
    '[]',
    JSON.stringify({ type: 'unknown', turnId: 't' }),
    JSON.stringify({ type: 'state', state: 'sleeping' }),
    JSON.stringify({ type: 'transcript', turnId: 't', role: 'system', delta: 'x' }),
    JSON.stringify({ type: 'transcript', role: 'user', delta: 'x' }),
    JSON.stringify({ type: 'board', turnId: 't', title: 'x' }),
  ])('ignores %s', (raw) => {
    expect(parseServerMessage(raw)).toBeNull();
  });

  it('ignores binary data', () => {
    expect(parseServerMessage(new ArrayBuffer(2))).toBeNull();
  });
});

describe('client messages', () => {
  it('follow the contract', () => {
    expect(JSON.parse(startMessage([{ role: 'user', text: 'Hi' }], true))).toEqual({
      type: 'start',
      v: 1,
      adultConfirmed: true,
      history: [{ role: 'user', text: 'Hi' }],
    });
    expect(JSON.parse(textMessage('Why?'))).toEqual({ type: 'text', text: 'Why?' });
    expect(JSON.parse(stopMessage())).toEqual({ type: 'stop' });
  });

  it('send the recent conversation, without failed or empty replies', () => {
    const message = (role: 'user' | 'assistant', content: string, extra = {}) =>
      ({ id: content, role, content, timestamp: 0, ...extra }) as ChatMessage;
    expect(
      liveHistory([
        message('user', 'Q'),
        message('assistant', '<think>hm</think>A'),
        message('assistant', ''),
        message('assistant', 'broken', {
          error: { code: 'busy', message: 'x', retryable: true },
        }),
      ]),
    ).toEqual([
      { role: 'user', text: 'Q' },
      { role: 'assistant', text: 'A' },
    ]);
    const long = Array.from({ length: 150 }, (_, i) => message('user', `${i} ${'x'.repeat(7000)}`));
    const sent = liveHistory(long);
    expect(sent).toHaveLength(40);
    expect(sent[0].text.startsWith('110 ')).toBe(true);
    expect(sent[0].text).toHaveLength(6000);
  });
});

describe('liveVoiceUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ apiUrl: 'https://jarvis.example.com:8443/', apiKey: 'k' }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the configured server over a secure socket, without the key', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    expect(liveVoiceUrl()).toBe('wss://jarvis.example.com:8443/v1/voice/live');
  });
});
