import { describe, expect, it } from 'vitest';
import {
  liveWebSearch,
  requestOptions,
  safeSources,
  tutorChoices,
  updateTeam,
  webUrl,
} from './web';

const settings = { webSearchEnabled: true, webAlways: false, expertTeam: false };

describe('request fields from settings', () => {
  it.each([
    [{}, false, 'auto'],
    [{ webAlways: true }, false, 'always'],
    [{ webAlways: true }, true, 'auto'],
    [{ webSearchEnabled: false, webAlways: true }, false, 'off'],
  ])('%o, spoken %s, asks for %s', (changed, spoken, webSearch) => {
    const current = { ...settings, ...changed };
    expect(requestOptions(tutorChoices(current, spoken), current).webSearch).toBe(webSearch);
  });

  it('asks for the team when its pill is on', () => {
    const current = { ...settings, expertTeam: true };
    expect(requestOptions(tutorChoices(current), current).team).toBe(true);
  });

  it('lets live voice search only when the switch is on', () => {
    expect(liveWebSearch({ ...settings, webAlways: true })).toBe('auto');
    expect(liveWebSearch({ ...settings, webSearchEnabled: false })).toBe('off');
  });
});

describe('URL filtering', () => {
  it.each(['https://example.com/a?b=1', 'http://example.com/'])('keeps %s', (url) => {
    expect(webUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'data:text/html,x',
    'file:///etc/passwd',
    'mailto:a@example.com',
    'tauri://localhost',
    '//example.com',
    '/relative',
    '',
    42,
    undefined,
  ])('drops %s', (url) => {
    expect(webUrl(url)).toBeNull();
  });

  it('lists each address once, with a title', () => {
    expect(
      safeSources([
        { title: '  Two\n words ', url: 'https://a.test' },
        { title: 'again', url: 'https://a.test/' },
        { title: '', url: 'https://b.test/page' },
      ]),
    ).toEqual([
      { title: 'Two words', url: 'https://a.test/' },
      { title: 'b.test', url: 'https://b.test/page' },
    ]);
    expect(safeSources(undefined)).toEqual([]);
  });
});

describe('updateTeam', () => {
  it('replaces a member in place and adds new ones at the end', () => {
    const physics = { member: 'physics', label: 'Physics', status: 'working' } as const;
    const checker = { member: 'checker', label: 'Checker', status: 'working' } as const;
    const team = updateTeam(updateTeam([], physics), checker);

    expect(updateTeam(team, { ...physics, status: 'done' })).toEqual([
      { ...physics, status: 'done' },
      checker,
    ]);
  });
});

describe('deep search', () => {
  const settings = { webSearchEnabled: true, webAlways: false, expertTeam: false, webDeep: true };
  it('asks the server to read pages, unless searching is off or the message is spoken', async () => {
    const { requestOptions, tutorChoices } = await import('./web');
    expect(requestOptions(tutorChoices(settings), settings).webSearch).toBe('deep');
    expect(requestOptions(tutorChoices(settings, true), settings).webSearch).toBe('auto');
    const off = { ...settings, webSearchEnabled: false };
    expect(requestOptions(tutorChoices(settings), off).webSearch).toBe('off');
  });
});
