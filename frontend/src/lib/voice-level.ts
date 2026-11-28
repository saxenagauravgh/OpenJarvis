/**
 * Loudness (0 to 1) of whoever is talking, for animating the orb. It changes
 * many times a second, so listeners update the DOM directly instead of React.
 */
type Listener = (level: number) => void;

const listeners = new Set<Listener>();

export function publishLevel(level: number): void {
  const value = Math.min(Math.max(level, 0), 1);
  for (const listener of listeners) listener(value);
}

export function subscribeLevel(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const ENVELOPE_STEP_SECONDS = 0.04;

/**
 * Loudness over time of a 16-bit PCM WAV, scaled so its loudest moments are 1.
 * Reading the samples leaves playback untouched. Other formats give [].
 */
export function wavEnvelope(data: ArrayBuffer): number[] {
  if (data.byteLength < 44) return [];
  const view = new DataView(data);
  const tag = (at: number) =>
    String.fromCharCode(...new Uint8Array(data, at, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return [];
  let rate = 0;
  let channels = 1;
  for (let at = 12; at + 8 <= data.byteLength; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') {
      if (view.getUint16(at + 22, true) !== 16) return [];
      channels = view.getUint16(at + 10, true) || 1;
      rate = view.getUint32(at + 12, true);
    } else if (tag(at) === 'data' && rate) {
      const end = Math.min(at + 8 + size, data.byteLength);
      const stride = channels * 2;
      const window = Math.max(1, Math.round(rate * ENVELOPE_STEP_SECONDS)) * stride;
      const levels: number[] = [];
      for (let from = at + 8; from + 1 < end; from += window) {
        let sum = 0;
        let count = 0;
        for (let i = from; i + 1 < Math.min(from + window, end); i += stride) {
          const sample = view.getInt16(i, true) / 32768;
          sum += sample * sample;
          count += 1;
        }
        levels.push(count ? Math.sqrt(sum / count) : 0);
      }
      const sorted = [...levels].sort((a, b) => a - b);
      const peak = sorted[Math.floor(sorted.length * 0.95)] || 1;
      return levels.map((l) => Math.min(1, l / peak));
    }
    at += 8 + size + (size % 2);
  }
  return [];
}
