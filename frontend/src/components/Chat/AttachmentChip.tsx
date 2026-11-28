import { FileText, Image as ImageIcon, Loader2, X, AlertTriangle } from 'lucide-react';
import { formatFileSize } from '../../lib/chat/attachments';
import type { PendingAttachment } from '../../hooks/useAttachments';

/** A file waiting to be sent: its upload state and a way to remove it. */
export function AttachmentChip({
  item,
  onRemove,
}: {
  item: PendingAttachment;
  onRemove: (key: string) => void;
}) {
  const failed = item.status === 'failed';
  const Icon = failed
    ? AlertTriangle
    : item.status === 'uploading'
      ? Loader2
      : item.file?.kind === 'image' ? ImageIcon : FileText;
  const note = item.error ?? item.warning;
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs max-w-xs"
      style={{
        background: 'var(--color-bg-secondary)',
        border: `1px solid ${failed ? 'var(--color-error)' : 'var(--color-border)'}`,
        color: 'var(--color-text)',
      }}
    >
      <Icon
        size={14}
        className={`shrink-0 mt-0.5${item.status === 'uploading' ? ' animate-spin' : ''}`}
        style={{ color: failed ? 'var(--color-error)' : 'var(--color-accent)' }}
      />
      <div className="min-w-0">
        <div className="truncate" title={item.name}>{item.name}</div>
        <div role="status" style={{ color: 'var(--color-text-tertiary)' }}>
          {formatFileSize(item.size)} &middot;{' '}
          {item.status === 'uploading' ? 'Uploading…' : failed ? 'Upload failed' : 'Ready'}
        </div>
        {note && (
          <div
            style={{
              color: failed ? 'var(--color-error)' : 'var(--color-text-secondary)',
              overflowWrap: 'anywhere',
            }}
          >
            {note}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.key)}
        className="shrink-0 rounded-full p-0.5 cursor-pointer"
        style={{ color: 'var(--color-text-tertiary)' }}
        aria-label={`Remove ${item.name}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}
