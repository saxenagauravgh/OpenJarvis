/**
 * Save answers as PDF through the system print dialog. Printing what is already
 * on screen keeps typeset equations, tables and Hindi text exactly as shown.
 */

import { isTauri } from './api';

const ROOT_ID = 'print-root';

export interface PrintableAnswer {
  /** The question the answer replies to, if any. */
  question?: string;
  /** Id of the answer message in the page. */
  messageId: string;
}

/** Build the printable document from the answers currently rendered. */
export function buildPrintRoot(
  doc: Document,
  title: string,
  answers: PrintableAnswer[],
): HTMLElement | null {
  doc.getElementById(ROOT_ID)?.remove();
  const root = doc.createElement('div');
  root.id = ROOT_ID;

  const heading = doc.createElement('h1');
  heading.textContent = title;
  root.appendChild(heading);

  let added = 0;
  for (const answer of answers) {
    const rendered = doc.querySelector(
      `[data-message-id="${answer.messageId}"] [data-answer-content]`,
    );
    if (!rendered) continue;
    if (answer.question) {
      const question = doc.createElement('p');
      question.className = 'print-question';
      question.textContent = answer.question;
      root.appendChild(question);
    }
    const copy = rendered.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('button').forEach((button) => button.remove());
    root.appendChild(copy);
    added += 1;
  }
  if (!added) return null;
  doc.body.appendChild(root);
  return root;
}

/** Open the print dialog for the given answers. False when there is nothing to print. */
export async function saveAsPdf(title: string, answers: PrintableAnswer[]): Promise<boolean> {
  const root = buildPrintRoot(document, title, answers);
  if (!root) return false;
  // Copied diagrams must be decoded before the page is captured.
  await Promise.all(
    Array.from(root.querySelectorAll('img'), (image) => image.decode().catch(() => {})),
  );
  // The dialog suggests the page title as the file name.
  const previous = document.title;
  document.title = title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() || 'OpenJarvis';
  window.addEventListener('afterprint', () => (document.title = previous), { once: true });
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('print_page');
  } else {
    window.print();
  }
  return true;
}
