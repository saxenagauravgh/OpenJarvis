/**
 * Microphone capture for live voice: resamples the device rate to 16 kHz mono
 * PCM16 and posts 30 ms chunks, each with its loudness (RMS, 0 to 1).
 * A static file because the app's CSP does not allow generated scripts.
 */
const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 480; // 30 ms

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Input samples that make up one output sample (may be fractional). */
    this.ratio = sampleRate / TARGET_RATE;
    this.need = this.ratio;
    this.sum = 0;
    this.chunk = new Int16Array(CHUNK_SAMPLES);
    this.filled = 0;
    this.energy = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    // Each output sample is the average of the input it covers, which also
    // filters out most of what 16 kHz cannot carry.
    for (let i = 0; i < input.length; i += 1) {
      let left = 1;
      while (left > 0) {
        const take = Math.min(left, this.need);
        this.sum += input[i] * take;
        this.need -= take;
        left -= take;
        if (this.need <= 1e-9) {
          this.emit(this.sum / this.ratio);
          this.sum = 0;
          this.need = this.ratio;
        }
      }
    }
    return true;
  }

  emit(value) {
    const sample = Math.max(-1, Math.min(1, value));
    this.chunk[this.filled] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    this.filled += 1;
    this.energy += sample * sample;
    if (this.filled < CHUNK_SAMPLES) return;
    const pcm = this.chunk.buffer;
    const level = Math.sqrt(this.energy / CHUNK_SAMPLES);
    this.port.postMessage({ type: 'chunk', pcm, level }, [pcm]);
    this.chunk = new Int16Array(CHUNK_SAMPLES);
    this.filled = 0;
    this.energy = 0;
  }
}

registerProcessor('pcm-capture', PcmCapture);
