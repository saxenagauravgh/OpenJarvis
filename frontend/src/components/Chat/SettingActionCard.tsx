import { useAppStore } from '../../lib/store';
import { actionLabel, applyAction, undoAction } from '../../lib/setting-actions';
import type { ChatMessage, SettingAction } from '../../types';

/** A proposed settings change, applied only when the user presses Apply. */
export function SettingActionCard({ message }: { message: ChatMessage }) {
  const activeId = useAppStore((s) => s.activeId);
  const patchMessage = useAppStore((s) => s.patchMessage);
  const action = message.action;
  if (!action || !activeId) return null;

  const save = (next: SettingAction) => patchMessage(activeId, message.id, { action: next });
  const button = 'hud-pill px-3 py-1 rounded-full text-xs cursor-pointer';
  const outline = { border: '1px solid var(--color-border)', color: 'var(--color-text)' };

  return (
    <div
      className="my-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
      style={{ border: '1px solid var(--color-accent)', background: 'var(--color-accent-subtle)' }}
    >
      <span className="mr-auto">
        {action.status === 'applied' ? 'Changed' : action.status === 'dismissed' ? 'Not changed' : 'Change'}{' '}
        — {actionLabel(action)}
      </span>
      {action.status === 'proposed' && (
        <>
          <button
            type="button"
            className={button}
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            onClick={() => save(applyAction(action))}
          >
            Apply
          </button>
          <button
            type="button"
            className={button}
            style={outline}
            onClick={() => save({ ...action, status: 'dismissed' })}
          >
            Not now
          </button>
        </>
      )}
      {action.status === 'applied' && (
        <button type="button" className={button} style={outline} onClick={() => save(undoAction(action))}>
          Undo
        </button>
      )}
    </div>
  );
}
