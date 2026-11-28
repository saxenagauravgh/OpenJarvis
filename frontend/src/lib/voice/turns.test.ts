import { describe, expect, it } from 'vitest';
import { composeReply, initialTurns, reduceTurns, type TurnEvent } from './turns';
import type { ChatMessage } from '../../types';

/** Apply events the way the store would, and return the resulting chat. */
function run(events: TurnEvent[]): ChatMessage[] {
  let state = initialTurns();
  let count = 0;
  const chat: ChatMessage[] = [];
  for (const event of events) {
    const result = reduceTurns(state, event, { newId: () => `m${++count}`, now: () => 1 });
    state = result.state;
    for (const change of result.changes) {
      if (change.type === 'patch') {
        Object.assign(chat.find((m) => m.id === change.id)!, change.patch);
      } else {
        const at = change.before ? chat.findIndex((m) => m.id === change.before) : -1;
        chat.splice(at === -1 ? chat.length : at, 0, { ...change.message });
      }
    }
  }
  return chat;
}

const heard = (turnId: string, delta: string): TurnEvent => ({
  type: 'transcript',
  turnId,
  role: 'user',
  delta,
});
const said = (turnId: string, delta: string): TurnEvent => ({
  type: 'transcript',
  turnId,
  role: 'assistant',
  delta,
});
const done = (turnId: string): TurnEvent => ({ type: 'turn_complete', turnId });
const cut = (turnId: string): TurnEvent => ({ type: 'interrupted', turnId });
const brief = (chat: ChatMessage[]) =>
  chat.map((m) => [m.role, m.content, ...(m.stopped ? ['stopped'] : [])]);

describe('reduceTurns', () => {
  it('saves a turn as the question then the answer, growing as it arrives', () => {
    const chat = run([heard('1', ' What is'), heard('1', ' force?'), said('1', 'A push'), said('1', ' or pull.'), done('1')]);
    expect(brief(chat)).toEqual([
      ['user', 'What is force?'],
      ['assistant', 'A push or pull.'],
    ]);
    expect(chat.every((m) => m.live)).toBe(true);
  });

  it('puts a late transcript above its answer', () => {
    expect(brief(run([said('1', 'Yes.'), heard('1', 'Is it?'), done('1')]))).toEqual([
      ['user', 'Is it?'],
      ['assistant', 'Yes.'],
    ]);
  });

  it('writes the board under the spoken text, with its title as a heading', () => {
    const board: TurnEvent = { type: 'board', turnId: '1', title: "Newton's law", markdown: '$$F = ma$$' };
    const chat = run([said('1', 'Look.'), board, board, said('1', ' See?')]);
    expect(brief(chat)).toEqual([
      ['assistant', "Look. See?\n\n### Newton's law\n\n$$F = ma$$"],
    ]);
    expect(composeReply('', [{ title: '', markdown: 'x' }])).toBe('x');
  });

  it('attaches only valid settings proposals', () => {
    const action = (setting: string, value: string): TurnEvent => ({
      type: 'action',
      turnId: '1',
      setting,
      value,
    });
    expect(run([action('api_key', 'x'), action('theme', 'neon')])).toEqual([]);
    const [reply] = run([action('theme', 'dark'), said('1', 'Shall I?')]);
    expect(reply.action).toEqual({ setting: 'theme', value: 'dark', status: 'proposed' });
    expect(reply.content).toBe('Shall I?');
  });

  it('marks an interrupted reply stopped, and puts the new question below it', () => {
    const chat = run([
      heard('1', 'Explain.'),
      said('1', 'Well'),
      cut('1'),
      heard('1', 'Wait,'),
      done('1'),
      heard('2', ' why?'),
      said('2', 'Because.'),
      done('2'),
    ]);
    expect(brief(chat)).toEqual([
      ['user', 'Explain.'],
      ['assistant', 'Well', 'stopped'],
      ['user', 'Wait, why?'],
      ['assistant', 'Because.'],
    ]);
  });

  it('adds typed messages as they are sent', () => {
    expect(brief(run([{ type: 'typed', text: 'Hello' }, said('1', 'Hi.'), done('1')]))).toEqual([
      ['user', 'Hello'],
      ['assistant', 'Hi.'],
    ]);
  });

  it('marks only unfinished replies stopped when the session ends', () => {
    const chat = run([said('1', 'Done.'), done('1'), said('2', 'Half'), { type: 'ended' }]);
    expect(brief(chat)).toEqual([
      ['assistant', 'Done.'],
      ['assistant', 'Half', 'stopped'],
    ]);
  });

  const searching = (turnId: string, query: string): TurnEvent => ({
    type: 'searching',
    turnId,
    query,
  });
  const source = { title: 'NASA', url: 'https://nasa.gov/moon' };
  const found = (turnId: string, items = [source]): TurnEvent => ({
    type: 'sources',
    turnId,
    items,
  });

  it('shows a search on the answer, below the question', () => {
    const chat = run([searching('1', 'moon'), heard('1', 'How strong?')]);
    expect(chat.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(chat[1]).toMatchObject({ searching: 'moon', webSearches: ['moon'], live: true });
  });

  it('takes the search down and keeps its sources', () => {
    const [reply] = run([
      searching('1', 'moon'),
      found('1'),
      searching('1', 'mars'),
      said('1', '1.62'),
      found('1', [source, { title: 'ESA', url: 'https://esa.int/' }]),
      done('1'),
    ]);
    expect(reply.searching).toBeUndefined();
    expect(reply.content).toBe('1.62');
    expect(reply.webSearches).toEqual(['moon', 'mars']);
    expect(reply.webSources?.map((s) => s.title)).toEqual(['NASA', 'ESA']);
  });

  it.each([
    ['sources with no links', found('1', [])],
    ['the answer', said('1', 'A')],
    ['an interruption', cut('1')],
    ['the end of the turn', done('1')],
    ['the end of the session', { type: 'ended' } as TurnEvent],
  ])('stops showing a search after %s', (_name, event) => {
    const [reply] = run([searching('1', 'moon'), event]);
    expect(reply.searching).toBeUndefined();
    expect(reply.webSearches).toEqual(['moon']);
  });

  it('does not show a search on an interrupted reply', () => {
    const [reply] = run([said('1', 'Well'), cut('1'), searching('1', 'moon')]);
    expect(reply.searching).toBeUndefined();
    expect(reply.stopped).toBe(true);
  });

  it('creates no empty messages', () => {
    expect(run([heard('1', ' '), said('1', ''), said('1', ' '), cut('1'), done('1')])).toEqual([]);
  });
});
