/** The composer's "Web" and "Expert team" switches. */
import { Globe, Telescope, Users, type LucideIcon } from 'lucide-react';
import { useAppStore } from '../../lib/store';

function Pill({
  label,
  icon: Icon,
  on,
  disabled,
  title,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  on: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="hud-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
      style={{
        background: on ? 'var(--color-accent-subtle)' : 'transparent',
        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`,
        color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
      }}
      title={title}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

export function WebPills() {
  const enabled = useAppStore((s) => s.settings.webSearchEnabled);
  const webAlways = useAppStore((s) => s.settings.webAlways);
  const expertTeam = useAppStore((s) => s.settings.expertTeam);
  const webDeep = useAppStore((s) => s.settings.webDeep);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const web = enabled && webAlways;
  const deep = enabled && webDeep;

  return (
    <>
      <Pill
        label="Web"
        icon={Globe}
        on={web}
        disabled={!enabled}
        title={
          !enabled
            ? 'Web search is turned off in Settings. It sends your question to free search engines (DuckDuckGo first).'
            : web
              ? 'Web: on. Each typed question is sent to free search engines (DuckDuckGo first).'
              : 'Web: search for every typed question. This sends your question to free search engines (DuckDuckGo first). While off, the tutor may still search when it needs to.'
        }
        onClick={() => updateSettings({ webAlways: !webAlways })}
      />
      <Pill
        label="Deep"
        icon={Telescope}
        on={deep}
        disabled={!enabled}
        title={`Deep search${deep ? ': on' : ''}. Searches for your question and reads the top pages before answering. Slower.`}
        onClick={() => updateSettings({ webDeep: !webDeep })}
      />
      <Pill
        label="Expert team"
        icon={Users}
        on={expertTeam}
        title={`Expert team${expertTeam ? ': on' : ''}. Several experts work on the answer. It is slower and uses several times more Gemini quota.`}
        onClick={() => updateSettings({ expertTeam: !expertTeam })}
      />
    </>
  );
}
