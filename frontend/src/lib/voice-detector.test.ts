import { describe, expect, it } from 'vitest';
import { interruptDetector, isEcho, quietDetector, type VoiceDetector } from './voice-detector';

/** Feed one reading every 50 ms and return the time speech was first detected. */
function firstDetection(detector: VoiceDetector, levels: number[]): number | null {
  for (let i = 0; i < levels.length; i += 1) {
    if (detector.push(levels[i], i * 50)) return i * 50;
  }
  return null;
}
const run = (level: number, count: number) => Array<number>(count).fill(level);

describe('quietDetector', () => {
  it('hears someone who speaks after a moment of silence, quickly', () => {
    const at = firstDetection(quietDetector(), [...run(0.003, 6), ...run(0.12, 10)]);
    expect(at).toBe(400);
  });

  it('hears someone who is talking from the very first reading', () => {
    const levels = [...run(0.12, 4), 0.004, ...run(0.12, 10)];
    expect(firstDetection(quietDetector(), levels)).not.toBeNull();
  });

  it('ignores a single click and steady background noise', () => {
    expect(firstDetection(quietDetector(), [...run(0.003, 5), 0.3, ...run(0.003, 20)])).toBeNull();
    expect(firstDetection(quietDetector(), run(0.012, 60))).toBeNull();
  });
});

describe('interruptDetector', () => {
  it('ignores the echo of Jarvis but notices a louder speaker', () => {
    const echo = run(0.03, 60);
    expect(firstDetection(interruptDetector(), echo)).toBeNull();
    const withUser = [...run(0.03, 30), ...run(0.15, 20)];
    expect(firstDetection(interruptDetector(), withUser)).toBe(1800);
  });
});

describe('isEcho', () => {
  const spoken = 'The net force equals mass times acceleration.';
  it('recognises Jarvis hearing itself', () => {
    expect(isEcho('net force equals mass times', spoken)).toBe(true);
  });
  it('lets a real question through', () => {
    expect(isEcho('wait, what does net force mean', spoken)).toBe(false);
    expect(isEcho('stop', spoken)).toBe(false);
  });
});
