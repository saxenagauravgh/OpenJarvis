import { createContext, useContext, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
// Chemical equations and units: \ce{...} and \pu{...}.
import 'katex/contrib/mhchem';
import { Copy, Check, FileDown, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { saveAsPdf } from '../../lib/export-pdf';
import { AudioPlayer } from './AudioPlayer';
import { ToolCallCard } from './ToolCallCard';
import { ResearchTimeline } from './ResearchTimeline';
import { rehypeCitations } from '../../lib/rehype-citations';
import { XRayFooter } from './XRayFooter';
import { SpeakMessageButton } from './SpeakMessageButton';
import { MessageError, MessageNotices, MessageOutcome } from './MessageStatus';
import { SettingActionCard } from './SettingActionCard';
import { SearchStatus, SourceList, TeamStatus } from './WebProgress';
import type { ChatMessage } from '../../types';
import { useAppStore } from '../../lib/store';
import { isFenceClosed, normalizeMathDelimiters, stripThinkTags } from '../../lib/message-text';
import { DiagramBlock } from './visuals/DiagramBlock';
import { PlotBlock } from './visuals/PlotBlock';
import { formatFileSize } from '../../lib/chat/attachments';

interface Props {
  message: ChatMessage;
  isLive?: boolean;
  /** Offered on a failed reply that can be sent again. */
  onRetry?: (messageId: string) => void;
  /** Offered on a reply that was cut off at the length limit. */
  onContinue?: () => void;
}

function getTextContent(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }
  if (node?.props?.children) {
    return getTextContent(node.props.children);
  }
  return '';
}

// Each block picks its own direction from its first strong character, so an
// Arabic paragraph next to English text renders right-to-left with its
// punctuation in place. Code blocks explicitly stay left-to-right.
const AUTO_DIR_TAGS = ['p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'th', 'td'] as const;

const autoDirComponents = Object.fromEntries(
  AUTO_DIR_TAGS.map((Tag) => [
    Tag,
    ({ node: _node, ...props }: any) => <Tag dir="auto" {...props} />,
  ]),
);

function CodeBlockPre({ children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || '';
  const match = /language-([\w-]+)/.exec(className);
  const lang = match ? match[1] : '';
  const code = getTextContent(codeElement?.props?.children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="code-block-wrapper relative my-3"
      dir="ltr"
      style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
    >
      <div
        className="flex items-center justify-between px-4 py-1.5 text-xs"
        style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
      >
        <span className="font-mono">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props} style={{ margin: 0, borderRadius: 0 }}>
        {children}
      </pre>
    </div>
  );
}

const VISUALS = {
  svg: { Block: DiagramBlock, pending: 'Drawing diagram…' },
  plot: { Block: PlotBlock, pending: 'Drawing graph…' },
};

/** The Markdown being rendered, so a block can tell whether it has all arrived. */
const AnswerSource = createContext({ markdown: '', isLive: false });

/** A fenced block: a picture for ```svg and ```plot, otherwise code. */
function AnswerPre({ node, children, ...props }: any) {
  const { markdown, isLive } = useContext(AnswerSource);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const lang = /language-([\w-]+)/.exec(codeElement?.props?.className || '')?.[1].toLowerCase();
  const codeView = <CodeBlockPre {...props}>{children}</CodeBlockPre>;
  if (lang !== 'svg' && lang !== 'plot') return codeView;

  const { Block, pending } = VISUALS[lang];
  const block = markdown.slice(node?.position?.start.offset, node?.position?.end.offset);
  if (isLive && !isFenceClosed(block)) {
    return (
      <div className="visual-pending" role="status" data-no-speech>
        {pending}
      </div>
    );
  }
  const code = getTextContent(codeElement?.props?.children).replace(/\n$/, '');
  return <Block code={code} codeView={codeView} />;
}

/** Wide tables scroll on their own instead of stretching the chat. */
function ScrollTable({ node: _node, ...props }: any) {
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}

function SavePdfButton({ messageId }: { messageId: string }) {
  const save = () => {
    const messages = useAppStore.getState().messages;
    const index = messages.findIndex((m) => m.id === messageId);
    const asked = messages[index - 1];
    const question = asked?.role === 'user' ? asked.content : undefined;
    void saveAsPdf(question?.slice(0, 60) || 'Tutor notes', [{ messageId, question }]).catch(() =>
      toast.error('Could not open the print dialog.'),
    );
  };
  return (
    <button
      type="button"
      onClick={save}
      className="p-1.5 rounded-md transition-colors cursor-pointer"
      style={{ color: 'var(--color-text-tertiary)' }}
      title="Save as PDF (in the dialog choose PDF, then Save as PDF)"
      aria-label="Save answer as PDF"
    >
      <FileDown size={14} />
    </button>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      style={{ color: 'var(--color-text-tertiary)' }}
      title="Copy message"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function MessageBubble({ message, isLive = false, onRetry, onContinue }: Props) {
  const isUser = message.role === 'user';
  const developerMode = useAppStore((s) => s.settings.developerMode);

  const cleanContent = useMemo(
    () => normalizeMathDelimiters(stripThinkTags(message.content)),
    [message.content],
  );

  // Build a ref→source lookup once per render. Memoized so the rehype plugin
  // identity stays stable until the source list actually changes.
  const sourcesMap = useMemo(() => {
    const m = new Map<number, NonNullable<ChatMessage['researchSources']>[number]>();
    for (const s of message.researchSources ?? []) {
      if (typeof s.ref === 'number') m.set(s.ref, s);
    }
    return m;
  }, [message.researchSources]);

  const rehypePlugins = useMemo(() => {
    const base: any[] = [[rehypeHighlight, { detect: true }], rehypeKatex];
    if (sourcesMap.size > 0) base.push([rehypeCitations, { sources: sourcesMap }]);
    return base;
  }, [sourcesMap]);

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div
          dir="auto"
          className="hud-user-bubble max-w-[85%] px-4 py-2.5 text-sm leading-relaxed"
          style={{
            background: 'var(--color-user-bubble)',
            color: 'var(--color-user-bubble-text)',
            borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-1 text-xs opacity-80" style={{ whiteSpace: 'normal' }}>
              {message.attachments.map((name, i) => (
                <span key={`${name}-${i}`} className="mr-2">📎 {name}</span>
              ))}
            </div>
          )}
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5" style={{ whiteSpace: 'normal' }}>
              {message.files.map((file) => {
                const Icon = file.kind === 'image' ? ImageIcon : FileText;
                return (
                  <span
                    key={file.id}
                    className="inline-flex items-center gap-1.5 max-w-full rounded-md px-2 py-1 text-xs"
                    style={{ border: '1px solid color-mix(in srgb, currentColor 30%, transparent)' }}
                    title={file.name}
                  >
                    <Icon size={12} className="shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 opacity-70">{formatFileSize(file.size)}</span>
                  </span>
                );
              })}
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="group mb-6" data-message-id={message.id}>
      {/* Deep Research timeline (steps + status) */}
      {(message.isResearch || (message.researchTraces && message.researchTraces.length > 0)) && (
        <ResearchTimeline
          traces={message.researchTraces ?? []}
          isLive={isLive}
          hasContent={cleanContent.length > 0}
        />
      )}

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Audio player (e.g. morning digest) */}
      {message.audio?.url && <AudioPlayer src={message.audio.url} />}

      <MessageNotices notices={message.notices} />
      <TeamStatus team={message.team} isLive={isLive} />
      <SearchStatus message={message} isLive={isLive} />

      {/* Assistant message */}
      {cleanContent && (
        <div className="prose max-w-none" data-answer-content>
          <AnswerSource.Provider value={{ markdown: cleanContent, isLive }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={rehypePlugins}
              components={{
                ...autoDirComponents,
                pre: AnswerPre,
                table: ScrollTable,
              }}
            >
              {cleanContent}
            </ReactMarkdown>
          </AnswerSource.Provider>
        </div>
      )}

      <SourceList sources={message.webSources} />

      {message.action && <SettingActionCard message={message} />}
      {message.error && (
        <MessageError
          error={message.error}
          onRetry={onRetry ? () => onRetry(message.id) : undefined}
        />
      )}
      {!isLive && <MessageOutcome message={message} onContinue={onContinue} />}

      {/* Footer: copy + read aloud + x-ray */}
      {cleanContent && (
        <div className="flex items-center gap-2 mt-1.5">
          <CopyMessageButton content={cleanContent} />
          {!isLive && <SavePdfButton messageId={message.id} />}
          {!isLive && (
            <SpeakMessageButton messageId={message.id} content={cleanContent} />
          )}
        </div>
      )}
      {developerMode && (
        <XRayFooter
          usage={message.usage}
          telemetry={message.telemetry}
          isResearch={message.isResearch}
        />
      )}
    </div>
  );
}
