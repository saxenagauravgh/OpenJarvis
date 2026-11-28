import { AlertTriangle, ArrowRight, Info, RotateCcw } from 'lucide-react';
import type {
  ChatMessage,
  MessageError as MessageErrorInfo,
  MessageNotice,
} from '../../types';

const ACTION_BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer';
const ACTION_STYLE = { background: 'var(--color-accent)', color: 'var(--color-on-accent)' };

/** Things the user should know about a reply, such as a model fallback. */
export function MessageNotices({ notices }: { notices?: MessageNotice[] }) {
  if (!notices?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mb-2">
      {notices.map((notice, i) => (
        <div
          key={`${notice.code}-${i}`}
          role="status"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: 'var(--color-accent-subtle)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Info size={14} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
          <span>{notice.message}</span>
        </div>
      ))}
    </div>
  );
}

export function MessageError({
  error,
  onRetry,
}: {
  error: MessageErrorInfo;
  onRetry?: () => void;
}) {
  const needsKey = error.code === 'no_key' || error.code === 'bad_key';
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl px-4 py-3 mt-2 text-sm"
      style={{
        background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
        color: 'var(--color-text)',
      }}
    >
      <AlertTriangle
        size={16}
        className="shrink-0 mt-0.5"
        style={{ color: 'var(--color-error)' }}
      />
      <div className="flex-1 min-w-0" style={{ overflowWrap: 'anywhere' }}>
        <div>{error.message}</div>
        {needsKey && (
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Add or update your Gemini API key under Cloud Models (⌘K), then retry.
          </div>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`${ACTION_BUTTON} mt-2`}
            style={ACTION_STYLE}
          >
            <RotateCcw size={12} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/** How a reply ended, when that was not a normal finish. */
export function MessageOutcome({
  message,
  onContinue,
}: {
  message: ChatMessage;
  onContinue?: () => void;
}) {
  if (message.error) return null;
  const muted = { color: 'var(--color-text-tertiary)' };
  if (message.finishReason === 'blocked') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 mt-2 text-xs"
        style={{ color: 'var(--color-error)' }}
      >
        <AlertTriangle size={14} className="shrink-0" />
        This reply was blocked by the model's safety filter. Try rephrasing the question.
      </div>
    );
  }
  if (message.finishReason === 'length') {
    return (
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs" style={muted}>
        <span>The answer reached the length limit.</span>
        {onContinue && (
          <button type="button" onClick={onContinue} className={ACTION_BUTTON} style={ACTION_STYLE}>
            Continue
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    );
  }
  if (message.stopped) {
    return (
      <div className="mt-2 text-xs" style={muted}>
        Generation stopped.
      </div>
    );
  }
  return null;
}
