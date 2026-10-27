import React, { useState, useEffect, useRef } from 'react';
import { AIImageAnalysisResult, ABCDEScoreResult, Patient } from '../types';
import { api } from '../lib/api';
import { MarkdownView } from './MarkdownView';
import { VoiceDictationButton } from './VoiceDictationButton';
import {
  Bot,
  Send,
  Sparkles,
  User,
  Copy,
  Check,
  RotateCcw,
  MessageSquare,
  FileText,
  Stethoscope,
  ShieldAlert,
  Pill,
  Activity,
  Loader2,
  CornerDownLeft
} from 'lucide-react';

export interface ReportChatMessage {
  id: string;
  role: 'doctor' | 'assistant';
  content: string;
  timestamp: string;
  isAiPowered?: boolean;
}

interface ImageReportChatbotProps {
  report: AIImageAnalysisResult | null;
  patient?: Patient | null;
  anatomicalSite?: string;
  clinicalNotes?: string;
  abcdeScore?: ABCDEScoreResult | null;
  externalInputRef?: React.RefObject<HTMLInputElement | null>;
  compact?: boolean;
}

const QUICK_REPORT_PROMPTS = [
  {
    label: 'Causes & Healing Timeline',
    prompt: 'What causes this condition, is it contagious, and what is the expected recovery timeline?',
    icon: Sparkles
  },
  {
    label: 'Compare #1 vs #2 Differential',
    prompt: 'Compare the #1 and #2 differential diagnoses in this report and how to clinically differentiate them.',
    icon: Stethoscope
  },
  {
    label: 'Treatment & Alternatives',
    prompt: 'Review the suggested treatment plan, dosing, second-line alternatives, and any patient allergy checks.',
    icon: Pill
  },
  {
    label: 'Priority Workup / Biopsy',
    prompt: 'Which recommended investigation or biopsy from the report is highest priority and why?',
    icon: FileText
  },
  {
    label: 'Severity & Visual Metrics',
    prompt: 'What is the clinical severity grade and what do the quantitative visual metrics (erythema, pigmentation, border) show?',
    icon: Activity
  },
  {
    label: 'Diet, Skincare & Counseling',
    prompt: 'What diet, skincare routine, and home care precautions should the patient follow for this condition?',
    icon: MessageSquare
  },
  {
    label: 'Red Flags to Watch',
    prompt: 'What are the critical red flags and urgent escalation criteria in this report?',
    icon: ShieldAlert
  }
];

export const ImageReportChatbot: React.FC<ImageReportChatbotProps> = ({
  report,
  patient,
  anatomicalSite,
  clinicalNotes,
  abcdeScore,
  externalInputRef,
  compact = false
}) => {
  const [messages, setMessages] = useState<ReportChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) {
        window.clearInterval(streamTimerRef.current);
      }
    };
  }, []);

  // Initialize or update conversation when a report is loaded or on mount
  useEffect(() => {
    if (!report) {
      setMessages(prev => {
        if (prev.length > 0) return prev;
        return [
          {
            id: `init_standby_${Date.now()}`,
            role: 'assistant',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isAiPowered: true,
            content:
              `Hello Doctor! I'm your interactive **Clinical Dermatology GPT**${
                patient ? ` (currently linked to **${patient.fullName}**, ${patient.age}y/${patient.gender})` : ''
              }.\n\n` +
              `You can ask me **any clinical question right now**—such as differential diagnoses, medication dosing, pediatric/pregnancy safety, or treatment protocols—or click **"Analyze Clinical Image with AI"** above so I can ground our conversation directly in the lesion scan.`
          }
        ];
      });
      return;
    }

    const topDiff = report.differentials?.[0];
    const introMessage: ReportChatMessage = {
      id: `init_${report.id || Date.now()}`,
      role: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAiPowered: true,
      content:
        `I've analyzed the scan and loaded the diagnostic report for **${report.primaryImpression}**` +
        `${topDiff?.icdCode ? ` (ICD-10: \`${topDiff.icdCode}\`)` : ''}` +
        `${patient ? ` for **${patient.fullName}** (${patient.age}y/${patient.gender})` : ''}.\n\n` +
        `- **Top Differentials:** ${(report.differentials || []).map(d => `${d.condition} (${d.confidence})`).join(' · ')}\n` +
        `- **Priority Workup:** ${(report.recommendedInvestigations || [])[0] || 'Clinical correlation'}\n\n` +
        `Ask me anything about this case—just like chatting with a colleague! We can discuss **why this diagnosis was chosen**, **causes & healing time**, **medication adjustments**, **diet & skincare**, or **how to explain this to the patient**.`
    };

    setMessages([introMessage]);
  }, [report?.id, report?.primaryImpression, patient?.id]);

  // Auto-scroll within chat container when messages update
  useEffect(() => {
    if (messages.length > 1 || isLoading || streamingMsgId) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isLoading, streamingMsgId]);

  const animateAssistantReply = (msgId: string, fullText: string, isAiPowered?: boolean) => {
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
    }

    const words = fullText.split(/(\s+)/);
    let currentIndex = 0;
    const step = Math.max(16, Math.ceil(words.length / 8));
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setStreamingMsgId(msgId);
    setMessages(prev => [
      ...prev,
      {
        id: msgId,
        role: 'assistant',
        content: words.slice(0, step).join(''),
        timestamp,
        isAiPowered
      }
    ]);
    currentIndex = step;

    streamTimerRef.current = window.setInterval(() => {
      currentIndex += step;
      if (currentIndex >= words.length) {
        if (streamTimerRef.current) {
          window.clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
        }
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: fullText } : m))
        );
        setStreamingMsgId(null);
      } else {
        const partial = words.slice(0, currentIndex).join('');
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: partial } : m))
        );
      }
    }, 10);
  };

  const handleSendQuestion = async (customQuery?: string) => {
    if (isLoading) return;
    const trimmed = (customQuery !== undefined ? customQuery : question).trim();
    if (!trimmed) return;

    const doctorMsg: ReportChatMessage = {
      id: `doc_${Date.now()}`,
      role: 'doctor',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedHistory = [...messages, doctorMsg];
    setMessages(updatedHistory);
    if (customQuery === undefined) {
      setQuestion('');
    }
    setIsLoading(true);

    try {
      const res = await api.ai.chatWithReport({
        question: trimmed,
        report,
        anatomicalSite,
        clinicalNotes,
        abcdeScore,
        patientId: patient?.id,
        conversationHistory: updatedHistory.map(m => ({
          role: m.role,
          content: m.content
        }))
      });

      setIsLoading(false);
      animateAssistantReply(`ai_${Date.now()}`, res.answer, res.isAiPowered);
    } catch (err) {
      console.warn('Report chatbot error:', err);
      setIsLoading(false);
      const fallbackText = report
        ? `Based on the active report for **${report.primaryImpression}**, here is what we have on file:\n\n- **Primary Impression:** **${report.primaryImpression}**\n- **Suggested Treatment Plan:**\n${report.suggestedManagementPlan}\n- **Recommended Workup:** ${(report.recommendedInvestigations || []).join('; ')}\n\nFeel free to ask a specific follow-up about dosing, differentials, or patient care!`
        : `I'm ready to assist with your clinical query (*"${trimmed}"*). Please check your connection or analyze a clinical image above so I can provide full report-grounded insights.`;
      animateAssistantReply(`err_${Date.now()}`, fallbackText, false);
    }
  };

  const handleCopyMessage = (msg: ReportChatMessage) => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleResetChat = () => {
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamingMsgId(null);

    if (!report) {
      setMessages([
        {
          id: `init_${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isAiPowered: true,
          content: `Conversation cleared! Ask me any dermatology or clinical question whenever you're ready.`
        }
      ]);
      setQuestion('');
      return;
    }

    const topDiff = report.differentials?.[0];
    setMessages([
      {
        id: `init_${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiPowered: true,
        content:
          `Conversation reset! I'm grounded in **${report.primaryImpression}**` +
          `${topDiff?.icdCode ? ` (ICD-10: \`${topDiff.icdCode}\`)` : ''}. What would you like to discuss about this case?`
      }
    ]);
    setQuestion('');
  };

  const followUpSuggestions = report
    ? [
        `Why is ${report.primaryImpression.split('(')[0].trim()} favored over #2?`,
        'What if the patient has sensitive skin or is pregnant?',
        'Explain this condition simply for the patient',
        'What are the second-line medication options?'
      ]
    : [
        'How do I differentiate eczema vs tinea corporis?',
        'First-line topical regimen for Acne (Acne Vulgaris)?',
        'When should a pigmented lesion be biopsied?'
      ];

  return (
    <div
      id="ai-report-chatbot-section"
      className="bg-white rounded-2xl border border-teal-200/90 shadow-xs overflow-hidden print:hidden"
    >
      {/* Top Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-teal-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-tight">
                AI Clinical Dermatology GPT
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-200 border border-teal-400/30">
                <Sparkles className="w-2.5 h-2.5 text-teal-300" />
                {report ? `Grounded in ${report.primaryImpression}` : 'Interactive GPT Ready'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {report
                ? `Chat naturally about "${report.primaryImpression}", differentials, dosing, causes, or patient care`
                : 'Ask any clinical or dermatology question interactively—before or after scanning an image'}
            </p>
          </div>
        </div>

        {messages.length > 1 && (
          <button
            type="button"
            onClick={handleResetChat}
            className="self-start sm:self-auto px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5 text-teal-300" />
            <span>New Chat</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-200">
        {/* Quick Clinical Inquiry Chips */}
        {report && (
          <div className="px-5 py-3 bg-teal-50/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-teal-600" />
                Quick Clinical Prompts
              </span>
              <span className="text-[10px] text-slate-500">
                Click any prompt or type any question below
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPORT_PROMPTS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isLoading || Boolean(streamingMsgId)}
                    onClick={() => handleSendQuestion(item.prompt)}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-300 text-xs font-medium flex items-center gap-1.5 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  >
                    <Icon className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Conversation Messages Thread */}
        <div
          className={`${
            compact ? 'max-h-80' : 'max-h-[440px]'
          } overflow-y-auto p-5 space-y-4 bg-slate-50/40`}
        >
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.role === 'doctor' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-teal-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Bot className="w-4 h-4 text-teal-200" />
                </div>
              )}

              <div
                className={`max-w-[88%] sm:max-w-[82%] rounded-2xl p-4 ${
                  msg.role === 'doctor'
                    ? 'bg-teal-800 text-white rounded-br-xs shadow-2xs'
                    : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      msg.role === 'doctor' ? 'text-teal-200' : 'text-teal-800'
                    }`}
                  >
                    {msg.role === 'doctor' ? (
                      <>
                        <User className="w-3 h-3" />
                        <span>You (Doctor)</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-teal-600" />
                        <span>Clinical GPT</span>
                      </>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] ${
                        msg.role === 'doctor' ? 'text-teal-200/80' : 'text-slate-400'
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg)}
                        className="text-[10px] text-slate-400 hover:text-teal-700 flex items-center gap-1 transition cursor-pointer"
                        title="Copy answer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600 font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {msg.role === 'doctor' ? (
                  <p className="text-xs leading-relaxed text-white font-medium whitespace-pre-wrap">
                    {msg.content}
                  </p>
                ) : (
                  <div className="relative">
                    <MarkdownView content={msg.content} />
                    {streamingMsgId === msg.id && (
                      <span className="inline-block w-1.5 h-3.5 bg-teal-600 ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'doctor' && (
                <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-800 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Loader2 className="w-4 h-4 text-teal-200 animate-spin" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-xs px-4 py-3 text-xs text-slate-600 flex items-center gap-2 shadow-2xs">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce [animation-delay:300ms]" />
                </span>
                <span>Clinical GPT is thinking...</span>
              </div>
            </div>
          )}

          {/* Contextual Interactive Follow-Up Suggestions */}
          {!isLoading && !streamingMsgId && messages.length > 0 && (
            <div className="pt-1 pl-11 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 mr-1">
                Follow up:
              </span>
              {followUpSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendQuestion(suggestion)}
                  className="px-2.5 py-1 rounded-full bg-white hover:bg-teal-50 text-[11px] text-teal-800 border border-teal-200/80 hover:border-teal-400 transition shadow-2xs cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar with Voice Dictation */}
        <div className="p-4 bg-white">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendQuestion();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1 flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder={
                  report
                    ? `Message Clinical GPT about "${report.primaryImpression}" or ask any medical question...`
                    : 'Message Clinical GPT (e.g., "What causes tinea incognito?", "Compare adapalene vs tretinoin")...'
                }
                disabled={isLoading}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 text-xs text-slate-900 bg-slate-50/60"
              />
              <div className="absolute right-2">
                <VoiceDictationButton
                  value={question}
                  onChange={setQuestion}
                  variant="badge"
                  title="Dictate question to Clinical GPT"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!question.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-2xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
              <CornerDownLeft className="w-3 h-3 opacity-70 hidden sm:inline" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

