import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Patient } from '../types';
import { api } from '../lib/api';
import { VoiceDictationButton } from './VoiceDictationButton';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import {
  cleanPhoneNumber,
  getWhatsAppWebUrl
} from '../lib/whatsappUtils';
import {
  Search,
  Phone,
  Send,
  CheckCircle2,
  User,
  Check,
  RefreshCw,
  FileText,
  MessageSquare,
  Plus,
  X,
  ChevronRight,
  CheckCheck,
  AlertCircle,
  Clock
} from 'lucide-react';

type PipelineStage = 'needs_review' | 'draft_ready' | 'resolved';

interface Thread {
  id: string;
  name: string;
  subtitle: string;
  category: 'patients' | 'pharmacies' | 'collaborations';
  channel: 'WhatsApp' | 'SMS' | 'Email' | 'App';
  priority: 'urgent' | 'routine';
  stage: PipelineStage;
  preview: string;
  timestamp: string;
  unread: boolean;
  statusLabel: string;
  phone: string;
  aiSummary: string;
  patientId?: string;
  messages: { sender: 'patient' | 'doctor' | 'ai'; text: string; time: string; status?: string }[];
  draftReply: string;
}

const CLINICAL_TEMPLATES = [
  {
    title: 'Post-Procedure Care',
    text: 'Keep the treated area clean and dry for 24 hours. Apply the prescribed soothing ointment twice daily. Avoid direct sun exposure and do not pick at scabs or peeling skin.'
  },
  {
    title: 'Prescription & Dosage Guide',
    text: 'Please take your medications as prescribed after meals. If using topical cream, apply a pea-sized amount evenly to affected areas at bedtime.'
  },
  {
    title: 'Follow-Up Visit Booking',
    text: 'Doctor advises an in-clinic follow-up visit in 2 weeks to evaluate healing progression. Please reply with your preferred day or book via our clinic portal.'
  },
  {
    title: 'Lab Test Preparation',
    text: 'For your advised skin biopsy/blood tests, please arrive at the clinic lab fasting for 8 hours (water allowed). Bring your previous report copies.'
  },
  {
    title: 'Red Flag Emergency Alert',
    text: 'If you develop rapid swelling, fever above 100°F, spreading pain, or bleeding from the lesion site, please visit our clinic immediately or call emergency triage.'
  }
];

export const MessagesView: React.FC = () => {
  const { doctor } = useAuth();
  const { t } = useLanguage();

  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'draft_ready' | 'resolved' | 'whatsapp' | 'sms'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('t-1');
  const [realPatients, setRealPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Modals & Drawers
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
  const [showWhatsAppReportModal, setShowWhatsAppReportModal] = useState(false);
  const [selectedPatientForReport, setSelectedPatientForReport] = useState<Patient | null>(null);

  // Reply state
  const [customReply, setCustomReply] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Broadcast state
  const [broadcastFilter, setBroadcastFilter] = useState('All active patients');
  const [broadcastText, setBroadcastText] = useState(
    'Hi [name], this is Dr. ' +
      (doctor?.name || 'Sarah Chen') +
      ' from Dermacare. Please remember to apply SPF 50+ sunscreen daily and let us know if you need to schedule your follow-up check.'
  );

  // Refill queue state
  const [refillQueue, setRefillQueue] = useState([
    {
      id: 'ref-1',
      threadId: 't-3',
      name: 'Simran Kaur',
      medication: 'Antihistamine tablet, 30 days',
      note: 'Seen 3 weeks ago · No interactions · Dose unchanged',
      status: 'pending' as 'pending' | 'approved'
    },
    {
      id: 'ref-2',
      threadId: 't-5',
      name: 'Meera Patel',
      medication: 'Topical cream, 2 tubes',
      note: 'Review due next week · Standard maintenance refill',
      status: 'pending' as 'pending' | 'approved'
    }
  ]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [threads, setThreads] = useState<Thread[]>([
    {
      id: 't-1',
      name: 'Rohit Sharma',
      subtitle: '28y · P-24621 · English',
      category: 'patients',
      channel: 'WhatsApp',
      priority: 'urgent',
      stage: 'needs_review',
      preview: 'Chest feels tight since morning with red rash',
      timestamp: '2 min ago',
      unread: true,
      statusLabel: 'Red flag · Immediate review',
      phone: '+91 98765 43210',
      aiSummary: 'Patient reports acute rash extension with chest tightness. Immediate clinical triage advised.',
      messages: [
        {
          sender: 'patient',
          text: 'Doctor, my chest feels tight and the rash is spreading since morning. Is this normal?',
          time: '9:30 AM'
        }
      ],
      draftReply:
        'Rohit, please call the clinic hotline (+91 98765 43210) or visit the nearest emergency room immediately for an urgent evaluation.'
    },
    {
      id: 't-2',
      name: 'Harman Preet',
      subtitle: '25y · P-24618 · English & Punjabi',
      category: 'patients',
      channel: 'WhatsApp',
      priority: 'routine',
      stage: 'draft_ready',
      preview: 'Itching more at night, is it normal?',
      timestamp: '40 min ago',
      unread: true,
      statusLabel: 'Patient question · AI draft ready',
      phone: '+91 98765 11223',
      aiSummary: 'Less redness, mild night itching. Clinical photo shows barrier healing. No fever or swelling.',
      messages: [
        {
          sender: 'patient',
          text: 'Doctor, the redness is better but the itching is more at night. Is this normal?',
          time: '9:41 AM',
          status: 'photo attached'
        },
        {
          sender: 'doctor',
          text: 'Hi Harman. I received your message and photo. I will reply with advice shortly.',
          time: '9:45 AM',
          status: 'read'
        }
      ],
      draftReply:
        'Mild itching at night is common as the skin barrier repairs. Keep the area moisturised with your prescribed cream, avoid scratching, and message us if you notice fever or pain.'
    },
    {
      id: 't-3',
      name: 'Simran Kaur',
      subtitle: '31y · P-24619 · Refill request',
      category: 'patients',
      channel: 'WhatsApp',
      priority: 'routine',
      stage: 'draft_ready',
      preview: 'Need refill for my prescribed tablets',
      timestamp: '3 h ago',
      unread: false,
      statusLabel: 'Refill verified · Safe to approve',
      phone: '+91 91234 56789',
      aiSummary: 'Antihistamine tablet 30 days. Seen 3 weeks ago. Safe refill verified against chart.',
      messages: [
        {
          sender: 'patient',
          text: 'Hello doctor, I need a refill for my allergy tablets for another 30 days.',
          time: '7:15 AM'
        }
      ],
      draftReply:
        'Hello Simran, your 30-day refill has been authorized. You can collect your prescription or order via our partnered pharmacy.'
    },
    {
      id: 't-4',
      name: 'Anita Verma',
      subtitle: '42y · P-24622 · Reschedule request',
      category: 'patients',
      channel: 'WhatsApp',
      priority: 'routine',
      stage: 'draft_ready',
      preview: 'Can we move my visit to Friday?',
      timestamp: '3 h ago',
      unread: false,
      statusLabel: 'Schedule change · 3 open slots',
      phone: '+91 99887 76655',
      aiSummary: 'Requests moving visit to Friday. Open clinic slots: 10:00 AM, 2:30 PM, 4:00 PM.',
      messages: [
        {
          sender: 'patient',
          text: 'Can we move my visit from tomorrow to Friday? Something urgent came up.',
          time: '6:50 AM'
        }
      ],
      draftReply:
        'Hi Anita, we have open slots on Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Would any of these work for you?'
    },
    {
      id: 't-5',
      name: 'Meera Patel',
      subtitle: '29y · P-24623 · Follow-up check',
      category: 'patients',
      channel: 'SMS',
      priority: 'routine',
      stage: 'resolved',
      preview: 'Thank you for the prescription',
      timestamp: 'Yesterday',
      unread: false,
      statusLabel: 'Follow-up logged',
      phone: '+91 98111 22334',
      aiSummary: 'Topical cream 2 tubes. Patient confirmed adherence. Next review in 7 days.',
      messages: [
        {
          sender: 'patient',
          text: 'Thank you for the prescription. I am using the cream as directed.',
          time: 'Yesterday'
        }
      ],
      draftReply: ''
    },
    {
      id: 't-6',
      name: 'Apollo Pharmacy Hub',
      subtitle: 'Partner Pharmacy · Batch verification',
      category: 'pharmacies',
      channel: 'SMS',
      priority: 'routine',
      stage: 'needs_review',
      preview: 'Verifying prescription batch #RX-8842',
      timestamp: '1 h ago',
      unread: true,
      statusLabel: 'Pharmacy authorization',
      phone: '+91 1800 420 000',
      aiSummary: 'Partner pharmacy requesting dispensing confirmation for Harman Preet (P-24618).',
      messages: [
        {
          sender: 'patient',
          text: 'Hello Doctor, confirming prescription for patient Harman (P-24618). Please authorize.',
          time: '11:15 AM'
        }
      ],
      draftReply: 'Prescription batch #RX-8842 verified and authorized for dispensing.'
    }
  ]);

  // Load registered patients from clinic database
  useEffect(() => {
    setIsLoadingPatients(true);
    api.patients
      .list()
      .then(res => {
        if (res.patients && res.patients.length > 0) {
          setRealPatients(res.patients);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingPatients(false));
  }, []);

  const activeThread = threads.find(t => t.id === selectedThreadId) || threads[0];

  // Pipeline counts
  const urgentCount = threads.filter(t => t.priority === 'urgent' && t.stage !== 'resolved').length;
  const draftReadyCount = threads.filter(t => t.stage === 'draft_ready').length;
  const needsReviewCount = threads.filter(t => t.stage === 'needs_review').length;
  const resolvedCount = threads.filter(t => t.stage === 'resolved').length;

  // Dispatch a message & advance pipeline stage to 'resolved'
  const handleSendMessage = async (textToSend: string, openInWhatsAppTab = false) => {
    if (!textToSend.trim() || !activeThread) return;
    setIsDispatching(true);

    const messageText = textToSend.trim();
    const cleanPhone = cleanPhoneNumber(activeThread.phone);

    if (activeThread.channel === 'WhatsApp' || openInWhatsAppTab) {
      try {
        await api.reports
          .logWhatsApp({
            patientId: activeThread.patientId || activeThread.id,
            reportType: 'chat_message',
            recipientMobile: cleanPhone,
            note: messageText.slice(0, 100)
          })
          .catch(() => {});

        if (openInWhatsAppTab) {
          const webUrl = getWhatsAppWebUrl(cleanPhone, messageText);
          window.open(webUrl, '_blank');
          showToast(`Opened WhatsApp Web for ${activeThread.name} and logged reply.`);
        } else {
          showToast(`Reply sent and logged to ${activeThread.name}'s WhatsApp thread.`);
        }
      } catch {
        showToast(`Dispatched message to ${activeThread.name}`);
      }
    } else {
      showToast(`Message sent via ${activeThread.channel} to ${activeThread.name}`);
    }

    setThreads(prev =>
      prev.map(t => {
        if (t.id === activeThread.id) {
          return {
            ...t,
            stage: 'resolved',
            statusLabel: 'Resolved · Sent just now',
            messages: [
              ...t.messages,
              { sender: 'doctor', text: messageText, time: 'Just now', status: 'dispatched' }
            ],
            draftReply: '',
            preview: `You: ${messageText}`,
            timestamp: 'Just now',
            unread: false
          };
        }
        return t;
      })
    );

    setCustomReply('');
    setIsDispatching(false);
  };

  // Batch approve all safe drafts in pipeline
  const handleBatchApproveDrafts = () => {
    const readyThreads = threads.filter(t => t.stage === 'draft_ready' && t.draftReply);
    if (readyThreads.length === 0) {
      showToast('All queued drafts have already been approved and sent.');
      return;
    }

    setThreads(prev =>
      prev.map(t => {
        if (t.stage === 'draft_ready' && t.draftReply) {
          return {
            ...t,
            stage: 'resolved',
            statusLabel: 'Resolved · Batch approved',
            messages: [
              ...t.messages,
              { sender: 'doctor', text: t.draftReply, time: 'Just now', status: 'dispatched' }
            ],
            preview: `You: ${t.draftReply}`,
            draftReply: '',
            timestamp: 'Just now',
            unread: false
          };
        }
        return t;
      })
    );
    showToast(`Approved and dispatched ${readyThreads.length} patient drafts.`);
  };

  // Mark thread resolved or reopen
  const handleToggleThreadStage = (threadId: string) => {
    setThreads(prev =>
      prev.map(t => {
        if (t.id === threadId) {
          const nextStage: PipelineStage = t.stage === 'resolved' ? 'needs_review' : 'resolved';
          return {
            ...t,
            stage: nextStage,
            unread: false,
            statusLabel: nextStage === 'resolved' ? 'Resolved' : 'Reopened for review'
          };
        }
        return t;
      })
    );
  };

  // Start or open thread with a patient from the clinic EHR
  const handleSelectPatientForMessaging = (patient: Patient) => {
    const existingThread = threads.find(
      t =>
        t.patientId === patient.id ||
        t.phone.replace(/\D/g, '').endsWith((patient.mobile || '').slice(-10))
    );

    if (existingThread) {
      setSelectedThreadId(existingThread.id);
      setShowNewMessageModal(false);
      showToast(`Opened conversation with ${patient.fullName}`);
      return;
    }

    const cleanNumber = patient.mobile
      ? `+91 ${patient.mobile.replace(/\D/g, '').slice(-10)}`
      : '+91 98000 00000';
    const newThread: Thread = {
      id: `p-thread-${patient.id}`,
      name: patient.fullName,
      subtitle: `${patient.age}y · ${patient.patientCode} · ${patient.gender}`,
      category: 'patients',
      channel: 'WhatsApp',
      priority: 'routine',
      stage: 'draft_ready',
      preview: patient.notes ? `Notes: ${patient.notes.slice(0, 45)}` : 'Direct patient follow-up',
      timestamp: 'Just now',
      unread: false,
      statusLabel: 'EHR Patient · Draft ready',
      phone: cleanNumber,
      patientId: patient.id,
      aiSummary: `EHR Profile: ${patient.age}y ${patient.gender}. Allergies: ${
        patient.allergies || 'None documented'
      }. Medical History: ${patient.medicalHistory || 'Routine'}.`,
      messages: [
        {
          sender: 'ai',
          text: `Connected to ${patient.fullName}'s EHR record (${patient.patientCode}).`,
          time: 'Just now'
        }
      ],
      draftReply: `Hello ${patient.fullName}, this is Dr. ${
        doctor?.name || 'Sarah Chen'
      } following up regarding your dermatology visit. How is your skin responding to treatment?`
    };

    setThreads(prev => [newThread, ...prev]);
    setSelectedThreadId(newThread.id);
    setShowNewMessageModal(false);
    showToast(`Started conversation with ${patient.fullName}`);
  };

  // Open full WhatsApp report modal for the active patient
  const handleOpenWhatsAppShareModal = () => {
    let targetPatient = realPatients.find(
      p => p.id === activeThread.patientId || p.fullName === activeThread.name
    );
    if (!targetPatient) {
      targetPatient = {
        id: activeThread.id,
        patientCode: 'P-' + Math.floor(10000 + Math.random() * 90000),
        fullName: activeThread.name,
        age: 30,
        gender: 'Other',
        mobile: activeThread.phone.replace(/\D/g, '').slice(-10),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    setSelectedPatientForReport(targetPatient || null);
    setShowWhatsAppReportModal(true);
  };

  const filteredThreads = threads.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !t.preview.toLowerCase().includes(q) &&
        !t.phone.includes(q)
      ) {
        return false;
      }
    }
    if (activeFilter === 'urgent') return t.priority === 'urgent' && t.stage !== 'resolved';
    if (activeFilter === 'draft_ready') return t.stage === 'draft_ready';
    if (activeFilter === 'resolved') return t.stage === 'resolved';
    if (activeFilter === 'whatsapp') return t.channel === 'WhatsApp';
    if (activeFilter === 'sms') return t.channel === 'SMS';
    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#0d3f3b] text-white px-4 py-3 rounded-xl shadow-lg border border-teal-500/30 flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Clean Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Patient Inbox &amp; Triage Pipeline
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review incoming patient queries, approve AI-drafted clinical responses, and dispatch via WhatsApp or SMS.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowNewMessageModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-teal-700" />
            <span>Message Patient</span>
          </button>
          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
            <span>Broadcast</span>
          </button>
          <button
            type="button"
            onClick={handleBatchApproveDrafts}
            disabled={draftReadyCount === 0}
            className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
            <span>Approve Ready Drafts ({draftReadyCount})</span>
          </button>
        </div>
      </div>

      {/* Interactive 4-Step Triage Pipeline Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveFilter('urgent');
            const firstUrgent = threads.find(t => t.priority === 'urgent' && t.stage !== 'resolved');
            if (firstUrgent) setSelectedThreadId(firstUrgent.id);
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === 'urgent'
              ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
              01. Urgent Triage
            </span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{urgentCount}</span>
            <span className="text-xs text-slate-500">red flag cases</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveFilter('draft_ready');
            const firstDraft = threads.find(t => t.stage === 'draft_ready');
            if (firstDraft) setSelectedThreadId(firstDraft.id);
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === 'draft_ready'
              ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              02. AI Drafts Ready
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{draftReadyCount}</span>
            <span className="text-xs text-slate-500">awaiting 1-click sign-off</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-teal-50/70 border-teal-300 ring-2 ring-teal-500/20'
              : 'bg-white border-slate-200 hover:border-teal-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
              03. Open Queue
            </span>
            <MessageSquare className="w-4 h-4 text-teal-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {needsReviewCount + draftReadyCount}
            </span>
            <span className="text-xs text-slate-500">active conversations</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('resolved')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === 'resolved'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              04. Dispatched &amp; Resolved
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{resolvedCount}</span>
            <span className="text-xs text-slate-500">completed today</span>
          </div>
        </button>
      </div>

      {/* Main Split-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Clean Queue List (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[680px]">
          {/* Search & Segmented Filter Controls */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by patient name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>

            {/* Clean Segmented Filter Bar */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {[
                { id: 'all', label: 'All' },
                { id: 'urgent', label: 'Urgent' },
                { id: 'draft_ready', label: 'Drafts' },
                { id: 'whatsapp', label: 'WhatsApp' },
                { id: 'sms', label: 'SMS' },
                { id: 'resolved', label: 'Resolved' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id as any)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direct EHR Patient Selector Bar */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-teal-700" />
              <span>{realPatients.length} patients in EHR</span>
            </span>
            <button
              type="button"
              onClick={() => setShowNewMessageModal(true)}
              className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-0.5 cursor-pointer"
            >
              <span>Select patient</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Thread Queue Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-700">No conversations in this filter</p>
                <p className="text-[11px] text-slate-400">
                  Switch filters above or start a new message with a patient.
                </p>
              </div>
            ) : (
              filteredThreads.map(th => {
                const isSelected = th.id === selectedThreadId;
                const isUrgent = th.priority === 'urgent' && th.stage !== 'resolved';

                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => {
                      setSelectedThreadId(th.id);
                      setThreads(prev =>
                        prev.map(item => (item.id === th.id ? { ...item, unread: false } : item))
                      );
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50/60 border-l-4 border-[#0d3f3b]'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                        isUrgent
                          ? 'bg-rose-600'
                          : th.channel === 'WhatsApp'
                          ? 'bg-[#0d3f3b]'
                          : 'bg-slate-700'
                      }`}
                    >
                      {th.name.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-xs truncate ${
                              th.unread ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'
                            }`}
                          >
                            {th.name}
                          </span>
                          {th.unread && (
                            <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{th.timestamp}</span>
                      </div>

                      {/* Clean unboxed metadata line */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 truncate">
                        <span>{th.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            isUrgent
                              ? 'text-rose-600 font-semibold'
                              : th.stage === 'draft_ready'
                              ? 'text-amber-700 font-medium'
                              : th.stage === 'resolved'
                              ? 'text-emerald-700 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {th.statusLabel}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 truncate mt-1">{th.preview}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Focused Conversation & Action Workspace (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[680px]">
          {/* Active Patient Top Bar */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap bg-white">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 truncate">{activeThread.name}</h2>
                <span className="text-xs text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs font-mono text-slate-600">{activeThread.phone}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                <span>{activeThread.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span>Via {activeThread.channel}</span>
              </div>
            </div>

            {/* Clean Action Bar */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => handleToggleThreadStage(activeThread.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeThread.stage === 'resolved'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{activeThread.stage === 'resolved' ? 'Resolved' : 'Mark Resolved'}</span>
              </button>

              <a
                href={`tel:${activeThread.phone.replace(/\s+/g, '')}`}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                title="Call patient directly"
              >
                <Phone className="w-3.5 h-3.5 text-slate-600" />
                <span>Call</span>
              </a>

              <button
                type="button"
                onClick={handleOpenWhatsAppShareModal}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Format & send full Rx or clinical summary on WhatsApp"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Send Rx / Report</span>
              </button>

              <a
                href={getWhatsAppWebUrl(
                  cleanPhoneNumber(activeThread.phone),
                  customReply ||
                    activeThread.draftReply ||
                    `Hello ${activeThread.name}, this is Dr. ${doctor?.name || 'Sarah Chen'}.`
                )}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Open conversation in WhatsApp Web"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                <span>WhatsApp Web</span>
              </a>
            </div>
          </div>

          {/* Clinical Context Strip */}
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-700 shrink-0">Clinical Context:</span>
              <span className="text-slate-600 truncate">{activeThread.aiSummary}</span>
            </div>
            <span className="text-[11px] font-medium text-slate-400 shrink-0">
              Stage:{' '}
              <strong className="text-slate-700">
                {activeThread.stage === 'needs_review'
                  ? 'Needs Review'
                  : activeThread.stage === 'draft_ready'
                  ? 'Draft Ready'
                  : 'Resolved'}
              </strong>
            </span>
          </div>

          {/* Conversation History Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#f9fbfa]">
            {activeThread.messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${
                  m.sender === 'patient'
                    ? 'justify-start'
                    : m.sender === 'ai'
                    ? 'justify-center'
                    : 'justify-end'
                }`}
              >
                {m.sender === 'ai' ? (
                  <div className="text-[11px] text-slate-500 bg-slate-100/80 px-3 py-1 rounded-md">
                    {m.text}
                  </div>
                ) : (
                  <div
                    className={`max-w-lg px-4 py-3 rounded-2xl text-xs ${
                      m.sender === 'patient'
                        ? 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                        : 'bg-[#0d3f3b] text-white rounded-tr-xs'
                    }`}
                  >
                    <p className="leading-relaxed">{m.text}</p>
                    <div
                      className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] ${
                        m.sender === 'patient' ? 'text-slate-400' : 'text-teal-200/90'
                      }`}
                    >
                      <span>{m.time}</span>
                      {m.status && (
                        <span className="flex items-center gap-0.5">
                          · <CheckCheck className="w-3 h-3 inline" /> {m.status}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Clean AI Suggested Draft Card (Only visible when a draft is pending) */}
            {activeThread.draftReply && (
              <div className="bg-white border border-teal-600/30 rounded-xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-teal-900">Suggested Clinical Reply</span>
                    <span className="text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-500">Prepared from patient chart</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomReply(activeThread.draftReply);
                        showToast('Loaded draft into composer for manual editing.');
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const alternate = `Hi ${activeThread.name}, please follow up with the clinic regarding your symptoms so we can review your progress today.`;
                        setThreads(prev =>
                          prev.map(t =>
                            t.id === activeThread.id ? { ...t, draftReply: alternate } : t
                          )
                        );
                        showToast('Generated alternative clinical response.');
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Rewrite</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200/80 leading-relaxed">
                  {activeThread.draftReply}
                </p>

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-500">
                    Approving logs the message and marks this thread resolved.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDispatching}
                      onClick={() => handleSendMessage(activeThread.draftReply, false)}
                      className="px-3.5 py-1.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve &amp; Log Reply</span>
                    </button>
                    {activeThread.channel === 'WhatsApp' && (
                      <button
                        type="button"
                        disabled={isDispatching}
                        onClick={() => handleSendMessage(activeThread.draftReply, true)}
                        className="px-3.5 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                        <span>Approve &amp; Open WhatsApp</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Clinical Templates Drawer */}
            {showTemplateDrawer && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800">
                    Select Standard Clinical Template
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTemplateDrawer(false)}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CLINICAL_TEMPLATES.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setCustomReply(tpl.text);
                        setShowTemplateDrawer(false);
                      }}
                      className="text-left p-2.5 rounded-lg bg-slate-50 hover:bg-teal-50/70 border border-slate-200/80 hover:border-teal-300 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900">{tpl.title}</div>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{tpl.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Unified Composer Footer */}
          <div className="p-3.5 border-t border-slate-200 bg-white space-y-2.5">
            {/* Subtle Quick-Insert Actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowTemplateDrawer(prev => !prev)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  {showTemplateDrawer ? 'Hide Templates' : '+ Insert Template'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCustomReply(
                      'Please complete your consultation fee payment securely here: https://pay.dermacare.in/rx-portal'
                    )
                  }
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  + Payment Link
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCustomReply(
                      'Please review and sign your procedure consent form prior to your visit: https://consent.dermacare.in/form'
                    )
                  }
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  + Consent Link
                </button>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Press Enter to log &amp; send
              </span>
            </div>

            {/* Input & Dispatch Controls */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={`Write a message to ${activeThread.name}...`}
                value={customReply}
                onChange={e => setCustomReply(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customReply.trim()) {
                    e.preventDefault();
                    handleSendMessage(customReply, false);
                  }
                }}
                className="flex-1 text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
              />

              <VoiceDictationButton
                value={customReply}
                onChange={setCustomReply}
                variant="badge"
                title="Dictate reply with microphone"
              />

              <button
                type="button"
                disabled={isDispatching || !customReply.trim()}
                onClick={() => handleSendMessage(customReply, false)}
                className="px-4 py-2.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Streamlined Refill & Follow-Up Action Queue */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Pending Prescription Refill Authorizations
            </h3>
            <p className="text-xs text-slate-500">
              One-click verification dispatches refill confirmation directly to the patient&apos;s thread.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {refillQueue.filter(r => r.status === 'pending').length} pending review
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {refillQueue.map(item => (
            <div
              key={item.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-900">{item.name}</span>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-medium text-teal-800">{item.medication}</span>
                </div>
                <p className="text-xs text-slate-500">{item.note}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedThreadId(item.threadId)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  View Thread
                </button>
                {item.status === 'approved' ? (
                  <span className="px-3 py-1.5 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Approved
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRefillQueue(prev =>
                        prev.map(r => (r.id === item.id ? { ...r, status: 'approved' } : r))
                      );
                      setThreads(prev =>
                        prev.map(t =>
                          t.id === item.threadId
                            ? {
                                ...t,
                                stage: 'resolved',
                                statusLabel: 'Refill approved',
                                messages: [
                                  ...t.messages,
                                  {
                                    sender: 'doctor',
                                    text: `Refill authorized for ${item.medication}.`,
                                    time: 'Just now',
                                    status: 'dispatched'
                                  }
                                ],
                                draftReply: ''
                              }
                            : t
                        )
                      );
                      showToast(`Refill authorized and sent to ${item.name}.`);
                    }}
                    className="px-3.5 py-1.5 bg-[#0d3f3b] hover:bg-[#135650] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Authorize Refill
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Select Registered Patient from EHR */}
      {showNewMessageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Message a Registered Patient</h3>
                <p className="text-xs text-slate-500">
                  Select any patient from your clinic EHR to open a direct WhatsApp thread
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewMessageModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {isLoadingPatients ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Loading patients from database...
                </div>
              ) : realPatients.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No registered patients found.
                </div>
              ) : (
                realPatients.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPatientForMessaging(p)}
                    className="p-3 hover:bg-slate-50 transition-colors rounded-xl cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900">{p.fullName}</span>
                        <span className="text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono text-slate-500">{p.patientCode}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {p.age}y · {p.gender} · {p.mobile || 'No mobile'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-[#0d3f3b] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      <WhatsAppIcon className="w-3 h-3 fill-white" />
                      <span>Open Thread</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewMessageModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Broadcast Campaign */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Patient Broadcast Campaign</h3>
                <p className="text-xs text-slate-500">
                  Send follow-up reminders or clinic announcements to a filtered patient group
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBroadcastModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Audience Filter</label>
                <select
                  value={broadcastFilter}
                  onChange={e => setBroadcastFilter(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option>All active patients ({realPatients.length || 18} patients)</option>
                  <option>Follow-up due this week (8 patients)</option>
                  <option>Post-procedure healing check (5 patients)</option>
                  <option>Patients on topical therapy (12 patients)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Campaign Message</label>
                <textarea
                  rows={4}
                  value={broadcastText}
                  onChange={e => setBroadcastText(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBroadcastModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBroadcastModalOpen(false);
                    showToast(`Broadcast queued for ${broadcastFilter}.`);
                  }}
                  className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Broadcast</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full WhatsApp Medical Report / Prescription Modal */}
      {showWhatsAppReportModal && selectedPatientForReport && (
        <WhatsAppShareModal
          isOpen={showWhatsAppReportModal}
          onClose={() => setShowWhatsAppReportModal(false)}
          patient={selectedPatientForReport}
          doctor={doctor}
          reportType="patient_summary"
          data={{}}
          onSentSuccess={() => {
            showToast(`WhatsApp report dispatched to ${selectedPatientForReport.fullName}.`);
          }}
        />
      )}
    </div>
  );
};
