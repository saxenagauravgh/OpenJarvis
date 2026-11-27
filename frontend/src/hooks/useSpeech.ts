import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, fetchSpeechHealth } from '../lib/api';

export type SpeechState = 'idle' | 'recording' | 'transcribing';

export function useSpeech() {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    setState('idle');
  }, []);

  /**
   * Hands-free capture for conversation mode: record until the speaker has
   * talked and then paused for `silenceMs`, then transcribe. Resolves '' when
   * nobody speaks within `noSpeechMs` or the recording is cancelled.
   */
  const listen = useCallback(
    async (
      opts: { silenceMs?: number; noSpeechMs?: number; maxMs?: number } = {},
    ): Promise<string> => {
      const silenceMs = opts.silenceMs ?? 1400;
      const noSpeechMs = opts.noSpeechMs ?? 20000;
      const maxMs = opts.maxMs ?? 60000;

      await startRecording();
      const stream = streamRef.current;
      const recorder = mediaRecorderRef.current;
      if (!stream || !recorder) return '';

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      const started = performance.now();
      let heard = false;
      let lastLoud = started;
      let noiseFloor = 0;
      let floorSamples = 0;

      return new Promise<string>((resolve) => {
        const finish = (result: Promise<string> | string) => {
          void ctx.close().catch(() => {});
          Promise.resolve(result).then(resolve, () => resolve(''));
        };
        const tick = () => {
          // Cancelled from outside (conversation switched off, page change).
          if (mediaRecorderRef.current !== recorder || recorder.state !== 'recording') {
            finish('');
            return;
          }
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += v * v;
          const rms = Math.sqrt(sum / samples.length);
          const now = performance.now();
          // Learn the room's noise level for the first ~300 ms.
          if (now - started < 300) {
            noiseFloor = (noiseFloor * floorSamples + rms) / (floorSamples + 1);
            floorSamples += 1;
          } else if (rms > Math.max(0.015, noiseFloor * 3)) {
            heard = true;
            lastLoud = now;
          }
          if ((heard && now - lastLoud > silenceMs) || now - started > maxMs) {
            finish(stopRecording());
            return;
          }
          if (!heard && now - started > noSpeechMs) {
            cancelRecording();
            finish('');
            return;
          }
          window.setTimeout(tick, 100);
        };
        window.setTimeout(tick, 100);
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
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
  };
}
