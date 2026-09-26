import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

type MicStatus = 'idle' | 'starting' | 'listening' | 'denied' | 'unavailable';

const EMPTY_LEVELS = [0, 0, 0, 0, 0, 0, 0, 0];

const expoAudio = (() => {
  try {
    return require('expo-audio') as typeof import('expo-audio');
  } catch (error) {
    if (Platform.OS === 'web' || !(error instanceof Error) || !error.message.includes("Cannot find native module 'ExpoAudio'")) throw error;
    return null;
  }
})();

function useUnavailableMicLevel(_enabled: boolean) {
  return { status: 'unavailable' as MicStatus, levels: EMPTY_LEVELS };
}

export const useMicLevel = expoAudio ? useAvailableMicLevel : useUnavailableMicLevel;

function useAvailableMicLevel(enabled: boolean) {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [levels, setLevels] = useState(EMPTY_LEVELS);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const lastSample = useRef(0);
  const active = useRef(enabled && foreground);
  active.current = enabled && foreground;

  const readLevel = useCallback((samples: Float32Array) => {
    if (!active.current) return;
    const now = Date.now();
    if (now - lastSample.current < 75 || !samples.length) return;
    lastSample.current = now;
    let power = 0;
    for (let i = 0; i < samples.length; i += 4) power += samples[i] * samples[i];
    const rms = Math.sqrt(power / Math.ceil(samples.length / 4));
    const level = Math.min(1, Math.max(0, (rms - 0.005) * 12));
    setLevels((previous) => [...previous.slice(1), level]);
  }, []);

  const { stream } = expoAudio!.useAudioStream({
    encoding: 'float32',
    onBuffer: (buffer) => readLevel(new Float32Array(buffer.data)),
  });

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !foreground) {
      setStatus('idle');
      setLevels(EMPTY_LEVELS);
      return;
    }

    let cancelled = false;
    active.current = true;
    setStatus('starting');
    lastSample.current = 0;

    if (Platform.OS === 'web') {
      let media: MediaStream | null = null;
      let context: AudioContext | null = null;
      let source: MediaStreamAudioSourceNode | null = null;
      let analyser: AnalyserNode | null = null;
      let frame = 0;
      const release = () => {
        cancelAnimationFrame(frame);
        source?.disconnect();
        analyser?.disconnect();
        media?.getTracks().forEach((track) => track.stop());
        if (context) void context.close();
        source = null;
        analyser = null;
        media = null;
        context = null;
      };

      const start = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            setStatus('unavailable');
            return;
          }
          media = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            release();
            return;
          }
          context = new AudioContext();
          source = context.createMediaStreamSource(media);
          analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          await context.resume();
          if (cancelled) {
            release();
            return;
          }
          const samples = new Float32Array(analyser.fftSize);
          const sample = () => {
            analyser?.getFloatTimeDomainData(samples);
            readLevel(samples);
            frame = requestAnimationFrame(sample);
          };
          setStatus('listening');
          sample();
        } catch (error) {
          release();
          if (!cancelled) setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable');
        }
      };
      void start();
      return () => {
        cancelled = true;
        active.current = false;
        release();
      };
    }

    let nativeStarted = false;
    const start = async () => {
      try {
        const permission = await expoAudio!.requestRecordingPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) {
          setStatus('denied');
          return;
        }
        await stream.start();
        nativeStarted = true;
        if (cancelled) {
          stream.stop();
          nativeStarted = false;
        }
        else setStatus('listening');
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    };
    void start();
    return () => {
      cancelled = true;
      active.current = false;
      if (nativeStarted) stream.stop();
    };
  }, [enabled, foreground, readLevel, stream]);

  return { status, levels };
}
