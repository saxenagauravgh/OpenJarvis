/** What a reply searched for, who worked on it, and where its facts came from. */
import { Check, Globe, Loader2, Users, X } from 'lucide-react';
import { safeSources } from '../../lib/chat/web';
import type { ChatMessage, TeamProgress, WebSource } from '../../types';

const MUTED = { color: 'var(--color-text-tertiary)' };

// `data-no-speech` keeps these out of the read-aloud highlighting.

export function SearchStatus({ message, isLive }: { message: ChatMessage; isLive: boolean }) {
  // A live voice reply is in progress without the chat itself streaming.
  const searching = (isLive || (message.live && !message.stopped)) && message.searching;
  if (searching) {
    return (
      <div
        data-no-speech
        role="status"
        className="flex items-start gap-2 mb-2 text-xs"
        style={{ color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}
      >
        <Globe size={14} className="shrink-0 animate-pulse" style={{ color: 'var(--color-accent)' }} />
        <span dir="auto">Searching the web: {searching}</span>
      </div>
    );
  }
  if (!message.webSearches?.length) return null;
  return (
    <div
      data-no-speech
      dir="auto"
      className="mb-2 text-xs"
      style={{ ...MUTED, overflowWrap: 'anywhere' }}
    >
      Searched the web: {message.webSearches.join('; ')}
    </div>
  );
}

const STATUS_ICONS = { working: Loader2, done: Check, failed: X };

export function TeamStatus({ team, isLive }: { team?: TeamProgress[]; isLive: boolean }) {
  if (!team?.length) return null;
  if (!isLive) {
    const summary = team.map(
      (m) => `${m.label} (${m.status === 'working' ? 'not finished' : m.status})`,
    );
    return (
      <div data-no-speech className="mb-2 text-xs" style={MUTED}>
        Expert team: {summary.join(', ')}
      </div>
    );
  }
  return (
    <div data-no-speech role="status" className="flex flex-wrap items-center gap-1.5 mb-2">
      <Users size={14} style={{ color: 'var(--color-accent)' }} aria-label="Expert team" />
      {team.map((m) => {
        const Icon = STATUS_ICONS[m.status];
        return (
          <span
            key={m.member}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
            style={{
              border: '1px solid var(--color-border)',
              color: m.status === 'failed' ? 'var(--color-error)' : 'var(--color-text-secondary)',
            }}
          >
            <Icon size={12} className={m.status === 'working' ? 'animate-spin' : undefined} />
            {m.label}: {m.status}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Numbered links under an answer. In the desktop app the shell plugin opens
 * `target="_blank"` web links in the system browser.
 */
export function SourceList({ sources }: { sources?: WebSource[] }) {
  // Checked again here: saved conversations are not trusted.
  const links = safeSources(sources);
  if (!links.length) return null;
  return (
    <div data-no-speech className="mt-3 text-xs" style={{ overflowWrap: 'anywhere' }}>
      <div className="mb-1 font-medium" style={MUTED}>
        Sources
      </div>
      <ol className="list-decimal pl-5 flex flex-col gap-0.5" style={MUTED}>
        {links.map((source) => (
          <li key={source.url} dir="auto">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              title={source.url}
              className="underline"
              style={{ color: 'var(--color-accent)' }}
            >
              {source.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
