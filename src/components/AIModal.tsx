import React, { useState, useEffect, useRef } from 'react';
import { Patient } from '../types';
import { api } from '../lib/api';
import { MarkdownView } from './MarkdownView';
import {
  X,
  Sparkles,
  Send,
  FileText,
  Pill,
  Calendar,
  ClipboardList,
  CheckCircle2,
  Bot,
  User,
  ShieldAlert,
  ArrowRight,
  Clock,
  CornerDownLeft,
  Loader2,
  Check
} from 'lucide-react';

interface AIModalProps {
  onClose: () => void;
  activePatient?: Patient | null;
  initialPrompt?: string;
}

interface PendingPrompt {
  text: string;
  contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general';
  startedAt: number;
}

export const AIModal: React.FC<AIModalProps> = ({
  onClose,
  activePatient,
  initialPrompt
}) => {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(activePatient || null);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  const [question, setQuestion] = useState(initialPrompt || '');
  const [response, setResponse] = useState<string | null>(null);
  const [isAiPowered, setIsAiPowered] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<{ query: string; reply: string; isAi: boolean; patientName?: string }[]>([]);

  // 2-Second delay and single response deduplication state
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [countdownMs, setCountdownMs] = useState<number>(0);
  const [duplicateClickNotice, setDuplicateClickNotice] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const duplicateNoticeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Load all patients so doctor can select any patient context
  useEffect(() => {
    setIsLoadingPatients(true);
    api.patients.list()
      .then(res => {
        setAllPatients(res.patients);
        if (activePatient) {
          const match = res.patients.find(p => p.id === activePatient.id);
          if (match) setSelectedPatient(match);
        } else if (res.patients.length === 1 && !selectedPatient) {
          setSelectedPatient(res.patients[0]);
        }
      })
      .catch(err => console.warn('Failed to load patients for AI:', err))
      .finally(() => setIsLoadingPatients(false));
  }, [activePatient]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (duplicateNoticeTimerRef.current) clearTimeout(duplicateNoticeTimerRef.current);
    };
  }, []);

  // When initialPrompt prop is provided or changes, display in typebar with 2-second delay
  useEffect(() => {
    if (initialPrompt) {
      handlePromptClick(initialPrompt);
    }
  }, [initialPrompt]);

  // Scroll to bottom of conversation whenever history or loading changes
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading, response]);

  // Core execution function that queries the AI Assistant
  const handleAsk = async (
    queryText?: string,
    contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general'
  ) => {
    const q = (queryText !== undefined ? queryText : question).trim();
    if (!q) return;

    setIsLoading(true);
    try {
      const res = await api.ai.chat({
        question: q,
        patientId: selectedPatient?.id,
        contextType
      });

      if (!selectedPatient && res.patient) {
        setSelectedPatient(res.patient);
      }

      setResponse(res.answer);
      setIsAiPowered(res.isAiPowered);
      setHistory(prev => [
        ...prev,
        {
          query: q,
          reply: res.answer,
          isAi: res.isAiPowered,
          patientName: selectedPatient?.fullName || res.patient?.fullName
        }
      ]);
      setQuestion('');
    } catch (err) {
      console.warn('AI assistant request failed:', err);
      setResponse('Unable to communicate with the AI assistant. Please check network connectivity.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles clicking on any prompt option:
   * Immediately populates and executes the AI response with a 500ms duplicate-click guard.
   */
  const lastSubmittedRef = useRef<{ text: string; time: number } | null>(null);

  const handlePromptClick = (
    promptText: string,
    contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general'
  ) => {
    if (isLoading) return;

    const now = Date.now();
    if (
      lastSubmittedRef.current &&
      lastSubmittedRef.current.text === promptText &&
      now - lastSubmittedRef.current.time < 600
    ) {
      return;
    }

    lastSubmittedRef.current = { text: promptText, time: now };
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPendingPrompt(null);
    setCountdownMs(0);
    setDuplicateClickNotice(false);
    handleAsk(promptText, contextType);
  };

  // Immediate send
  const handleImmediateSend = (customText?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    const textToSend = customText !== undefined ? customText : (pendingPrompt?.text || question);
    const contextType = pendingPrompt?.contextType;
    setPendingPrompt(null);
    setCountdownMs(0);
    setDuplicateClickNotice(false);
    handleAsk(textToSend, contextType);
  };

  // Cancel pending timer
  const handleCancelPending = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPendingPrompt(null);
    setCountdownMs(0);
    setDuplicateClickNotice(false);
    inputRef.current?.focus();
  };

  const handlePatientSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    if (!pId) {
      setSelectedPatient(null);
    } else {
      const p = allPatients.find(item => item.id === pId) || null;
      setSelectedPatient(p);
    }
  };

  // Helper to determine if a prompt is the actively pending one
  const isPendingOption = (text: string) => pendingPrompt?.text === text;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-800 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Clinical AI Assistant</h3>
                <span className="text-[10px] font-bold bg-teal-100 text-teal-900 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Conservative EMR Grounding
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Gemini Active (Fast Mode)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Evidence-based clinical reasoning, patient records analysis, & documentation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient Context Selector Bar */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <User className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide shrink-0">
              Patient Context:
            </span>
            <select
              value={selectedPatient?.id || ''}
              onChange={handlePatientSelectChange}
              className="w-full sm:max-w-xs text-xs px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white font-semibold text-slate-800"
            >
              <option value="">🌐 All Patients / General Clinic Assistant</option>
              {allPatients.map(p => (
                <option key={p.id} value={p.id}>
                  👤 {p.fullName} ({p.patientCode} · {p.age}y {p.gender})
                </option>
              ))}
            </select>
          </div>

          {selectedPatient && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-teal-50/60 border border-teal-200/80 px-2.5 py-1 rounded-xl shrink-0">
              <span className="font-bold text-teal-900">{selectedPatient.fullName}</span>
              <span>•</span>
              <span className="font-mono">{selectedPatient.patientCode}</span>
              {selectedPatient.allergies && (
                <>
                  <span>•</span>
                  <span className="text-rose-700 font-semibold flex items-center gap-0.5">
                    <ShieldAlert className="w-3 h-3" /> Allergies: {selectedPatient.allergies}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Patient Selector Chips when no patient is currently locked */}
        {!selectedPatient && allPatients.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <User className="w-3 h-3 text-teal-600" />
              SELECT PATIENT:
            </span>
            {allPatients.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPatient(p)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-teal-50 border border-slate-300 hover:border-teal-400 rounded-lg text-slate-800 font-semibold text-xs shadow-2xs transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                <span>{p.fullName}</span>
                <span className="text-[10px] text-slate-400 font-mono">({p.patientCode})</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Inquiry Action Prompts (Patient-grounded) */}
        {selectedPatient ? (
          <div className="px-5 py-2.5 bg-teal-50/40 border-b border-teal-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-teal-600" />
              QUICK PROMPTS:
            </span>
            {[
              {
                label: 'Summarize history',
                prompt: "Summarize this patient's clinical history",
                context: 'summary' as const,
                icon: FileText
              },
              {
                label: 'Generate SOAP note',
                prompt: 'Generate a structured SOAP note for this patient',
                context: 'soap' as const,
                icon: ClipboardList
              },
              {
                label: 'Documented medications',
                prompt: 'List all current and documented medications',
                context: 'medications' as const,
                icon: Pill
              },
              {
                label: 'Draft follow-up plan',
                prompt: 'Draft a follow-up plan based on documented records',
                context: 'followup' as const,
                icon: Calendar
              }
            ].map(item => {
              const Icon = item.icon;
              const isPending = isPendingOption(item.prompt);
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handlePromptClick(item.prompt, item.context)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs transition-all relative ${
                    isPending
                      ? 'bg-teal-100 text-teal-950 border-2 border-teal-600 ring-2 ring-teal-400/40'
                      : 'bg-white hover:bg-teal-50 border border-teal-200 text-teal-900'
                  }`}
                >
                  <Icon className="w-3 h-3 text-teal-700" />
                  <span>{item.label}</span>
                  {isPending && (
                    <span className="ml-1 px-1.5 py-0.2 bg-teal-700 text-white text-[10px] rounded-full font-bold animate-pulse">
                      {(countdownMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* General Clinic Prompts when no patient is selected */
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-teal-600" />
              GENERAL PROMPTS:
            </span>
            {[
              {
                label: 'Summarize clinic patient register',
                prompt: 'Summarize the clinic patient directory and high priority cases',
                context: 'summary' as const,
                icon: FileText
              },
              {
                label: 'Differential diagnosis protocols',
                prompt: 'What are recommended differential diagnoses protocols for common dermatological presentations?',
                context: 'general' as const,
                icon: ClipboardList
              },
              {
                label: 'Lesion red flags guide',
                prompt: 'Provide a structured summary of high-risk ABCDE lesion red flags and urgent referral criteria',
                context: 'general' as const,
                icon: ShieldAlert
              }
            ].map(item => {
              const Icon = item.icon;
              const isPending = isPendingOption(item.prompt);
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handlePromptClick(item.prompt, item.context)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs transition-all relative ${
                    isPending
                      ? 'bg-teal-100 text-teal-950 border-2 border-teal-600 ring-2 ring-teal-400/40'
                      : 'bg-white hover:bg-teal-50 border border-slate-300 text-slate-700 hover:border-teal-400'
                  }`}
                >
                  <Icon className="w-3 h-3 text-teal-700" />
                  <span>{item.label}</span>
                  {isPending && (
                    <span className="ml-1 px-1.5 py-0.2 bg-teal-700 text-white text-[10px] rounded-full font-bold animate-pulse">
                      {(countdownMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Conversation Viewport */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {history.length === 0 && !response && (
            <div className="text-center py-10 px-4 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Bot className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-800">
                {selectedPatient
                  ? `Clinical Insights for ${selectedPatient.fullName}`
                  : 'Physician Clinical Reasoning Assistant'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {selectedPatient ? (
                  <>
                    Ask any question about <strong>{selectedPatient.fullName}&apos;s</strong> documented clinical records, diagnoses, medications, lab tests, and past visits. The assistant strictly adheres to factual medical records and never fabricates clinical details.
                  </>
                ) : (
                  <>
                    Select a patient from the dropdown above to view patient-grounded SOAP notes and summaries, or ask clinical queries, differential diagnoses, and medical guidelines across your clinic registry.
                  </>
                )}
              </p>

              {!selectedPatient && allPatients.length > 0 && (
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Quick select patient to begin:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {allPatients.slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatient(p)}
                        className="p-2 bg-white hover:bg-teal-50 border border-slate-200 rounded-xl text-left text-xs flex items-center justify-between group transition-colors"
                      >
                        <div>
                          <span className="font-bold text-slate-800 group-hover:text-teal-900 block">
                            {p.fullName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {p.patientCode} • {p.age}y {p.gender}
                          </span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-700" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {history.map((item, idx) => (
            <div key={idx} className="space-y-3">
              {/* Doctor query */}
              <div className="flex justify-end">
                <div className="bg-teal-800 text-white rounded-2xl rounded-tr-xs px-4 py-2.5 text-xs max-w-[85%] shadow-2xs font-medium">
                  {item.query}
                </div>
              </div>

              {/* AI response */}
              <div className="flex justify-start">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-xs p-4 sm:p-5 text-xs text-slate-800 max-w-[92%] shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-200 pb-2 mb-2 flex-wrap gap-2">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      {item.patientName ? `Clinical Grounding: ${item.patientName}` : 'Clinical Assistant Analysis'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                      {item.isAi ? '⚡ Gemini Model Powered' : '📋 Deterministic EMR Engine'}
                    </span>
                  </div>
                  <MarkdownView content={item.reply} />
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-xs p-4 text-xs text-slate-600 flex items-center gap-2 shadow-2xs animate-pulse">
                <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" />
                <span>Reviewing documented records & synthesizing clinical insights...</span>
              </div>
            </div>
          )}

          <div ref={conversationEndRef} />
        </div>

        {/* Input & Typebar Area */}
        <div className="p-4 border-t border-slate-200 bg-white rounded-b-3xl">
          {/* Active 2-Second Prompt Countdown / Single Response Banner */}
          {pendingPrompt && (
            <div className="mb-3">
              <div className="p-3 bg-teal-50/90 border border-teal-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-xs animate-in fade-in slide-in-from-bottom-1 duration-150">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Clock className="w-4 h-4 animate-spin text-teal-100" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-teal-950">
                        Prompt loaded into typebar • Submitting in {(countdownMs / 1000).toFixed(1)}s
                      </span>
                      {duplicateClickNotice ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300 animate-bounce">
                          <Check className="w-3 h-3 text-amber-700" />
                          Same option clicked: Response taken once!
                        </span>
                      ) : (
                        <span className="text-[10px] text-teal-700 font-medium">
                          (Click again within 2s handled once)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-teal-800/80 truncate mt-0.5">
                      Selected: &ldquo;{pendingPrompt.text}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleImmediateSend()}
                    className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-2xs transition-all flex items-center gap-1.5"
                  >
                    <span>Send Now</span>
                    <CornerDownLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelPending}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-xl border border-slate-200 transition-colors"
                  >
                    Cancel / Edit
                  </button>
                </div>
              </div>

              {/* 2-second visual countdown progress bar */}
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5 shadow-inner">
                <div
                  className="bg-teal-600 h-full transition-all ease-linear duration-100"
                  style={{ width: `${Math.min(100, Math.max(0, (countdownMs / 2000) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Typebar Form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleImmediateSend();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  selectedPatient
                    ? `Ask anything about ${selectedPatient.fullName}'s history, medications, or plan...`
                    : 'Ask about any patient by name or general medical question...'
                }
                value={question}
                onChange={e => {
                  setQuestion(e.target.value);
                  // If user starts typing manually, pause/cancel the automatic prompt countdown
                  if (pendingPrompt) {
                    if (timerRef.current) clearTimeout(timerRef.current);
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    setPendingPrompt(null);
                    setCountdownMs(0);
                  }
                }}
                className={`w-full text-xs px-4 py-2.5 rounded-xl shadow-2xs transition-all ${
                  pendingPrompt
                    ? 'bg-teal-50/40 border-2 border-teal-500 ring-2 ring-teal-400/30 text-slate-900 font-medium'
                    : 'bg-slate-50 border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:bg-white text-slate-800'
                }`}
              />
              {pendingPrompt && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-teal-700 bg-teal-100/90 px-2 py-0.5 rounded-full pointer-events-none">
                  {(countdownMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{pendingPrompt ? 'Send Now' : 'Ask'}</span>
            </button>
          </form>

          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1 flex-wrap gap-1">
            <span>
              💡 Clicking any prompt fills the typebar with a 2s review delay • Repeated clicks taken once
            </span>
            <span>
              Physicians maintain sole clinical responsibility
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
