/** Decide from microphone levels (RMS) when the user has started speaking. */

export interface VoiceDetector {
  /** Feed one level reading; true while sustained speech is present. */
  push: (rms: number, now: number) => boolean;
  /** Level currently needed to count as speech, once known. */
  threshold?: () => number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function sustained(sustainMs: number) {
  let since: number | null = null;
  return (loud: boolean, now: number) => {
    if (!loud) since = null;
    else since ??= now;
    return since !== null && now - since >= sustainMs;
  };
}

/**
 * For a quiet room. The noise floor is the quietest level heard so far, so
 * someone who starts talking at once does not raise their own threshold.
 */
export function quietDetector(): VoiceDetector {
  let floor = Number.POSITIVE_INFINITY;
  const held = sustained(100);
  return {
    push: (rms, now) => {
      floor = Math.min(floor, rms);
      return held(rms > clamp(floor * 3, 0.015, 0.05), now);
    },
  };
}

/**
 * For interrupting while Jarvis talks. It first measures how loudly its own
 * voice reaches the microphone, then needs clearly louder, sustained speech.
 * Echo cancellation also quietens the user during playback, so the bar is low;
 * `isEcho` catches Jarvis hearing itself.
 */
export function interruptDetector(calibrationMs = 700): VoiceDetector {
  let started: number | null = null;
  const echo: number[] = [];
  const held = sustained(200);
  let threshold = 0;
  return {
    push: (rms, now) => {
      started ??= now;
      if (now - started < calibrationMs) {
        echo.push(rms);
        return false;
      }
      if (!threshold) {
        // The upper quartile, so a word spoken during calibration counts less.
        const sorted = [...echo].sort((a, b) => a - b);
        const loudEcho = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
        threshold = clamp(loudEcho * 1.7, 0.025, 0.12);
      }
      return held(rms > threshold, now);
    },
    threshold: () => threshold,
  };
}

/** True when a transcript is mostly Jarvis's own words picked up by the mic. */
export function isEcho(heard: string, spoken: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const mine = words(heard);
  if (mine.length < 3) return false;
  const theirs = new Set(words(spoken));
  return mine.filter((w) => theirs.has(w)).length / mine.length >= 0.75;
}
