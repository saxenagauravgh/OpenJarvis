import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { startLiveTalk, type LiveTalk } from '../lib/voice/live-talk';
import type { LiveStatus } from '../lib/voice/session';

/** Live Talk mode for the chat page. Leaving the page ends the session. */
export function useLiveVoice() {
  const talkRef = useRef<LiveTalk | null>(null);
  /** null when no session is running. */
  const [status, setStatus] = useState<LiveStatus | null>(null);

  const controls = useMemo(
    () => ({
      isActive: () => talkRef.current !== null,
      sendText: (text: string) => talkRef.current?.sendText(text) ?? false,
      flush: () => talkRef.current?.flush(),
      stop: () => talkRef.current?.stop(),
    }),
    [],
  );

  const start = useCallback((onFallback: () => void) => {
    talkRef.current?.stop();
    setStatus({ phase: 'connecting', hearing: false });
    talkRef.current = startLiveTalk({
      onStatus: setStatus,
      onNotice: (message) => toast(message, { duration: 8000 }),
      onFallback,
      // A session never ends before startLiveTalk has returned.
      onEnd: () => {
        talkRef.current = null;
        setStatus(null);
      },
    });
  }, []);

  useEffect(() => {
    const stop = () => talkRef.current?.stop();
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, []);

  return useMemo(() => ({ ...controls, start, status }), [controls, start, status]);
}
