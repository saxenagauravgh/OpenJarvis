import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, fetchSpeechHealth } from '../lib/api';
import { interruptDetector, quietDetector } from '../lib/voice-detector';
import { publishLevel } from '../lib/voice-level';

export type SpeechState = 'idle' | 'recording' | 'transcribing';

export function useSpeech() {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  /** True while the user's voice is being picked up in conversation mode. */
  const [hearing, setHearing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Check if speech backend is available on mount
  useEffect(() => {
    fetchSpeechHealth()
      .then((health) => setAvailable(health.available))
      .catch(() => setAvailable(false));
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState('recording');
    } catch (err) {
      setError('Microphone access denied');
      setState('idle');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }

      recorder.onstop = async () => {
        setState('transcribing');

        // Stop all audio tracks
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];

        try {
          const result = await transcribeAudio(blob);
          setState('idle');
          resolve(result.text);
        } catch (err) {
          setState('idle');
          const msg = err instanceof Error ? err.message : 'Transcription failed';
          setError(msg);
          reject(err);
        }
      };

      recorder.stop();
    });
  }, []);

  /** Stop recording and discard the audio (no transcription). */
  const cancelRecording = useCallback((): void => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state === 'recording') recorder.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setHearing(false);
    setState('idle');
  }, []);

  /**
   * Hands-free capture for conversation mode: record until the user has talked
   * and then paused for `silenceMs`, then transcribe. Resolves '' when nobody
   * speaks within `noSpeechMs` or the recording is cancelled.
   *
   * With `isBusy`, it also listens while Jarvis is thinking or talking, so the
   * user can interrupt: `onSpeech(true)` fires when they do. `onQuiet` fires if
   * Jarvis finishes without being interrupted.
   */
  const listen = useCallback(
    async (
      opts: {
        silenceMs?: number;
        noSpeechMs?: number;
        maxMs?: number;
        isBusy?: () => boolean;
        isPlaying?: () => boolean;
        onSpeech?: (interrupted: boolean) => void;
        onQuiet?: () => void;
      } = {},
    ): Promise<string> => {
      const silenceMs = opts.silenceMs ?? 1400;
      const noSpeechMs = opts.noSpeechMs ?? 20000;
      const maxMs = opts.maxMs ?? 60000;

      await startRecording();
      const stream = streamRef.current;
      let recorder = mediaRecorderRef.current;
      if (!stream || !recorder) return '';

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      void ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      /** Drop what has been recorded so far (silence, or Jarvis's own voice). */
      const restartRecorder = () => {
        const old = recorder as MediaRecorder;
        old.ondataavailable = null;
        old.stop();
        chunksRef.current = [];
        const next = new MediaRecorder(stream);
        next.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        next.start();
        mediaRecorderRef.current = next;
        recorder = next;
      };

      let busy = opts.isBusy?.() ?? false;
      let playing = false;
      let detector = busy ? interruptDetector() : quietDetector();
      let waitingSince = performance.now();
      let recordingSince = waitingSince;
      let speechSince: number | null = null;
      let lastLoud = waitingSince;
      let calibrated = false;
      // Kept on this computer only, for tuning how easily Jarvis is interrupted.
      const heardLevels = { whileReplying: 0, threshold: 0, interrupted: false };

      return new Promise<string>((resolve) => {
        const finish = (result: Promise<string> | string) => {
          void ctx.close().catch(() => {});
          if (heardLevels.whileReplying > 0) {
            try {
              localStorage.setItem(
                'openjarvis-voice-debug',
                JSON.stringify({ ...heardLevels, at: new Date().toISOString() }),
              );
            } catch {
              // Diagnostics only.
            }
          }
          Promise.resolve(result).then(resolve, () => resolve(''));
        };
        const tick = () => {
          // Cancelled from outside (conversation switched off, page change).
          if (mediaRecorderRef.current !== recorder || recorder?.state !== 'recording') {
            finish('');
            return;
          }
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += v * v;
          const rms = Math.sqrt(sum / samples.length);
          const now = performance.now();
          if (busy && speechSince === null) {
            heardLevels.whileReplying = Math.max(heardLevels.whileReplying, rms);
            heardLevels.threshold = detector.threshold?.() ?? heardLevels.threshold;
          }
          // Animate the orb with the user's voice (not with Jarvis's echo).
          if (speechSince !== null || !busy) publishLevel(rms * 7);

          if (speechSince === null) {
            const stillBusy = opts.isBusy?.() ?? false;
            const nowPlaying = stillBusy && (opts.isPlaying?.() ?? false);
            if (busy && !stillBusy) {
              // Jarvis finished: listen normally, without its voice recorded.
              detector = quietDetector();
              restartRecorder();
              waitingSince = recordingSince = now;
              opts.onQuiet?.();
            } else if (nowPlaying && !playing && !calibrated) {
              // It has just started talking: measure its echo, once per reply.
              detector = interruptDetector();
              calibrated = true;
            } else if (stillBusy && now - recordingSince > 4000) {
              restartRecorder();
              recordingSince = now;
            }
            busy = stillBusy;
            playing = nowPlaying;
          }

          if (detector.push(rms, now)) {
            lastLoud = now;
            if (speechSince === null) {
              speechSince = now;
              heardLevels.interrupted = busy;
              setHearing(true);
              opts.onSpeech?.(busy);
              // After an interruption the room is quiet again.
              if (busy) detector = quietDetector();
              busy = false;
            }
          }

          if (
            speechSince !== null &&
            (now - lastLoud > silenceMs || now - speechSince > maxMs)
          ) {
            setHearing(false);
            publishLevel(0);
            finish(stopRecording());
            return;
          }
          if (speechSince === null && !busy && now - waitingSince > noSpeechMs) {
            cancelRecording();
            finish('');
            return;
          }
          window.setTimeout(step, 50);
        };
        // A failure must end this round, or listening would never restart.
        const step = () => {
          try {
            tick();
          } catch {
            cancelRecording();
            finish('');
          }
        };
        window.setTimeout(step, 50);
      });
    },
    [startRecording, stopRecording, cancelRecording],
  );

  return {
    state,
    error,
    available,
    startRecording,
    stopRecording,
    cancelRecording,
    listen,
    hearing,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
  };
}
