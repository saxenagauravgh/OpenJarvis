/**
 * Turns live voice events into chat messages. Each turn becomes a user message
 * (what was heard) followed by an assistant message (what was said, plus
 * anything written on the board, with any web search and its sources). Pure:
 * the caller applies the changes.
 */
import { addQuery, mergeSources } from '../chat/web';
import { parseAction } from '../setting-actions';
import type { ChatMessage, WebSource } from '../../types';
import type { ServerMessage } from './protocol';

export type TurnEvent =
  | Extract<
      ServerMessage,
      {
        type:
          | 'transcript'
          | 'board'
          | 'action'
          | 'searching'
          | 'sources'
          | 'interrupted'
          | 'turn_complete';
      }
    >
  /** The user typed a message during the session. */
  | { type: 'typed'; text: string }
  /** The session is over. */
  | { type: 'ended' };

export type TurnChange =
  | { type: 'add'; message: ChatMessage; before?: string }
  | { type: 'patch'; id: string; patch: Partial<ChatMessage> };

interface Turn {
  userId?: string;
  heard: string;
  assistantId?: string;
  spoken: string;
  boards: { title: string; markdown: string }[];
  /** A web search is shown as running on the reply. */
  searching?: boolean;
  webSearches?: string[];
  webSources?: WebSource[];
  stopped?: boolean;
  done?: boolean;
}

export interface TurnsState {
  turns: Record<string, Turn>;
  /** A question spoken over a reply; the next turn answers it. */
  next?: { userId: string; heard: string };
}

export const initialTurns = (): TurnsState => ({ turns: {} });

export interface TurnContext {
  newId: () => string;
  now: () => number;
}

export function composeReply(spoken: string, boards: Turn['boards']): string {
  const parts = boards.map(({ title, markdown }) => {
    const heading = title.replace(/\s+/g, ' ').trim();
    return [heading && `### ${heading}`, markdown.trim()].filter(Boolean).join('\n\n');
  });
  return [spoken.trim(), ...parts].filter(Boolean).join('\n\n');
}

export function reduceTurns(
  state: TurnsState,
  event: TurnEvent,
  context: TurnContext,
): { state: TurnsState; changes: TurnChange[] } {
  const changes: TurnChange[] = [];
  const message = (role: ChatMessage['role'], content: string): ChatMessage => ({
    id: context.newId(),
    role,
    content,
    timestamp: context.now(),
    live: true,
  });

  // The server does not repeat typed messages back, so they are added here.
  if (event.type === 'typed') {
    changes.push({ type: 'add', message: message('user', event.text) });
    return { state, changes };
  }

  if (event.type === 'ended') {
    // Replies cut off by the end of the session are marked as stopped.
    for (const turn of Object.values(state.turns)) {
      if (!turn.assistantId) continue;
      const patch: Partial<ChatMessage> = {
        ...(!turn.done && !turn.stopped ? { stopped: true } : {}),
        ...(turn.searching ? { searching: undefined } : {}),
      };
      if (Object.keys(patch).length) {
        changes.push({ type: 'patch', id: turn.assistantId, patch });
      }
    }
    return { state: initialTurns(), changes };
  }

  let next = state.next;
  let turn = state.turns[event.turnId];
  if (turn) {
    turn = { ...turn };
  } else {
    turn = { heard: '', spoken: '', boards: [] };
    if (next && event.type !== 'turn_complete') {
      turn = { ...turn, ...next };
      next = undefined;
    }
  }
  const save = () => ({
    state: { turns: { ...state.turns, [event.turnId]: turn }, next },
    changes,
  });

  /** Add the assistant message, or update the given fields of it. */
  const reply = (patch: Partial<ChatMessage>) => {
    if (turn.assistantId) {
      changes.push({ type: 'patch', id: turn.assistantId, patch });
      return;
    }
    const added = {
      ...message('assistant', ''),
      ...(turn.stopped ? { stopped: true } : {}),
      ...patch,
    };
    turn.assistantId = added.id;
    changes.push({ type: 'add', message: added });
  };

  /** The fields that take down a running search, if one is shown. */
  const searchOver = (): Partial<ChatMessage> => {
    if (!turn.searching) return {};
    turn.searching = false;
    return { searching: undefined };
  };

  /** Add the user message, or update what has been heard of it. */
  const question = (
    heard: string,
    userId: string | undefined,
    before: string | undefined,
  ): string | undefined => {
    const content = heard.trim();
    if (!content) return userId;
    if (userId) {
      changes.push({ type: 'patch', id: userId, patch: { content } });
      return userId;
    }
    const added = message('user', content);
    changes.push({ type: 'add', message: added, before });
    return added.id;
  };

  if (event.type === 'transcript') {
    if (!event.delta) return { state, changes };
    if (event.role === 'assistant') {
      turn.spoken += event.delta;
      if (!turn.assistantId && !turn.spoken.trim()) return save();
      reply({ content: composeReply(turn.spoken, turn.boards), ...searchOver() });
      return save();
    }
    if (turn.stopped && turn.assistantId) {
      // Said after interrupting: a new question, which goes below the reply.
      const heard = (state.next?.heard ?? '') + event.delta;
      const userId = question(heard, state.next?.userId, undefined);
      next = userId ? { userId, heard } : undefined;
      return save();
    }
    turn.heard += event.delta;
    // The transcript of a question can arrive after its answer has begun.
    turn.userId = question(turn.heard, turn.userId, turn.assistantId);
    return save();
  }

  if (event.type === 'board') {
    const known = turn.boards.some(
      (b) => b.title === event.title && b.markdown === event.markdown,
    );
    if (known || !(event.title.trim() || event.markdown.trim())) return { state, changes };
    turn.boards = [...turn.boards, { title: event.title, markdown: event.markdown }];
    reply({ content: composeReply(turn.spoken, turn.boards), ...searchOver() });
    return save();
  }

  if (event.type === 'searching') {
    turn.webSearches = addQuery(turn.webSearches ?? [], event.query);
    // An interrupted reply is no longer waiting for anything.
    turn.searching = !turn.stopped;
    reply({
      searching: turn.stopped ? undefined : event.query,
      webSearches: turn.webSearches,
    });
    return save();
  }

  if (event.type === 'sources') {
    const over = searchOver();
    if (event.items.length) {
      turn.webSources = mergeSources(turn.webSources ?? [], event.items);
      reply({ webSources: turn.webSources, ...over });
    } else if ('searching' in over) {
      reply(over);
    }
    return save();
  }

  if (event.type === 'action') {
    const action = parseAction(event.setting, event.value);
    if (!action) return { state, changes };
    reply({ action });
    return save();
  }

  if (event.type === 'interrupted') {
    turn.stopped = true;
    if (turn.assistantId) {
      reply({ stopped: true, ...searchOver() });
    }
    return save();
  }

  turn.done = true;
  const over = searchOver();
  if (turn.assistantId && 'searching' in over) reply(over);
  return save();
}
