import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { generateId, useAppStore } from '../lib/store';
import {
  UPLOAD_NOTICE,
  UploadError,
  prepareUpload,
  selectFiles,
  takeUploadNotice,
  uploadAttachment,
} from '../lib/chat/attachments';
import type { ChatAttachment } from '../types';

/** A file chosen for the next message. */
export interface PendingAttachment {
  key: string;
  name: string;
  size: number;
  status: 'uploading' | 'ready' | 'failed';
  /** Set once the upload has succeeded. */
  file?: ChatAttachment;
  warning?: string;
  error?: string;
}

/** The files of the message being written. Each uploads as soon as it is added. */
export function useAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  // The ref is current even before React renders, which a send that waited for
  // uploads relies on.
  const itemsRef = useRef<PendingAttachment[]>([]);
  const uploads = useRef(
    new Map<string, { done: Promise<void>; controller: AbortController }>(),
  );

  const change = useCallback((edit: (list: PendingAttachment[]) => PendingAttachment[]) => {
    itemsRef.current = edit(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const attached = itemsRef.current.filter((item) => item.status !== 'failed').length;
    const { accepted, problems } = selectFiles(files, attached);
    for (const problem of problems) toast.error(problem, { duration: 8000 });
    if (!accepted.length) return;
    if (takeUploadNotice()) toast.warning(UPLOAD_NOTICE, { duration: 20000 });

    for (const file of accepted) {
      const key = generateId();
      const controller = new AbortController();
      const update = (patch: Partial<PendingAttachment>) =>
        change((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
      change((list) => [
        ...list,
        { key, name: file.name || 'file', size: file.size, status: 'uploading' },
      ]);

      const run = async () => {
        try {
          const prepared = await prepareUpload(file);
          if (controller.signal.aborted) return;
          const { warning, ...uploaded } = await uploadAttachment(prepared, {
            adultConfirmed: useAppStore.getState().adultConfirmed,
            signal: controller.signal,
          });
          update({
            status: 'ready',
            name: uploaded.name,
            size: uploaded.size,
            file: uploaded,
            warning: warning ?? undefined,
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          update({
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
          // The server did not accept the confirmation: ask again.
          if (err instanceof UploadError && err.code === 'age_unconfirmed') {
            useAppStore.getState().revokeAdultConfirmation();
          }
        } finally {
          uploads.current.delete(key);
        }
      };
      // Registered before `run` can finish and remove it.
      const done = Promise.resolve().then(run);
      uploads.current.set(key, { done, controller });
    }
  }, [change]);

  const removeFile = useCallback((key: string) => {
    uploads.current.get(key)?.controller.abort();
    uploads.current.delete(key);
    change((list) => list.filter((item) => item.key !== key));
  }, [change]);

  const isUploading = useCallback(() => uploads.current.size > 0, []);

  /** Resolves once no upload is running. */
  const whenUploaded = useCallback(async () => {
    while (uploads.current.size > 0) {
      await Promise.all([...uploads.current.values()].map((upload) => upload.done));
    }
  }, []);

  /** Remove and return the uploaded files. Failed ones stay, with their message. */
  const takeUploaded = useCallback((): ChatAttachment[] => {
    const taken = itemsRef.current.flatMap((item) => (item.file ? [item.file] : []));
    if (taken.length) change((list) => list.filter((item) => !item.file));
    return taken;
  }, [change]);

  return { items, addFiles, removeFile, isUploading, whenUploaded, takeUploaded };
}
