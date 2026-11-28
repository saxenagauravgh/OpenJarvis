/** Web search and expert team: what is asked for, and what comes back. */
import type { TeamMember, TeamProgress, TutorChoices, WebSource } from '../../types';

export type WebSearchMode = 'auto' | 'always' | 'off';

export interface WebSettings {
  /** The "Web search" switch in Settings. Off means nothing is ever searched. */
  webSearchEnabled: boolean;
  /** The "Web" pill: search for every typed message. */
  webAlways: boolean;
  /** The "Expert team" pill. */
  expertTeam: boolean;
}

/** What the user is asking for with a new message. */
export const tutorChoices = (settings: WebSettings, spoken = false): TutorChoices => ({
  web: !spoken && settings.webSearchEnabled && settings.webAlways,
  team: settings.expertTeam,
});

/** The request fields for those choices. The Settings switch always wins. */
export const requestOptions = (
  choices: TutorChoices,
  settings: WebSettings,
): { webSearch: WebSearchMode; team: boolean } => ({
  webSearch: !settings.webSearchEnabled ? 'off' : choices.web ? 'always' : 'auto',
  team: choices.team,
});

export const liveWebSearch = (settings: WebSettings): 'auto' | 'off' =>
  settings.webSearchEnabled ? 'auto' : 'off';

/** The address, normalised, if it is a web page; anything else is never linked. */
export function webUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The usable sources among whatever arrived, each address once. */
export function safeSources(items: unknown): WebSource[] {
  if (!Array.isArray(items)) return [];
  const sources = new Map<string, WebSource>();
  for (const item of items) {
    const url = webUrl(item?.url);
    if (!url || sources.has(url)) continue;
    const title = typeof item.title === 'string' ? item.title.replace(/\s+/g, ' ').trim() : '';
    sources.set(url, { title: title || new URL(url).hostname, url });
  }
  return [...sources.values()];
}

/** Add newly found sources after those already listed, so numbers do not move. */
export const mergeSources = (known: WebSource[], found: WebSource[]): WebSource[] =>
  safeSources([...known, ...found]);

export const addQuery = (queries: string[], query: string): string[] =>
  queries.includes(query) ? queries : [...queries, query];

export const TEAM_MEMBERS: readonly TeamMember[] = [
  'physics',
  'chemistry',
  'maths',
  'solver',
  'checker',
];

/** The team with one member's latest progress, in the order they first appeared. */
export function updateTeam(team: TeamProgress[], update: TeamProgress): TeamProgress[] {
  return team.some((m) => m.member === update.member)
    ? team.map((m) => (m.member === update.member ? update : m))
    : [...team, update];
}
