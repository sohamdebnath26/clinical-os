import { useState, useEffect, useRef, useCallback } from 'react';

// Web Speech API TypeScript declarations
export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

export interface UseSpeechToTextOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const {
    lang = 'en-US',
    continuous = true,
    interimResults = true,
    onTranscript
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Detect support on mount
  useEffect(() => {
    const hasSupport = typeof window !== 'undefined' && Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
    setIsSupported(hasSupport);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback((customLang?: string) => {
    setError(null);
    setInterimTranscript('');

    if (typeof window === 'undefined') return;

    const SpeechRecognitionConstructor = (
      (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => ISpeechRecognition }).webkitSpeechRecognition
    );

    if (!SpeechRecognitionConstructor) {
      setError('Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = customLang || lang || 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptChunk = result[0]?.transcript || '';
          if (result.isFinal) {
            finalText += transcriptChunk;
          } else {
            interimText += transcriptChunk;
          }
        }

        setInterimTranscript(interimText);

        if (finalText && onTranscriptRef.current) {
          onTranscriptRef.current(finalText, true);
        } else if (interimText && onTranscriptRef.current) {
          onTranscriptRef.current(interimText, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        let message = 'Speech recognition error';
        if (event.error === 'not-allowed') {
          message = 'Microphone permission denied. Please allow microphone access in your browser.';
        } else if (event.error === 'no-speech') {
          message = 'No speech was detected. Please try speaking again.';
        } else if (event.error === 'audio-capture') {
          message = 'No microphone was found. Ensure that a microphone is installed.';
        } else if (event.error === 'network') {
          message = 'Network error during speech recognition.';
        }
        setError(message);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start microphone';
      setError(message);
      setIsListening(false);
    }
  }, [continuous, interimResults, lang]);

  const toggleListening = useCallback((customLang?: string) => {
    if (isListening) {
      stopListening();
    } else {
      startListening(customLang);
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    clearError: () => setError(null)
  };
}
