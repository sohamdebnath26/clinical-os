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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize or reset conversation when a new report is generated
  useEffect(() => {
    if (!report) {
      setMessages([]);
      return;
    }

    const topDiff = report.differentials?.[0];
    const introMessage: ReportChatMessage = {
      id: `init_${report.id || Date.now()}`,
      role: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAiPowered: report.isAiPowered,
      content:
        `### Clinical Report AI Assistant Ready\n` +
        `I have indexed the generated diagnostic report for **${report.primaryImpression}**` +
        `${topDiff?.icdCode ? ` (ICD-10: \`${topDiff.icdCode}\`)` : ''}` +
        `${patient ? ` linked to **${patient.fullName}** (${patient.age}y/${patient.gender})` : ''}.\n\n` +
        `- **Ranked Differentials:** ${(report.differentials || []).map(d => `${d.condition} (${d.confidence})`).join(' · ')}\n` +
        `- **Key Workup:** ${(report.recommendedInvestigations || [])[0] || 'Clinical correlation'}\n\n` +
        `Ask me **any question** about this report—including **causes & triggers**, **contagiousness**, **healing timeline**, **severity**, **diet & skincare**, **differential comparisons**, **medications & alternatives**, or **workup**.`
    };

    setMessages([introMessage]);
  }, [report?.id, report?.primaryImpression, patient?.id]);

  // Auto-scroll within chat container when messages update
  useEffect(() => {
    if (messages.length > 1 || isLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isLoading]);

  const handleSendQuestion = async (customQuery?: string) => {
    if (!report || isLoading) return;
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

      const assistantMsg: ReportChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiPowered: res.isAiPowered
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.warn('Report chatbot error:', err);
      const fallbackMsg: ReportChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `### Report Summary (${report.primaryImpression})\n- **Primary Impression:** ${report.primaryImpression}\n- **Suggested Plan:** ${report.suggestedManagementPlan}\n- **Recommended Workup:** ${(report.recommendedInvestigations || []).join('; ')}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiPowered: false
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (msg: ReportChatMessage) => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleResetChat = () => {
    if (!report) return;
    const topDiff = report.differentials?.[0];
    setMessages([
      {
        id: `init_${Date.now()}`,
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiPowered: report.isAiPowered,
        content:
          `### Clinical Report AI Assistant Ready\n` +
          `Conversation reset. Grounded in **${report.primaryImpression}**` +
          `${topDiff?.icdCode ? ` (ICD-10: \`${topDiff.icdCode}\`)` : ''}. How can I help you interpret or act on this report?`
      }
    ]);
    setQuestion('');
  };

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
                AI Clinical Report Chatbot
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-200 border border-teal-400/30">
                <Sparkles className="w-2.5 h-2.5 text-teal-300" />
                {report ? 'Grounded in Active Report' : 'Waiting for Report'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {report
                ? `Ask questions about "${report.primaryImpression}", differentials, workup, or treatment adjustments`
                : 'Analyze a clinical image first to chat interactively with the generated diagnostic report'}
            </p>
          </div>
        </div>

        {report && messages.length > 1 && (
          <button
            type="button"
            onClick={handleResetChat}
            className="self-start sm:self-auto px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5 text-teal-300" />
            <span>Clear Chat</span>
          </button>
        )}
      </div>

      {!report ? (
        <div className="p-6 text-center bg-slate-50/60">
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 border border-teal-100 mx-auto flex items-center justify-center mb-2.5">
            <MessageSquare className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-700">
            Report Chatbot Standby
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Once you click <strong>&ldquo;Analyze Clinical Image with AI&rdquo;</strong> (or select a Quick Specimen Preset and analyze), this chatbot will automatically load the generated report so you can ask follow-up clinical questions.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {/* Quick Clinical Inquiry Chips */}
          <div className="px-5 py-3 bg-teal-50/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-teal-600" />
                One-Click Questions from Generated Report
              </span>
              <span className="text-[10px] text-slate-500">
                Click any chip to ask AI
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPORT_PROMPTS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isLoading}
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

          {/* Conversation Messages Thread */}
          <div
            className={`${
              compact ? 'max-h-72' : 'max-h-96'
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
                          <span>Doctor Query</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-teal-600" />
                          <span>Report AI Assistant</span>
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
                          className="text-[10px] text-slate-400 hover:text-teal-700 flex items-center gap-1 transition"
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
                    <p className="text-xs leading-relaxed text-white font-medium">
                      {msg.content}
                    </p>
                  ) : (
                    <MarkdownView content={msg.content} />
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
                  <span>Analyzing report findings & patient context...</span>
                </div>
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
                  placeholder={`Ask about "${report.primaryImpression}", ICD-10, dosing, biopsy, or red flags...`}
                  disabled={isLoading}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 text-xs text-slate-900 bg-slate-50/60"
                />
                <div className="absolute right-2">
                  <VoiceDictationButton
                    value={question}
                    onChange={setQuestion}
                    variant="badge"
                    title="Dictate question to Report AI"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!question.trim() || isLoading}
                className="px-4 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-2xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask AI</span>
                <CornerDownLeft className="w-3 h-3 opacity-70 hidden sm:inline" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
