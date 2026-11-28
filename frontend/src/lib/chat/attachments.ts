/** Files attached in the tutor chat: what is accepted, and uploading them. */
import { apiFetch } from '../api';
import type { ChatAttachment } from '../../types';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Longest side of an uploaded image; larger ones are scaled down first. */
const MAX_IMAGE_DIMENSION = 1600;

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
};

/** For the file picker. */
export const FILE_ACCEPT = [
  ...Object.keys(TYPES).map((ext) => `.${ext}`),
  ...new Set(Object.values(TYPES).filter((mime) => mime.startsWith('image/'))),
].join(',');

export const UPLOAD_NOTICE =
  "Files you attach are sent to Google. On the free tier they may be used by Google and read by human reviewers. Don't attach personal or sensitive documents.";
export const UPLOAD_NOTICE_KEY = 'openjarvis-upload-notice';

/** True the first time ever it is asked, so the notice is shown once. */
export function takeUploadNotice(): boolean {
  try {
    if (localStorage.getItem(UPLOAD_NOTICE_KEY)) return false;
    localStorage.setItem(UPLOAD_NOTICE_KEY, 'shown');
  } catch {
    // Storage unavailable: showing it again is the safe choice.
  }
  return true;
}

/**
 * The name to upload a file under, ending in a supported extension, or null if
 * the type is not supported. Pasted files may have no useful name.
 */
export function uploadName(file: { name: string; type: string }): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TYPES, extension)) return file.name;
  // Plain text types are claimed by many formats, so they count only for a
  // name with no extension.
  if (extension && file.type.startsWith('text/')) return null;
  const match = Object.keys(TYPES).find((ext) => TYPES[ext] === file.type);
  return match ? `${file.name || 'file'}.${match}` : null;
}

/** Why a file cannot be attached, or null if it can. */
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  const name = file.name || 'This file';
  if (!uploadName(file)) {
    return `${name} is not a supported file. Attach an image (PNG, JPEG, WEBP, GIF), PDF, DOCX, TXT, MD or CSV.`;
  }
  if (file.size === 0) return `${name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${name} is too large. The limit is 50 MB per file.`;
  return null;
}

/** Split chosen files into those to upload and the reasons others are refused. */
export function selectFiles<T extends { name: string; type: string; size: number }>(
  files: T[],
  alreadyAttached: number,
): { accepted: T[]; problems: string[] } {
  const accepted: T[] = [];
  const problems: string[] = [];
  let overLimit = false;
  for (const file of files) {
    const problem = fileProblem(file);
    if (problem) problems.push(problem);
    else if (alreadyAttached + accepted.length >= MAX_FILES) overLimit = true;
    else accepted.push(file);
  }
  if (overLimit) problems.push(`You can attach up to ${MAX_FILES} files per message.`);
  return { accepted, problems };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Scale a large image down before uploading it. JPEGs are always re-encoded,
 * which also drops camera metadata such as location. Other files are returned
 * unchanged.
 */
export async function prepareUpload(file: File): Promise<File> {
  const name = uploadName(file) ?? file.name;
  const mime = TYPES[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
  if (!mime?.startsWith('image/')) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read ${file.name || 'image'}`));
      el.src = objectUrl;
    });
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
    );
    if (scale === 1 && mime !== 'image/jpeg') return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('Could not process image');
    const jpegName = /\.jpe?g$/i.test(name) ? name : `${name.slice(0, name.lastIndexOf('.'))}.jpg`;
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export class UploadError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

export type UploadedAttachment = ChatAttachment & { warning: string | null };

/**
 * Upload one file to POST /v1/tutor/attachments. Throws an UploadError with a
 * message for the user, or the AbortError of an upload the caller cancelled.
 */
export async function uploadAttachment(
  file: File,
  { adultConfirmed, signal }: { adultConfirmed: boolean; signal?: AbortSignal },
): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append('file', file, uploadName(file) ?? file.name);
  form.append('adultConfirmed', String(adultConfirmed));

  let response: Response;
  try {
    response = await apiFetch('/v1/tutor/attachments', { method: 'POST', body: form, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new UploadError(
      'network',
      'Could not reach the app server. Check that it is running, then attach the file again.',
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    body = undefined;
  }
  if (!response.ok) {
    const detail = body?.detail;
    const message =
      typeof detail?.message === 'string' && detail.message
        ? detail.message
        : typeof detail === 'string' && detail
          ? detail
          : `The file could not be uploaded (HTTP ${response.status}).`;
    throw new UploadError(typeof detail?.code === 'string' ? detail.code : 'internal', message);
  }
  if (typeof body?.id !== 'string' || !body.id) {
    throw new UploadError('internal', 'The server did not accept the file.');
  }
  return {
    id: body.id,
    name: typeof body.name === 'string' && body.name ? body.name : file.name,
    mime: typeof body.mime === 'string' ? body.mime : file.type,
    size: typeof body.size === 'number' ? body.size : file.size,
    kind: body.kind === 'image' || body.kind === 'pdf' ? body.kind : 'text',
    warning: typeof body.warning === 'string' && body.warning ? body.warning : null,
  };
}
