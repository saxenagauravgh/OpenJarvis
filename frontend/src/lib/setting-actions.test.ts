import { describe, expect, it } from 'vitest';
import { parseAction } from './setting-actions';

describe('parseAction', () => {
  it('accepts only listed settings and values', () => {
    expect(parseAction('theme', 'light')?.status).toBe('proposed');
    expect(parseAction('voice_speed', '1.2')).toBeDefined();
    expect(parseAction('theme', 'pink')).toBeUndefined();
    expect(parseAction('voice_speed', '9')).toBeUndefined();
    expect(parseAction('apiKey', 'secret')).toBeUndefined();
    expect(parseAction('toString', 'x')).toBeUndefined();
  });
});
