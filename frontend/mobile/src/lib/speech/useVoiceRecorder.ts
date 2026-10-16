import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { speechEngine, type SpeechSession } from './index';

function hasWebSpeech(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface UseVoiceRecorderOptions {
  onResult?: (finalText: string) => void;
  onError?: (errMessage: string) => void;
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  partialText: string;
  micLevel: number;
  startRecording: () => void;
  stopRecording: () => Promise<string>;
  cancelRecording: () => void;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const { onResult, onError } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [micLevel, setMicLevel] = useState(0);

  const sessionRef = useRef<SpeechSession | null>(null);
  const recognitionRef = useRef<any>(null);
  const fullTextRef = useRef('');
  const mountedRef = useRef(true);
  const releasedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (!hasWebSpeech() && speechEngine.supported) {
      speechEngine.prepare().catch(() => undefined);
      speechEngine.requestPermission().catch(() => undefined);
    }
    return () => {
      mountedRef.current = false;
      if (sessionRef.current) {
        void sessionRef.current.stop().catch(() => undefined);
        sessionRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (isRecording) return;
    const webSpeech = hasWebSpeech();

    if (!webSpeech && !speechEngine.supported) {
      onError?.('Thiết bị chưa hỗ trợ nhận dạng giọng nói.');
      return;
    }

    fullTextRef.current = '';
    setPartialText('');
    setMicLevel(0);
    setIsRecording(true);
    releasedRef.current = false;

    // Web Speech API
    if (webSpeech) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const reco = new SpeechRecognition();
        reco.lang = 'vi-VN';
        reco.continuous = true;
        reco.interimResults = true;

        reco.onresult = (event: any) => {
          let accumulated = '';
          for (let i = 0; i < event.results.length; i++) {
            accumulated += event.results[i][0].transcript + ' ';
          }
          const raw = accumulated.trim();
          if (raw) {
            setPartialText(raw);
            fullTextRef.current = raw;
          }
        };

        reco.onerror = (err: any) => {
          onError?.(err?.error ? `Lỗi micro: ${err.error}` : 'Lỗi nhận dạng giọng nói.');
        };

        recognitionRef.current = reco;
        reco.start();
        return;
      } catch (e) {
        setIsRecording(false);
        onError?.('Không thể khởi động micro trên trình duyệt.');
        return;
      }
    }

    // Native Sherpa-ONNX
    speechEngine
      .start({
        onPartial: (text) => {
          setPartialText(text);
          fullTextRef.current = text;
        },
        onLevel: (level) => {
          setMicLevel(level);
        },
        onError: (message) => {
          onError?.(message);
        },
      })
      .then((session) => {
        if (releasedRef.current || !mountedRef.current) {
          void session.stop().catch(() => undefined);
          return;
        }
        sessionRef.current = session;
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setIsRecording(false);
        setPartialText('');
        onError?.(e instanceof Error ? e.message : String(e));
      });
  }, [isRecording, onError]);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (!isRecording) return '';
    releasedRef.current = true;
    setIsRecording(false);
    setMicLevel(0);

    const shown = partialText;

    // Web Speech
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
      const finalText = (fullTextRef.current || shown).trim();
      setPartialText('');
      if (finalText) onResult?.(finalText);
      return finalText;
    }

    // Native
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      try {
        const text = await session.stop();
        const finalText = (text || fullTextRef.current || shown).trim();
        setPartialText('');
        if (finalText) onResult?.(finalText);
        return finalText;
      } catch (e) {
        setPartialText('');
        onError?.(e instanceof Error ? e.message : String(e));
        return '';
      }
    }

    const finalText = (fullTextRef.current || shown).trim();
    setPartialText('');
    if (finalText) onResult?.(finalText);
    return finalText;
  }, [isRecording, partialText, onResult, onError]);

  const cancelRecording = useCallback(() => {
    releasedRef.current = true;
    setIsRecording(false);
    setPartialText('');
    setMicLevel(0);
    fullTextRef.current = '';

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (sessionRef.current) {
      void sessionRef.current.stop().catch(() => undefined);
      sessionRef.current = null;
    }
  }, []);

  return {
    isRecording,
    partialText,
    micLevel,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
