import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelInfo } from '../types';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const SAVED_MODEL_KEY = 'openjarvis-selected-model';

const model = (id: string): ModelInfo => ({
  id,
  object: 'model',
  created: 0,
  owned_by: 'openjarvis',
});

beforeEach(() => {
  vi.resetModules();
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    new MemoryStorage();
});

afterEach(() => {
  (globalThis as unknown as { localStorage?: MemoryStorage }).localStorage =
    undefined;
});

describe('setModels', () => {
  it('does not select an embedding-only model', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({ selectedModel: '' });

    useAppStore.getState().setModels([model('nomic-embed-text')]);

    expect(useAppStore.getState().selectedModel).toBe('');
  });

  it('clears a missing selection when no chat fallback exists', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.getState().setSelectedModel('deleted-chat-model');

    useAppStore.getState().setModels([model('nomic-embed-text')]);

    expect(useAppStore.getState().selectedModel).toBe('');
  });

  it('replaces an embedding selection with an available chat model', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.getState().setSelectedModel('all-minilm:latest');

    useAppStore.getState().setModels([
      model('all-minilm:latest'),
      model('qwen3.5:4b'),
    ]);

    expect(useAppStore.getState().selectedModel).toBe('qwen3.5:4b');
  });
});

describe('selected model persistence', () => {
  const relaunch = async () => {
    vi.resetModules();
    return (await import('./store')).useAppStore;
  };

  it('defaults to gemini-2.5-flash when nothing was chosen', async () => {
    const store = await relaunch();
    expect(store.getState().selectedModel).toBe('gemini-2.5-flash');

    store.getState().setModels([model('qwen2.5:3b')]);

    expect(store.getState().selectedModel).toBe('gemini-2.5-flash');
    expect(localStorage.getItem(SAVED_MODEL_KEY)).toBeNull();
  });

  it('restores a chosen cloud model after a relaunch', async () => {
    (await relaunch()).getState().setSelectedModel('gemini-3.1-pro-preview');

    const store = await relaunch();
    store.getState().setModels([model('qwen2.5:3b')]);

    expect(store.getState().selectedModel).toBe('gemini-3.1-pro-preview');
  });

  it('restores a chosen local model after a relaunch', async () => {
    (await relaunch()).getState().setSelectedModel('qwen2.5:3b');

    const store = await relaunch();
    store.getState().setModels([model('llama3.2:3b'), model('qwen2.5:3b')]);

    expect(store.getState().selectedModel).toBe('qwen2.5:3b');
  });

  it('returns to the chosen local model once it appears in the list', async () => {
    (await relaunch()).getState().setSelectedModel('qwen2.5:3b');
    const store = await relaunch();

    store.getState().setModels([model('llama3.2:3b')]);
    expect(store.getState().selectedModel).toBe('llama3.2:3b');
    expect(localStorage.getItem(SAVED_MODEL_KEY)).toBe('qwen2.5:3b');

    store.getState().setModels([model('llama3.2:3b'), model('qwen2.5:3b')]);
    expect(store.getState().selectedModel).toBe('qwen2.5:3b');
  });

  it('prefers the saved choice over the default-model setting', async () => {
    localStorage.setItem('openjarvis-settings', JSON.stringify({ defaultModel: 'llama3.2:3b' }));
    expect((await relaunch()).getState().selectedModel).toBe('llama3.2:3b');

    localStorage.setItem(SAVED_MODEL_KEY, 'gemini-2.5-flash');
    const store = await relaunch();
    store.getState().setModels([model('llama3.2:3b')]);

    expect(store.getState().selectedModel).toBe('gemini-2.5-flash');
  });
});
