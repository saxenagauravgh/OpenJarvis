import { describe, expect, it } from 'vitest';
import { liveSource } from './speech-source';

describe('liveSource', () => {
  it('gives the first sentence before the reply is finished', async () => {
    const source = liveSource();
    const first = source.next();
    source.update('The net force equals mass times acceleration. Now consider');
    expect(await first).toBe('The net force equals mass times acceleration.');
    source.end('The net force equals mass times acceleration. Now consider friction.');
    expect(await source.next()).toBe('Now consider friction.');
    expect(await source.next()).toBeNull();
  });

  it('does not cut a sentence inside maths', async () => {
    const source = liveSource();
    const first = source.next();
    source.update('We know that the equation $x = 2. \\ y = 3$ holds here. Next ');
    expect(await first).toContain('holds here.');
  });

  it('speaks every part of a long reply once', async () => {
    const text = Array.from({ length: 60 }, (_, i) => `This is sentence number ${i}.`).join(' ');
    const source = liveSource();
    source.end(text);
    const pieces: string[] = [];
    for (let p = await source.next(); p !== null; p = await source.next()) pieces.push(p);
    expect(pieces.join(' ')).toBe(text);
    expect(Math.max(...pieces.map((p) => p.length))).toBeLessThanOrEqual(1200);
  });

  it('stops waiting when closed', async () => {
    const source = liveSource();
    const pending = source.next();
    source.close();
    expect(await pending).toBeNull();
  });
});
