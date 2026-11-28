import { describe, expect, it } from 'vitest';
import { buildPrintRoot } from './export-pdf';

/** A tiny stand-in for the parts of the DOM the builder uses. */
function fakeDocument(rendered: Record<string, string>) {
  const appended: any[] = [];
  const element = (tag: string) => ({
    tag,
    id: '',
    className: '',
    textContent: '',
    children: [] as any[],
    appendChild(child: any) {
      this.children.push(child);
    },
  });
  return {
    appended,
    getElementById: () => null,
    createElement: element,
    querySelector: (selector: string) => {
      const id = /data-message-id="([^"]+)"/.exec(selector)?.[1] ?? '';
      if (!(id in rendered)) return null;
      return {
        cloneNode: () => ({ textContent: rendered[id], querySelectorAll: () => [] }),
      };
    },
    body: { appendChild: (child: any) => appended.push(child) },
  };
}

describe('buildPrintRoot', () => {
  it('collects the title, questions and rendered answers in order', () => {
    const doc = fakeDocument({ a1: 'F = ma', a2: 'V = IR' });
    const root: any = buildPrintRoot(doc as unknown as Document, 'Notes', [
      { messageId: 'a1', question: 'Second law?' },
      { messageId: 'missing', question: 'skipped' },
      { messageId: 'a2' },
    ]);
    expect(root.children.map((c: any) => c.textContent)).toEqual([
      'Notes', 'Second law?', 'F = ma', 'V = IR',
    ]);
    expect(doc.appended).toHaveLength(1);
  });

  it('prints nothing when no answer is on screen', () => {
    const doc = fakeDocument({});
    expect(buildPrintRoot(doc as unknown as Document, 'x', [{ messageId: 'a' }])).toBeNull();
    expect(doc.appended).toHaveLength(0);
  });
});
