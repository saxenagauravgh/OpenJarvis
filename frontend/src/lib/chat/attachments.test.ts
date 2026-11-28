import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_FILE_BYTES,
  fileProblem,
  prepareUpload,
  selectFiles,
  takeUploadNotice,
  uploadAttachment,
  uploadName,
} from './attachments';

const info = (name: string, type = '', size = 10) => ({ name, type, size });

let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('file checks', () => {
  it('accepts the supported types, with or without a reported type', () => {
    for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.webp', 'a.gif', 'a.pdf', 'a.docx', 'a.txt', 'a.md', 'a.csv']) {
      expect(fileProblem(info(name))).toBeNull();
    }
    expect(fileProblem(info('data.csv', 'application/vnd.ms-excel'))).toBeNull();
  });

  it('names a pasted file after its type', () => {
    expect(uploadName(info('', 'image/png'))).toBe('file.png');
    expect(uploadName(info('scan', 'application/pdf'))).toBe('scan.pdf');
  });

  it('refuses other types', () => {
    for (const file of [
      info('a.doc', 'application/msword'),
      info('a.heic', 'image/heic'),
      info('a.svg', 'image/svg+xml'),
      info('a.zip', 'application/zip'),
      info('page.html', 'text/plain'),
      info('noextension'),
    ]) {
      expect(fileProblem(file)).toContain('not a supported file');
    }
  });

  it('refuses empty files and files over 50 MB', () => {
    expect(fileProblem(info('a.pdf', '', 0))).toContain('empty');
    expect(fileProblem(info('a.pdf', '', MAX_FILE_BYTES))).toBeNull();
    expect(fileProblem(info('a.pdf', '', MAX_FILE_BYTES + 1))).toContain('too large');
  });

  it('allows five files per message and says why others were left out', () => {
    const files = ['1', '2', '3', '4'].map((n) => info(`${n}.txt`));

    const { accepted, problems } = selectFiles([info('x.exe'), ...files], 2);

    expect(accepted.map((f) => f.name)).toEqual(['1.txt', '2.txt', '3.txt']);
    expect(problems).toHaveLength(2);
    expect(problems[1]).toContain('up to 5 files');
  });

  it('uploads documents unchanged', async () => {
    const file = new File(['a,b'], 'a.csv', { type: 'text/csv' });

    expect(await prepareUpload(file)).toBe(file);
  });
});

describe('takeUploadNotice', () => {
  it('is true only the first time', () => {
    expect(takeUploadNotice()).toBe(true);
    expect(takeUploadNotice()).toBe(false);
  });
});

describe('uploadAttachment', () => {
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  const upload = () => uploadAttachment(file, { adultConfirmed: true });
  const respond = (response: () => Response | Promise<Response>) => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => response());
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };
  const saved = { id: 'att1', name: 'notes.txt', mime: 'text/plain', size: 5, kind: 'text' };

  it('posts the file and the confirmation as a form', async () => {
    stored.set('openjarvis-settings', '{"apiKey":"k"}');
    const fetch = respond(() => Response.json({ ...saved, warning: null }));

    expect(await upload()).toEqual({ ...saved, warning: null });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/v1/tutor/attachments');
    expect(init.method).toBe('POST');
    // The browser sets the multipart content type itself.
    expect(init.headers).toEqual({ Authorization: 'Bearer k' });
    const form = init.body as FormData;
    expect(form.get('adultConfirmed')).toBe('true');
    expect((form.get('file') as File).name).toBe('notes.txt');
    expect(await (form.get('file') as File).text()).toBe('hello');
  });

  it('passes on a warning', async () => {
    respond(() => Response.json({ ...saved, warning: 'Only part was read.' }));

    expect((await upload()).warning).toBe('Only part was read.');
  });

  it('reports the server reason for a refusal', async () => {
    respond(() =>
      Response.json(
        { detail: { code: 'unreadable', message: 'This PDF is locked.' } },
        { status: 422 },
      ),
    );

    await expect(upload()).rejects.toMatchObject({
      code: 'unreadable',
      message: 'This PDF is locked.',
    });
  });

  it('explains failures without a usable body', async () => {
    respond(() => new Response('oops', { status: 500 }));
    await expect(upload()).rejects.toMatchObject({ code: 'internal', message: expect.stringContaining('500') });

    respond(() => Response.json({}));
    await expect(upload()).rejects.toMatchObject({ code: 'internal' });

    respond(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(upload()).rejects.toMatchObject({ code: 'network' });
  });

  it('lets a cancelled upload throw the abort', async () => {
    respond(() => Promise.reject(new DOMException('Aborted', 'AbortError')));
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadAttachment(file, { adultConfirmed: true, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
