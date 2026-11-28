import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../SpeakMessageButton', () => ({ SpeakMessageButton: () => null }));
vi.mock('../XRayFooter', () => ({ XRayFooter: () => null }));

import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '../../../types';

function render(content: string, isLive = false) {
  return renderToStaticMarkup(
    <MessageBubble
      message={{ id: 'm1', timestamp: 0, role: 'assistant', content } as ChatMessage}
      isLive={isLive}
    />,
  );
}

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
const SVG = '<svg viewBox="0 0 10 10"><title>Free body</title><rect width="4" height="4"/></svg>';
const PLOT = JSON.stringify({
  title: 'Parabola',
  x: [-3, 3],
  functions: [{ expr: 'x^2-4', label: 'f(x)' }],
  points: [{ x: 2, y: 0, label: 'root' }],
});

describe('diagrams in an answer', () => {
  it('shows an svg block as an image only, never as markup', () => {
    const html = render(`Look:\n\n${fence('svg', SVG)}`);
    expect(html).toContain('<img src="data:image/svg+xml;charset=utf-8,%3Csvg');
    expect(html).toContain('alt="Free body"');
    expect(html).toContain('Show code');
    expect(html).not.toContain('<title');
    expect(html).not.toContain('<pre');
  });

  it('never puts a hostile drawing into the page', () => {
    const html = render(
      fence('svg', '<svg onload="alert(1)"><script>alert(2)</script></svg>'),
    );
    expect(html).toContain('<img src="data:image/svg+xml');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onload="');
  });

  it('shows the code of a broken drawing', () => {
    const html = render(fence('svg', '<svg><g></svg>'));
    expect(html).toContain('could not be drawn');
    expect(html).toContain('<pre');
    expect(html).not.toContain('<img');
  });

  it('leaves latex delimiters inside a drawing alone', () => {
    const html = render(fence('svg', '<svg><text>\\(x\\)</text></svg>'));
    expect(decodeURIComponent(/data:image[^"]+/.exec(html)![0])).toContain('\\(x\\)');
  });

  it.each(['```', '~~~', '> ```'])('waits for a streaming %s block to close', (open) => {
    const quote = open.startsWith('>') ? '> ' : '';
    const partial = `${open}svg\n${quote}<svg viewBox="0 0 1 1">`;
    expect(render(partial, true)).toContain('Drawing diagram…');
    expect(render(partial, true)).not.toContain('<pre');
    const closed = `${partial}</svg>\n${open}`;
    expect(render(closed, true)).toContain('<img');
  });

  it('shows what arrived of a drawing that was cut off', () => {
    const html = render('```svg\n<svg>', false);
    expect(html).not.toContain('Drawing diagram');
    expect(html).toContain('<pre');
  });
});

describe('graphs in an answer', () => {
  it('draws axes, ticks, curve, point and legend', () => {
    const html = render(fence('plot', PLOT));
    expect(html).toContain('role="img"');
    expect(html).toContain('class="graph-curve"');
    expect(html).toContain('class="graph-x-axis"');
    expect(html).toContain('<figcaption>Parabola</figcaption>');
    expect(html).toContain('f(x)');
    expect(html).toContain('>root</text>');
    expect(html).toContain('data-no-speech');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('<pre');
  });

  it('falls back to the code with a short message', () => {
    for (const body of ['{oops', '{"x":[0,1],"functions":[{"expr":"alert(1)"}]}']) {
      const html = render(fence('plot', body));
      expect(html).toContain('This graph could not be drawn.');
      expect(html).toContain('<pre');
    }
  });

  it('waits while the block is streaming', () => {
    expect(render('```plot\n{"x": [0,', true)).toContain('Drawing graph…');
  });
});

describe('tables and chemistry in an answer', () => {
  it('wraps tables so they can scroll', () => {
    expect(render('| a | b |\n| - | - |\n| 1 | 2 |')).toContain(
      '<div class="table-scroll"><table>',
    );
  });

  it('typesets \\ce equations', () => {
    const html = render('$\\ce{2H2 + O2 -> 2H2O}$');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('color:#cc0000');
  });
});
