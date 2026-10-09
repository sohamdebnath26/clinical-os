import React, { useState, useEffect } from 'react';
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
  ChevronDown,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface AIModalProps {
  onClose: () => void;
  activePatient?: Patient | null;
  initialPrompt?: string;
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

  // Load all patients so doctor can select any patient context
  useEffect(() => {
    setIsLoadingPatients(true);
    api.patients.list()
      .then(res => {
        setAllPatients(res.patients);
        // If an activePatientId was passed or activePatient is present, sync it
        if (activePatient) {
          const match = res.patients.find(p => p.id === activePatient.id);
          if (match) setSelectedPatient(match);
        } else if (res.patients.length === 1 && !selectedPatient) {
          // If only 1 patient exists in the clinic, auto-bind them for convenience
          setSelectedPatient(res.patients[0]);
        }
      })
      .catch(err => console.warn('Failed to load patients for AI:', err))
      .finally(() => setIsLoadingPatients(false));
  }, [activePatient]);

  useEffect(() => {
    if (initialPrompt) {
      handleAsk(initialPrompt);
    }
  }, [initialPrompt]);

  const handleAsk = async (
    queryText?: string,
    contextType?: 'soap' | 'summary' | 'medications' | 'followup' | 'general'
  ) => {
    const q = queryText || question;
    if (!q.trim()) return;

    setIsLoading(true);
    try {
      const res = await api.ai.chat({
        question: q,
        patientId: selectedPatient?.id,
        contextType
      });

      // If backend auto-matched a patient from text, update selectedPatient
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

  const handlePatientSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    if (!pId) {
      setSelectedPatient(null);
    } else {
      const p = allPatients.find(item => item.id === pId) || null;
      setSelectedPatient(p);
    }
  };

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
                  Gemini Active (No Key Needed)
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

        {/* Quick Patient Inquiry Action Prompts */}
        {selectedPatient && (
          <div className="px-5 py-2.5 bg-teal-50/40 border-b border-teal-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-teal-600" />
              QUICK PROMPTS:
            </span>
            <button
              type="button"
              onClick={() => handleAsk("Summarize this patient's clinical history", "summary")}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg text-teal-900 font-semibold text-xs shadow-2xs transition-colors"
            >
              <FileText className="w-3 h-3 text-teal-700" />
              Summarize history
            </button>
            <button
              type="button"
              onClick={() => handleAsk("Generate a structured SOAP note for this patient", "soap")}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg text-teal-900 font-semibold text-xs shadow-2xs transition-colors"
            >
              <ClipboardList className="w-3 h-3 text-teal-700" />
              Generate SOAP note
            </button>
            <button
              type="button"
              onClick={() => handleAsk("List all current and documented medications", "medications")}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg text-teal-900 font-semibold text-xs shadow-2xs transition-colors"
            >
              <Pill className="w-3 h-3 text-teal-700" />
              Documented medications
            </button>
            <button
              type="button"
              onClick={() => handleAsk("Draft a follow-up plan based on documented records", "followup")}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg text-teal-900 font-semibold text-xs shadow-2xs transition-colors"
            >
              <Calendar className="w-3 h-3 text-teal-700" />
              Draft follow-up plan
            </button>
          </div>
        )}

        {/* Conversation Viewport */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {history.length === 0 && !response && (
            <div className="text-center py-12 px-4 max-w-lg mx-auto">
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
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-xs p-4 text-xs text-slate-600 flex items-center gap-2 shadow-2xs">
                <Sparkles className="w-4 h-4 text-teal-600 animate-spin" />
                <span>Reviewing documented records & synthesizing clinical insights...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <div className="p-4 border-t border-slate-200 bg-white rounded-b-3xl">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={
                selectedPatient
                  ? `Ask anything about ${selectedPatient.fullName}'s history, medications, or plan...`
                  : 'Ask about any patient by name or general medical question...'
              }
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="flex-1 text-xs px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white shadow-2xs transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Ask
            </button>
          </form>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            Physicians maintain sole clinical responsibility for patient diagnoses, prescriptions, and care plans.
          </p>
        </div>
      </div>
    </div>
  );
};
