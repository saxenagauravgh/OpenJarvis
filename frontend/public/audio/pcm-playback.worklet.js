/**
 * Playback for live voice: buffers 24 kHz mono PCM16 in a ring, resamples it
 * to the device rate, reports its loudness and empties at once on interrupt.
 *
 * In:  { type: 'audio', pcm: ArrayBuffer } | { type: 'flush' }
 * Out: { type: 'level', level } about every 40 ms while playing,
 *      { type: 'drained' } when there is nothing left to play.
 */
const SOURCE_RATE = 24000;
// Audio arrives faster than it is spoken, so the ring grows when needed.
const INITIAL_SAMPLES = SOURCE_RATE * 30;
const MAX_SAMPLES = SOURCE_RATE * 600;
const REPORT_SECONDS = 0.04;

class PcmPlayback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = SOURCE_RATE / sampleRate;
    this.ring = new Float32Array(INITIAL_SAMPLES);
    this.clear();
    this.playing = false;
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'audio') this.push(message.pcm);
      else if (message.type === 'flush') {
        this.clear();
        this.playing = false;
        this.port.postMessage({ type: 'drained' });
      }
    };
  }

  clear() {
    this.read = 0;
    this.count = 0;
    /** Position between the sample at `read` and the next one. */
    this.position = 0;
    this.energy = 0;
    this.measured = 0;
  }

  reserve(extra) {
    let size = this.ring.length;
    if (this.count + extra <= size) return;
    while (size < this.count + extra && size < MAX_SAMPLES) size *= 2;
    size = Math.min(size, MAX_SAMPLES);
    const next = new Float32Array(size);
    for (let i = 0; i < this.count; i += 1) {
      next[i] = this.ring[(this.read + i) % this.ring.length];
    }
    this.ring = next;
    this.read = 0;
  }

  push(buffer) {
    const samples = new Int16Array(buffer, 0, buffer.byteLength >> 1);
    this.reserve(samples.length);
    const size = this.ring.length;
    for (let i = 0; i < samples.length; i += 1) {
      if (this.count === size) {
        // Full at the largest size: lose the oldest sample.
        this.read = (this.read + 1) % size;
        this.count -= 1;
      }
      this.ring[(this.read + this.count) % size] = samples[i] / 32768;
      this.count += 1;
    }
  }

  process(_inputs, outputs) {
    const channels = outputs[0];
    const out = channels[0];
    const size = this.ring.length;
    for (let i = 0; i < out.length; i += 1) {
      if (this.count === 0) {
        out[i] = 0;
        continue;
      }
      const from = this.ring[this.read];
      const to = this.count > 1 ? this.ring[(this.read + 1) % size] : from;
      const value = from + (to - from) * this.position;
      out[i] = value;
      this.energy += value * value;
      this.measured += 1;
      this.playing = true;
      this.position += this.step;
      while (this.position >= 1 && this.count > 0) {
        this.position -= 1;
        this.read = (this.read + 1) % size;
        this.count -= 1;
      }
      if (this.count === 0) this.position = 0;
    }
    for (let c = 1; c < channels.length; c += 1) channels[c].set(out);

    if (this.measured >= sampleRate * REPORT_SECONDS) {
      this.port.postMessage({
        type: 'level',
        level: Math.sqrt(this.energy / this.measured),
        remaining: this.count,
      });
      this.energy = 0;
      this.measured = 0;
    }
    if (this.playing && this.count === 0) {
      this.playing = false;
      this.energy = 0;
      this.measured = 0;
      this.port.postMessage({ type: 'drained' });
    }
    return true;
  }
}

registerProcessor('pcm-playback', PcmPlayback);
