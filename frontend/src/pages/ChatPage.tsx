import { ChatArea } from '../components/Chat/ChatArea';
import { SpeechHighlighter } from '../components/Chat/SpeechHighlighter';
import { SystemPanel } from '../components/Chat/SystemPanel';
import { useAppStore } from '../lib/store';

export function ChatPage() {
  const systemPanelOpen = useAppStore((s) => s.systemPanelOpen);
  const developerMode = useAppStore((s) => s.settings.developerMode);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0">
        <ChatArea />
      </div>
      <SpeechHighlighter />
      {developerMode && systemPanelOpen && <SystemPanel />}
    </div>
  );
}
