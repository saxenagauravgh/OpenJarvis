import { ChatArea } from '../components/Chat/ChatArea';
import { SystemPanel } from '../components/Chat/SystemPanel';
import { VoiceOrb } from '../components/Chat/VoiceOrb';
import { useAppStore } from '../lib/store';

export function ChatPage() {
  const systemPanelOpen = useAppStore((s) => s.systemPanelOpen);
  const conversationMode = useAppStore((s) => s.conversationMode);
  const voiceOrbState = useAppStore((s) => s.voiceOrbState);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0">
        <ChatArea />
      </div>
      {/* During a voice conversation a slim orb column replaces the system panel. */}
      {conversationMode ? (
        <aside className="voice-dock" aria-label="Voice conversation">
          <VoiceOrb state={voiceOrbState} size={112} />
        </aside>
      ) : (
        systemPanelOpen && <SystemPanel />
      )}
    </div>
  );
}
