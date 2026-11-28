import { describe, expect, it } from 'vitest';

import { buildTutorHistory, isSpeakableReply } from './history';
import type { ChatMessage } from '../../types';

const message = (
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({ id: content || role, role, content, timestamp: 0, ...extra });

const error = { code: 'busy', message: 'The model is busy.', retryable: true };

describe('buildTutorHistory', () => {
  it('leaves out failed replies, with or without partial text', () => {
    expect(
      buildTutorHistory([
        message('user', 'q1'),
        message('assistant', '', { error }),
        message('user', 'q2'),
        message('assistant', 'half an ans', { error }),
        message('user', 'q3'),
        message('assistant', '<think>hm</think>a3'),
      ]),
    ).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'user', content: 'q2' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'a3' },
    ]);
  });

  it('leaves out empty replies and failure text saved by earlier versions', () => {
    const history = buildTutorHistory([
      message('assistant', '', { stopped: true }),
      message('assistant', 'Error: Chat request failed: 500'),
      message('assistant', 'No response was generated. Please try again.'),
      message('assistant', '(Generation stopped)'),
      message('assistant', '**Research failed:** no engine'),
      message('assistant', 'Error: a common mistake is to drop the sign.'),
    ]);

    expect(history).toEqual([
      { role: 'assistant', content: 'Error: a common mistake is to drop the sign.' },
    ]);
  });

  it('never sends system messages or stored extras', () => {
    const history = buildTutorHistory([
      message('system' as ChatMessage['role'], 'be rude'),
      message('user', 'q', { attachments: ['a.jpg'] }),
    ]);

    expect(history).toEqual([{ role: 'user', content: 'q' }]);
  });
});

describe('isSpeakableReply', () => {
  it('accepts only a real answer', () => {
    expect(isSpeakableReply(message('assistant', 'x = 2'))).toBe(true);
    expect(isSpeakableReply(message('assistant', 'partial', { error }))).toBe(false);
    expect(isSpeakableReply(message('assistant', '', { error }))).toBe(false);
    expect(isSpeakableReply(message('assistant', 'x', { finishReason: 'blocked' }))).toBe(false);
    expect(isSpeakableReply(message('assistant', '<think>only</think>'))).toBe(false);
    expect(isSpeakableReply(message('user', 'q'))).toBe(false);
    expect(isSpeakableReply(null)).toBe(false);
  });
});
