/** Runs the static worklet files with stand-ins for the audio thread. */
import { describe, expect, it } from 'vitest';
import captureCode from '../../../public/audio/pcm-capture.worklet.js?raw';
import playbackCode from '../../../public/audio/pcm-playback.worklet.js?raw';

const SOURCES: Record<string, string> = {
  'pcm-capture': captureCode,
  'pcm-playback': playbackCode,
};

interface Posted {
  type: string;
  pcm?: ArrayBuffer;
  level?: number;
}

function loadWorklet(name: string, deviceRate: number) {
  const posted: Posted[] = [];
  class Processor {
    port = {
      onmessage: null as null | ((event: { data: unknown }) => void),
      postMessage: (message: Posted) => posted.push(message),
    };
  }
  let Registered: any;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', SOURCES[name])(
    Processor,
    (registeredName: string, type: unknown) => {
      expect(registeredName).toBe(name);
      Registered = type;
    },
    deviceRate,
  );
  return { node: new Registered(), posted };
}

/** Feed samples in the 128-frame blocks the browser uses. */
function capture(rate: number, samples: Float32Array) {
  const { node, posted } = loadWorklet('pcm-capture', rate);
  for (let at = 0; at < samples.length; at += 128) {
    expect(node.process([[samples.subarray(at, at + 128)]])).toBe(true);
  }
  return posted;
}

describe('capture worklet', () => {
  it.each([48000, 44100, 16000, 24000])('makes 30 ms chunks of 16 kHz from %i Hz', (rate) => {
    const posted = capture(rate, new Float32Array(rate).fill(0.5)); // one second
    // 33 whole chunks; the rest waits for more audio.
    expect(posted).toHaveLength(33);
    for (const chunk of posted) {
      expect(chunk.pcm!.byteLength).toBe(480 * 2);
      expect(chunk.level).toBeCloseTo(0.5, 4);
    }
    const values = new Int16Array(posted[32].pcm!);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(16383);
    expect(Math.max(...values)).toBeLessThanOrEqual(16384);
  });

  it('keeps the shape of a tone', () => {
    const rate = 48000;
    const tone = Float32Array.from({ length: 2880 }, (_, i) =>
      Math.sin((2 * Math.PI * 200 * i) / rate),
    );
    const values = new Int16Array(capture(rate, tone)[0].pcm!);
    values.forEach((value, i) => {
      // Each output sample is centred one input sample into its three.
      const expected = Math.sin((2 * Math.PI * 200 * (i * 3 + 1)) / rate);
      expect(Math.abs(value / 32767 - expected)).toBeLessThan(0.002);
    });
  });

  it('clips instead of wrapping around', () => {
    const loud = Float32Array.from({ length: 960 }, (_, i) => (i < 480 ? 2 : -2));
    const values = new Int16Array(capture(16000, loud)[0].pcm!);
    expect(values[0]).toBe(32767);
    const next = new Int16Array(capture(16000, loud.subarray(480))[0].pcm!);
    expect(next[0]).toBe(-32768);
  });

  it('waits quietly with no input', () => {
    const { node, posted } = loadWorklet('pcm-capture', 48000);
    expect(node.process([[]])).toBe(true);
    expect(posted).toEqual([]);
  });
});

function player(rate: number) {
  const { node, posted } = loadWorklet('pcm-playback', rate);
  const send = (data: unknown) => node.port.onmessage({ data });
  const audio = (values: number[] | Int16Array) =>
    send({ type: 'audio', pcm: Int16Array.from(values).buffer });
  const render = (frames = 128) => {
    const out = new Float32Array(frames);
    expect(node.process([], [[out]])).toBe(true);
    return out;
  };
  return { node, posted, send, audio, render };
}

describe('playback worklet', () => {
  it('plays 24 kHz audio at the device rate', () => {
    const { audio, render } = player(48000);
    audio([0, 16384, -16384]);
    expect([...render(8)]).toEqual([0, 0.25, 0.5, 0, -0.5, -0.5, 0, 0]);
  });

  it('keeps every sample across blocks and chunks', () => {
    const { audio, render } = player(24000);
    const values = Array.from({ length: 300 }, (_, i) => i * 10);
    audio(values.slice(0, 100));
    audio(values.slice(100));
    const played = [...render(), ...render(), ...render()];
    expect(played.slice(0, 300).map((v) => Math.round(v * 32768))).toEqual(values);
    expect(played.slice(300).every((v) => v === 0)).toBe(true);
  });

  it('lasts as long as the audio at 44.1 kHz', () => {
    const { audio, render } = player(44100);
    audio(new Int16Array(24000).fill(1000));
    const out = render(48000);
    const sounding = out.filter((v) => v !== 0).length;
    expect(Math.abs(sounding - 44100)).toBeLessThanOrEqual(2);
  });

  it('reports its loudness, then that it has run out', () => {
    const { audio, render, posted } = player(24000);
    audio(new Int16Array(2000).fill(16384));
    for (let i = 0; i < 20; i += 1) render();
    expect(posted.filter((m) => m.type === 'level').length).toBe(2);
    expect(posted[0].level).toBeCloseTo(0.5, 4);
    expect(posted.filter((m) => m.type === 'drained')).toHaveLength(1);
    expect(posted[posted.length - 1].type).toBe('drained');
  });

  it('falls silent at once when flushed, and plays what comes after', () => {
    const { audio, send, render, posted } = player(24000);
    audio(new Int16Array(48000).fill(16384));
    expect(render()[0]).toBe(0.5);
    send({ type: 'flush' });
    expect(posted.map((m) => m.type)).toEqual(['drained']);
    expect(render().every((v) => v === 0)).toBe(true);
    audio([-16384]);
    expect(render()[0]).toBe(-0.5);
  });

  it('holds more than its first ring, in order, after wrapping', () => {
    const { audio, render, node } = player(24000);
    const first = node.ring.length;
    audio(new Int16Array(first).fill(1));
    render(1000);
    audio(new Int16Array(first).fill(2)); // grows while wrapped
    expect(node.ring.length).toBe(first * 2);
    const out = render(2 * first);
    expect(Math.round(out[0] * 32768)).toBe(1);
    expect(Math.round(out[first - 1001] * 32768)).toBe(1);
    expect(Math.round(out[first - 1000] * 32768)).toBe(2);
    expect(Math.round(out[2 * first - 1001] * 32768)).toBe(2);
    expect(out[2 * first - 1000]).toBe(0);
  });
});
