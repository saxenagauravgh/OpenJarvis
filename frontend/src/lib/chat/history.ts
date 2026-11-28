import type { ChatMessage } from '../../types';
import type { TutorMessage } from '../sse';
import { stripThinkTags } from '../message-text';

/** Failure text that earlier versions saved as if the assistant had said it. */
const LEGACY_FAILURE_TEXT =
  /^(Error: (Chat request failed|Failed to fetch|Load failed|NetworkError)|No response was generated\. Please try again\.$|\(Generation stopped\)$|\*\*Research failed:\*\*)/;

/**
 * The conversation as the tutor route should see it: user and assistant turns
 * only. Failed and empty replies are left out.
 */
export function buildTutorHistory(messages: ChatMessage[]): TutorMessage[] {
  const history: TutorMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const files = message.files?.map((file) => file.id);
      history.push({
        role: 'user',
        content: message.content,
        ...(files?.length ? { files } : {}),
      });
    } else if (message.role === 'assistant' && !message.error) {
      const content = stripThinkTags(message.content);
      if (content && !LEGACY_FAILURE_TEXT.test(content)) {
        history.push({ role: 'assistant', content });
      }
    }
  }
  return history;
}

/** Whether a finished reply is a real answer that may be read aloud. */
export function isSpeakableReply(message: ChatMessage | null | undefined): boolean {
  return (
    !!message &&
    message.role === 'assistant' &&
    !message.error &&
    message.finishReason !== 'blocked' &&
    stripThinkTags(message.content) !== ''
  );
}
