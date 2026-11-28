// --- SSE Event Types ---

export interface SSEEvent {
  event?: string;
  data: string;
}

export interface AgentTurnStartEvent {
  agent: string;
  input: string;
}

export interface InferenceStartEvent {
  model: string;
  engine: string;
  turn: number;
}

export interface InferenceEndEvent {
  model: string;
  engine: string;
  turn: number;
}

export interface ToolCallStartEvent {
  tool: string;
  arguments: string;
}

export interface ToolCallEndEvent {
  tool: string;
  success: boolean;
  latency: number;
}

// --- Chat Types ---

export interface ToolCallInfo {
  id: string;
  tool: string;
  arguments: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  latency?: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MessageTelemetry {
  engine?: string;
  model_id?: string;
  tokens_per_sec?: number;
  ttft_ms?: number;
  total_ms?: number;
  complexity_score?: number;
  complexity_tier?: string;
  suggested_max_tokens?: number;
}

export interface TimeRange {
  start?: string;
  end?: string;
}

export interface ResearchSource {
  ref: number;
  title?: string;
  sender?: string;
  date?: string;
  url?: string;
}

export interface ResearchSearchTrace {
  id: string;
  query: string;
  person?: string;
  timeRange?: TimeRange | string;
  status: 'pending' | 'complete';
  numHits?: number;
  topTitles?: string[];
}

export type ResearchEvent =
  | {
      type: 'search_call';
      arguments: {
        query: string;
        person?: string;
        time_range?: TimeRange | string;
      };
    }
  | {
      type: 'search_result';
      num_hits: number;
      top_titles?: string[];
      sources?: ResearchSource[];
    }
  | { type: 'synthesis'; text: string }
  | {
      type: 'system_metrics';
      power_w: number;
      energy_j: number;
      duration_s: number;
    }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'error'; message: string };

export interface LiveEnergyMetrics {
  power_w: number;
  energy_j: number;
  duration_s: number;
}

/** Why a reply failed. Kept apart from `content` so it is never sent as history. */
export interface MessageError {
  code: string;
  message: string;
  retryable: boolean;
}

/** Something the user should know about a reply, such as a model fallback. */
export interface MessageNotice {
  code: string;
  message: string;
}

export type FinishReason = 'stop' | 'length' | 'blocked';

/** An uploaded file, as returned by POST /v1/tutor/attachments. */
export interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'pdf' | 'text';
}

/** A web page a reply drew on. */
export interface WebSource {
  title: string;
  url: string;
}

export type TeamMember = 'physics' | 'chemistry' | 'maths' | 'solver' | 'checker';

/** How one member of the expert team is getting on with a reply. */
export interface TeamProgress {
  member: TeamMember;
  label: string;
  status: 'working' | 'done' | 'failed';
}

/** The Web and Expert team pills as they were when a question was sent. */
export interface TutorChoices {
  web: boolean;
  team: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  researchTraces?: ResearchSearchTrace[];
  researchSources?: ResearchSource[];
  isResearch?: boolean;
  usage?: TokenUsage;
  telemetry?: MessageTelemetry;
  audio?: { url: string };
  /** Files sent with this message, held by the server (data is not stored). */
  files?: ChatAttachment[];
  /** File names of images sent by earlier versions (image data was not stored). */
  attachments?: string[];
  error?: MessageError;
  notices?: MessageNotice[];
  /** On a question, kept so that Retry and Continue ask in the same way. */
  choices?: TutorChoices;
  /** The web search a reply is waiting for; cleared once it moves on. */
  searching?: string;
  /** Everything searched for while replying. */
  webSearches?: string[];
  /** Web pages shown under a reply; never sent back as history. */
  webSources?: WebSource[];
  /** Progress of the expert team on this reply. */
  team?: TeamProgress[];
  /** A settings change proposed with this reply. */
  action?: SettingAction;
  finishReason?: FinishReason;
  /** The user stopped generation. */
  stopped?: boolean;
  /** Said or typed in a live voice session; never read aloud again by the app. */
  live?: boolean;
}

export interface SettingAction {
  setting: 'theme' | 'font_size' | 'voice_speed' | 'model';
  value: string;
  status: 'proposed' | 'applied' | 'dismissed';
  /** What the setting was before it was applied, for Undo. */
  previous?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: ChatMessage[];
}

export interface ConversationStore {
  version: 1;
  conversations: Record<string, Conversation>;
  activeId: string | null;
}

// --- Stream State ---

export interface StreamState {
  conversationId: string | null;
  isStreaming: boolean;
  phase: string;
  elapsedMs: number;
  activeToolCalls: ToolCallInfo[];
  content: string;
}

// --- API Types ---

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ProviderSavings {
  provider: string;
  label: string;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  energy_wh: number;
  energy_joules: number;
  flops: number;
}

export interface SavingsData {
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  local_cost: number;
  per_provider: ProviderSavings[];
  token_counting_version?: number;
}

export interface ServerInfo {
  model: string;
  agent: string | null;
  engine: string;
}

// --- Log Types ---

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  category: 'server' | 'model' | 'chat' | 'tool';
  message: string;
}
