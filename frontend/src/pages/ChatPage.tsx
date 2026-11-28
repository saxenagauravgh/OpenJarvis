import { ChatArea } from '../components/Chat/ChatArea';
import { SpeechHighlighter } from '../components/Chat/SpeechHighlighter';
import { SystemPanel } from '../components/Chat/SystemPanel';
import { VoiceOrb } from '../components/Chat/VoiceOrb';
import { useAppStore } from '../lib/store';
import { useTtsStore } from '../lib/tts';

export function ChatPage() {
  const systemPanelOpen = useAppStore((s) => s.systemPanelOpen);
  const conversationMode = useAppStore((s) => s.conversationMode);
  const voiceOrbState = useAppStore((s) => s.voiceOrbState);
  const userSpeaking = useAppStore((s) => s.userSpeaking);
  // The orb also appears whenever a reply is being read aloud.
  const reading = useTtsStore((s) => s.state !== 'idle');

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0">
        <ChatArea />
      </div>
      <SpeechHighlighter />
      {/* While voice is in use a slim orb column replaces the system panel. */}
      {conversationMode || reading ? (
        <aside className="voice-dock" aria-label="Voice conversation">
          <VoiceOrb
            state={conversationMode ? voiceOrbState : 'speaking'}
            size={112}
            hearing={userSpeaking}
          />
        </aside>
      ) : (
        systemPanelOpen && <SystemPanel />
      )}
    </div>
  );
}
