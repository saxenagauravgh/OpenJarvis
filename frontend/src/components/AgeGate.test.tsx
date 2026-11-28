import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({ default: {} }));
vi.mock('./SetupScreen', () => ({ SetupScreen: () => <div>setup-screen</div> }));

import { AgeGateView } from './AgeGate';
import { AGE_GATE_KEY, loadAdultConfirmation } from '../lib/age-gate';

let stored: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

/** The buttons of a rendered element tree, by label. */
function buttons(node: ReactNode, found = new Map<string, () => void>()) {
  if (Array.isArray(node)) node.forEach((child) => buttons(child, found));
  else if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
    if (element.type === 'button') {
      found.set(String(element.props.children).trim(), element.props.onClick!);
    } else {
      buttons(element.props.children, found);
    }
  }
  return found;
}

describe('AgeGateView', () => {
  it('asks for 18+ confirmation and warns about the free tier', () => {
    const html = renderToStaticMarkup(<AgeGateView blocked={false} onAnswer={vi.fn()} />);

    expect(html).toContain('Adults only (18+)');
    expect(html).toContain('may be used by Google and read by human reviewers');
    expect(html).toContain('send personal or sensitive information');
  });

  it('reports each answer', () => {
    const onAnswer = vi.fn();
    const found = buttons(AgeGateView({ blocked: false, onAnswer }));

    found.get('Yes, I am 18 or older')!();
    found.get('No')!();

    expect(onAnswer.mock.calls).toEqual([[true], [false]]);
  });

  it('offers no way forward once blocked', () => {
    const html = renderToStaticMarkup(<AgeGateView blocked onAnswer={vi.fn()} />);

    expect(html).toContain('This app is for adults only');
    expect(html).not.toContain('<button');
  });
});

describe('stored confirmation', () => {
  it('accepts only a yes for the current version', () => {
    expect(loadAdultConfirmation()).toBe(false);
    for (const flag of ['true', '{"version":0,"adult":true}', '{"version":1,"adult":false}', '{']) {
      stored.set(AGE_GATE_KEY, flag);
      expect(loadAdultConfirmation()).toBe(false);
    }
    stored.set(AGE_GATE_KEY, '{"version":1,"adult":true}');
    expect(loadAdultConfirmation()).toBe(true);
  });

  it('is written by confirming', async () => {
    const { useAppStore } = await import('../lib/store');
    expect(useAppStore.getState().adultConfirmed).toBe(false);

    useAppStore.getState().confirmAdult();

    expect(useAppStore.getState().adultConfirmed).toBe(true);
    expect(JSON.parse(stored.get(AGE_GATE_KEY)!)).toEqual({ version: 1, adult: true });
  });
});

describe('app start', () => {
  const renderApp = async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const { default: App } = await import('../App');
    return renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
  };

  it('shows the age gate before anything else, including setup', async () => {
    const html = await renderApp();

    expect(html).toContain('Adults only (18+)');
    expect(html).not.toContain('setup-screen');
  });

  it('moves on once confirmed', async () => {
    stored.set(AGE_GATE_KEY, '{"version":1,"adult":true}');

    const html = await renderApp();

    expect(html).toContain('setup-screen');
    expect(html).not.toContain('Adults only (18+)');
  });
});
