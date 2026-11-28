import { describe, expect, it } from 'vitest';
import { publishLevel, subscribeLevel, wavEnvelope } from './voice-level';

function wav(samples: number[], rate = 1000): ArrayBuffer {
  const data = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(data);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, data.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true));
  return data;
}

describe('wavEnvelope', () => {
  it('follows loud and quiet parts of the audio', () => {
    const levels = wavEnvelope(wav([...Array(40).fill(0), ...Array(40).fill(16000)]));
    expect(levels).toEqual([0, 1]);
  });

  it('returns nothing for data it cannot read', () => {
    expect(wavEnvelope(new ArrayBuffer(8))).toEqual([]);
    expect(wavEnvelope(new ArrayBuffer(100))).toEqual([]);
  });
});

describe('level subscribers', () => {
  it('receive clamped levels until they unsubscribe', () => {
    const seen: number[] = [];
    const stop = subscribeLevel((l) => seen.push(l));
    publishLevel(2);
    publishLevel(-1);
    stop();
    publishLevel(0.5);
    expect(seen).toEqual([1, 0]);
  });
});
