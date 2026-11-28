/** Apply the settings changes the tutor proposes, once the user agrees. */

import { useAppStore } from './store';
import type { SettingAction } from '../types';

const CHOICES: Record<string, readonly string[]> = {
  theme: ['light', 'dark', 'system', 'hud'],
  font_size: ['small', 'default', 'large'],
  model: ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'qwen2.5:3b'],
};

const LABELS: Record<SettingAction['setting'], string> = {
  theme: 'Theme',
  font_size: 'Text size',
  voice_speed: 'Speaking speed',
  model: 'AI model',
};

/** The app checks proposals itself and never trusts what arrives. */
export function parseAction(setting: string, value: string): SettingAction | undefined {
  const speed = Number(value);
  const allowed =
    setting === 'voice_speed'
      ? Number.isFinite(speed) && speed >= 0.7 && speed <= 1.4
      : Object.prototype.hasOwnProperty.call(CHOICES, setting) &&
        CHOICES[setting].includes(value);
  return allowed
    ? { setting: setting as SettingAction['setting'], value, status: 'proposed' }
    : undefined;
}

export const actionLabel = (action: SettingAction) =>
  `${LABELS[action.setting]}: ${action.value}`;

function read(setting: SettingAction['setting']): string {
  const { settings, selectedModel } = useAppStore.getState();
  if (setting === 'theme') return settings.theme;
  if (setting === 'font_size') return settings.fontSize;
  if (setting === 'voice_speed') return String(settings.voiceSpeed);
  return selectedModel;
}

function write(setting: SettingAction['setting'], value: string): void {
  const store = useAppStore.getState();
  if (setting === 'theme') {
    store.updateSettings({ theme: value as typeof store.settings.theme });
  } else if (setting === 'font_size') {
    store.updateSettings({ fontSize: value as typeof store.settings.fontSize });
  } else if (setting === 'voice_speed') {
    store.updateSettings({ voiceSpeed: Number(value) });
  } else {
    store.setSelectedModel(value);
  }
}

/** Make the change and report the action as applied, remembering the old value. */
export function applyAction(action: SettingAction): SettingAction {
  if (!parseAction(action.setting, action.value)) return { ...action, status: 'dismissed' };
  const previous = read(action.setting);
  write(action.setting, action.value);
  return { ...action, status: 'applied', previous };
}

export function undoAction(action: SettingAction): SettingAction {
  if (action.previous !== undefined) write(action.setting, action.previous);
  return { ...action, status: 'proposed', previous: undefined };
}
