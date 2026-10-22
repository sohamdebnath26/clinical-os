import React, { useState, useEffect } from 'react';
import { Mic, MicOff, AlertCircle, Sparkles, Volume2 } from 'lucide-react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useLanguage } from '../context/LanguageContext';

export interface VoiceDictationButtonProps {
  /**
   * Current text in the input or textarea. If provided alongside onChange,
   * incoming voice transcripts will be cleanly appended with punctuation & spacing.
   */
  value?: string;
  /**
   * Callback invoked with the updated full text value.
   */
  onChange?: (updatedValue: string) => void;
  /**
   * Direct transcript callback receiving final text chunks.
   */
  onTranscript?: (transcript: string) => void;
  /**
   * Visual variant:
   * - 'badge': small compact icon button suitable beside labels or inside input wrappers
   * - 'button': standard button with text label ("Dictate", "Listening...")
   * - 'prominent': larger prominent button with live sound wave animation for clinical notes
   */
  variant?: 'badge' | 'button' | 'prominent';
  /**
   * Optional custom label for the button
   */
  label?: string;
  /**
   * Additional custom CSS classes
   */
  className?: string;
  /**
   * Custom language code, e.g. 'en-US', 'hi-IN'. Defaults to app language.
   */
  language?: string;
  /**
   * Accessible tooltip / title
   */
  title?: string;
  /**
   * Whether to show live interim speech preview bubble
   */
  showLivePreview?: boolean;
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  value = '',
  onChange,
  onTranscript,
  variant = 'badge',
  label,
  className = '',
  language,
  title,
  showLivePreview = true
}) => {
  const { language: appLang } = useLanguage();
  const [showErrorToast, setShowErrorToast] = useState(false);

  // Map app language to speech recognition locale
  const speechLang = language || (appLang === 'hi' ? 'hi-IN' : appLang === 'pa' ? 'pa-IN' : 'en-US');

  const handleFinalTranscript = (spoken: string) => {
    const clean = spoken.trim();
    if (!clean) return;

    if (onTranscript) {
      onTranscript(clean);
    }

    if (onChange) {
      if (!value || !value.trim()) {
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        onChange(capitalized);
      } else {
        const trimmed = value.trim();
        const endsWithPunctuation = /[.!?;,:]$/.test(trimmed);
        const prefix = endsWithPunctuation ? `${trimmed} ` : `${trimmed}. `;
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        onChange(`${prefix}${capitalized}`);
      }
    }
  };

  const {
    isListening,
    interimTranscript,
    error,
    isSupported,
    toggleListening,
    clearError
  } = useSpeechToText({
    lang: speechLang,
    continuous: true,
    interimResults: true,
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        handleFinalTranscript(text);
      }
    }
  });

  useEffect(() => {
    if (error) {
      setShowErrorToast(true);
      const timer = setTimeout(() => {
        setShowErrorToast(false);
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const defaultTitle = isListening
    ? 'Listening to speech... Tap to stop'
    : 'Click to dictate notes with your microphone (Speech-to-Text)';

  return (
    <div className="relative inline-flex items-center">
      {/* 1. BADGE VARIANT (Compact icon button) */}
      {variant === 'badge' && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => toggleListening(speechLang)}
          title={title || defaultTitle}
          aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
          aria-pressed={isListening}
          className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
            isListening
              ? 'bg-rose-600 text-white ring-2 ring-rose-400 ring-offset-1 animate-pulse shadow-xs'
              : 'text-slate-400 hover:text-teal-700 hover:bg-teal-50 border border-slate-200 bg-white'
          } ${className}`}
        >
          {isListening ? (
            <MicOff className="w-3.5 h-3.5 text-white" />
          ) : (
            <Mic className="w-3.5 h-3.5" />
          )}

          {isListening && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
          )}
        </button>
      )}

      {/* 2. BUTTON VARIANT (Standard with text label) */}
      {variant === 'button' && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => toggleListening(speechLang)}
          title={title || defaultTitle}
          aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
          aria-pressed={isListening}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer shadow-2xs ${
            isListening
              ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-400/50'
              : 'bg-white hover:bg-teal-50/70 border-slate-200 hover:border-teal-300 text-slate-700 hover:text-teal-800'
          } ${className}`}
        >
          {isListening ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
              </span>
              <MicOff className="w-3.5 h-3.5 text-rose-600" />
              <span className="text-rose-700 font-bold">Listening... (Stop)</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-teal-700" />
              <span>{label || 'Dictate'}</span>
            </>
          )}
        </button>
      )}

      {/* 3. PROMINENT CLINICAL VARIANT (Hero button with sound waves) */}
      {variant === 'prominent' && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => toggleListening(speechLang)}
          title={title || defaultTitle}
          aria-label={isListening ? 'Stop voice dictation' : 'Start clinical voice dictation'}
          aria-pressed={isListening}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer ${
            isListening
              ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400 ring-offset-1'
              : 'bg-teal-800 hover:bg-teal-900 text-white'
          } ${className}`}
        >
          {isListening ? (
            <>
              <div className="flex items-center gap-0.5 h-3.5">
                <span className="w-0.5 h-3 bg-white animate-pulse" />
                <span className="w-0.5 h-4 bg-white animate-pulse delay-75" />
                <span className="w-0.5 h-2 bg-white animate-pulse delay-150" />
                <span className="w-0.5 h-3.5 bg-white animate-pulse delay-100" />
              </div>
              <MicOff className="w-3.5 h-3.5 text-white" />
              <span>Stop Dictation</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-teal-200" />
              <span>{label || 'Voice Dictation (Mic)'}</span>
            </>
          )}
        </button>
      )}

      {/* Live Interim Speech Preview Bubble */}
      {showLivePreview && isListening && interimTranscript && (
        <div
          role="status"
          aria-live="polite"
          className="absolute z-50 right-0 top-full mt-2 min-w-[200px] max-w-xs p-2.5 bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-xl border border-slate-700 text-[11px] animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[10px] uppercase tracking-wider mb-1">
            <Volume2 className="w-3 h-3 animate-pulse" />
            <span>Speaking...</span>
          </div>
          <p className="text-slate-200 italic line-clamp-3 leading-snug">
            &quot;{interimTranscript}&quot;
          </p>
        </div>
      )}

      {/* Error Tooltip */}
      {showErrorToast && error && (
        <div
          role="alert"
          className="absolute z-50 right-0 top-full mt-2 w-64 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl shadow-lg text-[11px] animate-in fade-in duration-150"
        >
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">Voice Input Notice</span>
              <span className="text-[10px] text-rose-700 leading-tight block">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowErrorToast(false);
                clearError();
              }}
              className="text-rose-500 hover:text-rose-800 p-0.5"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
