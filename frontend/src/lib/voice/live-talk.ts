/**
 * Live Talk mode: runs a session for the active conversation, saves what is
 * said into it, and decides what happens when the session ends.
 */
import { generateId, useAppStore } from '../store';
import { useTtsStore } from '../tts';
import { charIndexAtFraction } from '../caption';
import { liveWebSearch } from '../chat/web';
import { liveHistory } from './protocol';
import { startLiveSession, type LiveEnd, type LiveStatus } from './session';
import { initialTurns, reduceTurns, type TurnEvent } from './turns';

export interface LiveTalkHandlers {
  onStatus: (status: LiveStatus) => void;
  /** Something the user should be told. */
  onNotice: (message: string) => void;
  /** The session could not start: use the Standard voice instead. */
  onFallback: () => void;
  onEnd: () => void;
}

export interface LiveTalk {
  sendText: (text: string) => boolean;
  flush: () => void;
  stop: () => void;
}

export function startLiveTalk(handlers: LiveTalkHandlers): LiveTalk {
  const app = useAppStore.getState();
  let conversationId = app.activeId;
  let turns = initialTurns();
  let creating = false;
  let unsubscribe = () => {};

  const apply = (event: TurnEvent) => {
    const result = reduceTurns(turns, event, { newId: generateId, now: Date.now });
    turns = result.state;
    for (const change of result.changes) {
      const store = useAppStore.getState();
      try {
        if (!conversationId) {
          // A new chat is made only once there is something to keep in it.
          if (change.type !== 'add') continue;
          creating = true;
          conversationId = store.createConversation(store.selectedModel);
          creating = false;
        }
        if (change.type === 'add') {
          store.addMessage(conversationId, change.message, change.before);
        } else {
          store.patchMessage(conversationId, change.id, change.patch);
        }
      } catch {
        creating = false;
        handlers.onNotice('This conversation could not be saved. Storage may be full.');
      }
    }
  };

  /** Highlight, in the chat, the words being spoken. The timing is estimated. */
  const highlight = (playback: { turnId: string; fraction: number } | null) => {
    const turn = playback ? turns.turns[playback.turnId] : undefined;
    const shown = useTtsStore.getState();
    if (!playback || !turn?.assistantId || !turn.spoken.trim()) {
      if (shown.caption) useTtsStore.setState({ caption: null, speakingId: null });
      return;
    }
    const charIndex = charIndexAtFraction(turn.spoken, playback.fraction);
    if (shown.caption?.text === turn.spoken && shown.caption.charIndex === charIndex) return;
    useTtsStore.setState({
      speakingId: turn.assistantId,
      caption: { text: turn.spoken, charIndex },
    });
  };

  const onEnd = (end: LiveEnd) => {
    unsubscribe();
    highlight(null);
    apply({ type: 'ended' });
    handlers.onEnd();
    if (end.reason === 'stopped') return;
    if (end.code === 'age_unconfirmed') {
      useAppStore.getState().revokeAdultConfirmation();
      return;
    }
    useAppStore.getState().addLogEntry({
      timestamp: Date.now(),
      level: 'error',
      category: 'chat',
      message: `Live voice: ${end.message}`,
    });
    if (end.beforeReady) {
      handlers.onNotice(`Using the Standard voice. Live voice did not start: ${end.message}`);
      handlers.onFallback();
    } else {
      handlers.onNotice(`Live voice ended: ${end.message}`);
    }
  };

  const history = liveHistory(
    app.conversations.find((c) => c.id === conversationId)?.messages ?? [],
  );
  const session = startLiveSession(
    { history, adultConfirmed: app.adultConfirmed, webSearch: liveWebSearch(app.settings) },
    {
      onStatus: handlers.onStatus,
      onMessage: (message) => {
        if (message.type !== 'state' && message.type !== 'error') apply(message);
      },
      onEnd,
      onPlayback: highlight,
    },
  );

  // The session belongs to one conversation.
  unsubscribe = useAppStore.subscribe((state) => {
    if (creating || state.activeId === conversationId) return;
    unsubscribe();
    handlers.onNotice('Live voice stopped because you changed chats.');
    session.stop();
  });

  return {
    sendText: (text) => {
      if (!session.sendText(text)) return false;
      apply({ type: 'typed', text });
      return true;
    },
    flush: session.flush,
    stop: session.stop,
  };
}
