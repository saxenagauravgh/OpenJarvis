import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./SpeakMessageButton', () => ({ SpeakMessageButton: () => null }));
vi.mock('./XRayFooter', () => ({ XRayFooter: () => null }));

import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../types';

function render(message: Partial<ChatMessage>) {
  return renderToStaticMarkup(
    <MessageBubble message={{ id: 'm1', timestamp: 0, ...message } as ChatMessage} />,
  );
}

describe('message text direction', () => {
  it('lets each assistant block pick its own direction', () => {
    const html = render({
      role: 'assistant',
      content: 'آخر إيميل من **Meta for Business**.\n\n- **المحتوى:** إيصال\n\n```\ncode\n```',
    });

    expect(html).toMatch(/<p dir="auto">آخر إيميل/);
    expect(html).toMatch(/<ul dir="auto">/);
    expect(html).toMatch(/<li dir="auto">/);
    expect(html).not.toMatch(/<pre[^>]*dir=/);
  });

  it('lets the user bubble pick its direction', () => {
    expect(render({ role: 'user', content: 'إيه آخر إيميل عندي؟' })).toContain('dir="auto"');
  });

  it('keeps code left-to-right inside a right-to-left blockquote', () => {
    const html = render({
      role: 'assistant',
      content: '> فقرة عربية\n>\n> ```js\n> const value = 1;\n> ```',
    });

    expect(html).toMatch(/<blockquote dir="auto">/);
    expect(html).toMatch(/<blockquote dir="auto">[\s\S]*<div[^>]*dir="ltr"/);
    expect(html.replace(/<[^>]*>/g, '')).toContain('const value = 1;');
  });

  it('lets mixed-language table cells choose their direction independently', () => {
    const html = render({
      role: 'assistant',
      content: '| العنوان | Name |\n| --- | --- |\n| محتوى | English |',
    });

    expect(html).toContain('<th dir="auto">العنوان</th>');
    expect(html).toContain('<th dir="auto">Name</th>');
    expect(html).toContain('<td dir="auto">محتوى</td>');
    expect(html).toContain('<td dir="auto">English</td>');
  });
});

describe('files on a question', () => {
  it('shows file chips, and the names saved by earlier versions', () => {
    const html = render({
      role: 'user',
      content: 'q',
      files: [{ id: 'f1', name: 'notes.pdf', mime: 'application/pdf', size: 2048, kind: 'pdf' }],
    });

    expect(html).toContain('notes.pdf');
    expect(html).toContain('2 KB');
    expect(render({ role: 'user', content: 'q', attachments: ['old.jpg'] })).toContain('old.jpg');
  });
});

describe('reply status', () => {
  const error = { code: 'busy', message: 'The model is busy.', retryable: true };
  const html = (message: Partial<ChatMessage>, actions = true) =>
    renderToStaticMarkup(
      <MessageBubble
        message={{ id: 'm1', timestamp: 0, role: 'assistant', content: '', ...message } as ChatMessage}
        onRetry={actions ? () => {} : undefined}
        onContinue={actions ? () => {} : undefined}
      />,
    );

  it('shows an error as a card with Retry, apart from any text', () => {
    const out = html({ content: 'partial', error });

    expect(out).toContain('role="alert"');
    expect(out).toContain('The model is busy.');
    expect(out).toContain('Retry');
    expect(out).toContain('partial');
    expect(html({ error }, false)).not.toContain('Retry');
  });

  it('shows fallback notices', () => {
    const out = html({
      content: 'x',
      notices: [{ code: 'fallback_model', message: 'Switched to a backup model.' }],
    });

    expect(out).toContain('Switched to a backup model.');
  });

  it('offers Continue only for a reply cut off by length', () => {
    expect(html({ content: 'x', finishReason: 'length' })).toContain('Continue');
    expect(html({ content: 'x', finishReason: 'stop' })).not.toContain('Continue');
  });

  it('says when a reply was blocked', () => {
    expect(html({ finishReason: 'blocked' })).toContain('blocked');
  });
});

describe('web search and the expert team', () => {
  const team = [{ member: 'physics', label: 'Physics expert', status: 'working' }] as const;
  const reply = (message: Partial<ChatMessage>, isLive = false) =>
    renderToStaticMarkup(
      <MessageBubble
        message={{ id: 'm1', timestamp: 0, role: 'assistant', content: 'x', ...message } as ChatMessage}
        isLive={isLive}
      />,
    ).replace(/<!-- -->/g, '');

  it('lists only web sources, as numbered links kept from read-aloud', () => {
    const html = reply({
      webSources: [
        { title: 'NASA', url: 'https://nasa.gov/moon' },
        { title: 'Trap', url: 'javascript:alert(1)' },
      ],
    });

    expect(html).toMatch(/<div data-no-speech="true"[^>]*>.*<ol[^>]*><li[^>]*><a href="https:\/\/nasa.gov\/moon"/);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Trap');
  });

  it('shows the search and expert progress while streaming', () => {
    const html = reply({ searching: 'moon', webSearches: ['moon'], team: [...team] }, true);

    expect(html).toContain('Searching the web: moon');
    expect(html).toContain('Physics expert: working');
  });

  it('keeps a summary on the finished reply', () => {
    const html = reply({ searching: 'moon', webSearches: ['moon', 'mars'], team: [...team] });

    expect(html).not.toContain('Searching the web');
    expect(html).toContain('Searched the web: moon; mars');
    expect(html).toContain('Expert team: Physics expert (not finished)');
  });

  it('shows a live voice search without the chat streaming', () => {
    expect(reply({ live: true, searching: 'moon' })).toContain('Searching the web: moon');
  });
});
