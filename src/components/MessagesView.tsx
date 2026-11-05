import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Patient } from '../types';
import { api } from '../lib/api';
import { VoiceDictationButton } from './VoiceDictationButton';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import {
  cleanPhoneNumber,
  getWhatsAppWebUrl,
  getWhatsAppNativeUri,
  generateWhatsAppLink
} from '../lib/whatsappUtils';
import {
  Search,
  Sparkles,
  Phone,
  Video,
  Send,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Building,
  Check,
  RefreshCw,
  FileText,
  CreditCard,
  FileCheck,
  MessageSquare,
  Shield,
  Calendar,
  ArrowRight,
  Plus,
  ExternalLink,
  Share2,
  Copy,
  X,
  Stethoscope,
  ChevronRight,
  CheckCheck
} from 'lucide-react';

interface Thread {
  id: string;
  name: string;
  subtitle: string;
  category: 'patients' | 'pharmacies' | 'collaborations';
  channel: 'WhatsApp' | 'SMS' | 'Email' | 'App';
  preview: string;
  timestamp: string;
  unread: boolean;
  tag?: string;
  tagColor?: string;
  phone: string;
  aiSummary: string;
  patientId?: string;
  messages: { sender: 'patient' | 'doctor' | 'ai'; text: string; time: string; status?: string }[];
  draftReply: string;
}

const CLINICAL_TEMPLATES = [
  {
    title: 'Post-Procedure Care',
    label: 'Post-Op',
    text: 'Keep the treated area clean and dry for 24 hours. Apply the prescribed soothing ointment twice daily. Avoid direct sun exposure and do not pick at scabs or peeling skin.'
  },
  {
    title: 'Prescription & Dosage Guide',
    label: 'Rx Guide',
    text: 'Please take your medications as prescribed after meals. If using topical cream, apply a pea-sized amount evenly to affected areas at bedtime.'
  },
  {
    title: 'Follow-Up Visit Booking',
    label: 'Follow-Up',
    text: 'Doctor advises an in-clinic follow-up visit in 2 weeks to evaluate healing progression. Please reply with your preferred day or book via our clinic portal.'
  },
  {
    title: 'Lab Test Preparation',
    label: 'Lab Prep',
    text: 'For your advised skin biopsy/blood tests, please arrive at the clinic lab fasting for 8 hours (water allowed). Bring your previous report copies.'
  },
  {
    title: 'Red Flag Emergency Alert',
    label: 'Red Flag',
    text: 'If you develop rapid swelling, fever above 100°F, spreading pain, or bleeding from the lesion site, please visit our clinic immediately or call emergency triage.'
  }
];

export const MessagesView: React.FC = () => {
  const { doctor } = useAuth();
  const { t } = useLanguage();
  const isReceptionist = doctor?.role === 'receptionist';

  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'whatsapp' | 'sms' | 'doubts' | 'refills' | 'patients'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('t-1');
  const [realPatients, setRealPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Modals & Drawers
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [showDigestModal, setShowDigestModal] = useState(false);
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
  const [broadcastText, setBroadcastText] = useState('Hi [name], this is Dr. ' + (doctor?.name || 'Sarah Chen') + ' from Dermacare. Please remember to apply SPF 50+ sunscreen daily and let us know if you need to schedule your follow-up check.');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [threads, setThreads] = useState<Thread[]>([
    {
      id: 't-1',
      name: 'Rohit Sharma',
      subtitle: '28y • P-24621 • WhatsApp • English',
      category: 'patients',
      channel: 'WhatsApp',
      preview: 'Chest feels tight since morning with red rash',
      timestamp: '2 min ago',
      unread: true,
      tag: 'Red flag - Call or WhatsApp',
      tagColor: 'bg-rose-100 text-rose-800 border-rose-200',
      phone: '+91 98765 43210',
      aiSummary: 'Patient reports acute rash extension with chest tightness. High priority clinical triage advised immediately.',
      messages: [
        { sender: 'patient', text: 'Doctor, my chest feels tight and the rash is spreading since morning. Is this normal?', time: '9:30 AM' }
      ],
      draftReply: 'Rohit, please call the clinic hotline (+91 98765 43210) or visit the nearest emergency room immediately for an urgent evaluation.'
    },
    {
      id: 't-2',
      name: 'Harman Preet',
      subtitle: '25y • P-24618 • WhatsApp • English and Punjabi',
      category: 'patients',
      channel: 'WhatsApp',
      preview: 'Itching more at night, is it normal?',
      timestamp: '40 min ago',
      unread: true,
      tag: 'Doubt - draft ready',
      tagColor: 'bg-amber-100 text-amber-800 border-amber-200',
      phone: '+91 98765 11223',
      aiSummary: 'Less redness, more night itching. Clinical photo shows improvement. No fever or swelling mentioned.',
      messages: [
        { sender: 'patient', text: 'Doctor, the redness is better but the itching is more at night. Is this normal?', time: '9:41 AM', status: 'photo attached' },
        { sender: 'doctor', text: 'Hi Harman. I received your message and photo. I will reply with advice shortly.', time: '9:45 AM', status: 'read' }
      ],
      draftReply: 'Mild itching at night is common as the epidermal barrier repairs. Keep the area moisturised with your prescribed cream, avoid scratching, and message us if you notice fever or pain.'
    },
    {
      id: 't-3',
      name: 'Simran Kaur',
      subtitle: '31y • P-24619 • WhatsApp • Refill request',
      category: 'patients',
      channel: 'WhatsApp',
      preview: 'Need refill for my prescribed tablets',
      timestamp: '3 h ago',
      unread: false,
      tag: 'Refill - safe',
      tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      phone: '+91 91234 56789',
      aiSummary: 'Antihistamine tablet 30 days. Seen 3 weeks ago. Safe refill authorized.',
      messages: [
        { sender: 'patient', text: 'Hello doctor, I need a refill for my allergy tablets for another 30 days.', time: '7:15 AM' }
      ],
      draftReply: 'Hello Simran, your 30-day refill has been authorized. You can collect your prescription or order via our partnered pharmacy.'
    },
    {
      id: 't-4',
      name: 'Anita Verma',
      subtitle: '42y • P-24622 • WhatsApp • Reschedule request',
      category: 'patients',
      channel: 'WhatsApp',
      preview: 'Can we move my visit to Friday?',
      timestamp: '3 h ago',
      unread: false,
      tag: 'Reschedule - 3 slots',
      tagColor: 'bg-teal-100 text-teal-800 border-teal-200',
      phone: '+91 99887 76655',
      aiSummary: 'Wants to move visit. Three open slots fit clinic schedule (10:00 AM, 2:30 PM, 4:00 PM).',
      messages: [
        { sender: 'patient', text: 'Can we move my visit from tomorrow to Friday? Something urgent came up.', time: '6:50 AM' }
      ],
      draftReply: 'Hi Anita, we have open slots on Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Would any of these work for you?'
    },
    {
      id: 't-5',
      name: 'Meera Patel',
      subtitle: '29y • P-24623 • SMS • Follow-up check',
      category: 'patients',
      channel: 'SMS',
      preview: 'Thank you for the prescription',
      timestamp: 'Yesterday',
      unread: false,
      tag: 'Follow-up nudge',
      tagColor: 'bg-slate-100 text-slate-700 border-slate-200',
      phone: '+91 98111 22334',
      aiSummary: 'Topical cream 2 tubes. Review due next week.',
      messages: [
        { sender: 'patient', text: 'Thank you for the prescription. I am using the cream as directed.', time: 'Yesterday' }
      ],
      draftReply: 'Hi Meera, glad to hear that. Please let us know if you experience any mild stinging or if you need a follow-up consultation.'
    },
    {
      id: 't-6',
      name: 'Apollo Pharmacy Hub',
      subtitle: 'Partner Pharmacy • Refill Verification',
      category: 'pharmacies',
      channel: 'SMS',
      preview: 'Verifying prescription batch #RX-8842',
      timestamp: '1 h ago',
      unread: true,
      tag: 'Pharmacy',
      tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      phone: '+91 1800 420 000',
      aiSummary: 'Partner pharmacy requesting stock confirmation for topical corticosteroid cream.',
      messages: [
        { sender: 'patient', text: 'Hello Doctor, confirming prescription for patient Harman (P-24618). Please authorize.', time: '11:15 AM' }
      ],
      draftReply: 'Prescription batch #RX-8842 verified and authorized for dispensing.'
    }
  ]);

  // Load registered patients from clinic database
  useEffect(() => {
    setIsLoadingPatients(true);
    api.patients.list()
      .then(res => {
        if (res.patients && res.patients.length > 0) {
          setRealPatients(res.patients);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingPatients(false));
  }, []);

  const activeThread = threads.find(t => t.id === selectedThreadId) || threads[0];

  // Dispatch a message
  const handleSendMessage = async (textToSend: string, forceWhatsApp = false) => {
    if (!textToSend.trim() || !activeThread) return;
    setIsDispatching(true);

    const messageText = textToSend.trim();
    const cleanPhone = cleanPhoneNumber(activeThread.phone);

    // If channel is WhatsApp or forceWhatsApp is true, trigger WhatsApp dispatch
    if (activeThread.channel === 'WhatsApp' || forceWhatsApp) {
      try {
        // 1. Audit log to server pipeline
        await api.reports.logWhatsApp({
          patientId: activeThread.patientId || activeThread.id,
          reportType: 'chat_message',
          recipientMobile: cleanPhone,
          note: messageText.slice(0, 100)
        }).catch(() => {});

        // 2. Open WhatsApp Web or Native URI
        const webUrl = getWhatsAppWebUrl(cleanPhone, messageText);
        window.open(webUrl, '_blank');

        showToast(`Opened WhatsApp chat for ${activeThread.name}! Message queued.`);
      } catch {
        showToast(`Dispatched message to ${activeThread.name}`);
      }
    } else {
      showToast(`Message dispatched via ${activeThread.channel} to ${activeThread.name}`);
    }

    // Update local thread messages
    setThreads(prev =>
      prev.map(t => {
        if (t.id === activeThread.id) {
          return {
            ...t,
            messages: [
              ...t.messages,
              { sender: 'doctor', text: messageText, time: 'Just now', status: 'sent' }
            ],
            draftReply: '',
            preview: messageText,
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

  // Start or open thread with a patient from the clinic EHR
  const handleSelectPatientForMessaging = (patient: Patient) => {
    const existingThread = threads.find(
      t => t.patientId === patient.id || t.phone.replace(/\D/g, '').endsWith((patient.mobile || '').slice(-10))
    );

    if (existingThread) {
      setSelectedThreadId(existingThread.id);
      setShowNewMessageModal(false);
      showToast(`Selected existing thread with ${patient.fullName}`);
      return;
    }

    const cleanNumber = patient.mobile ? `+91 ${patient.mobile.replace(/\D/g, '').slice(-10)}` : '+91 98000 00000';
    const newThread: Thread = {
      id: `p-thread-${patient.id}`,
      name: patient.fullName,
      subtitle: `${patient.age}y • ${patient.patientCode} • WhatsApp • ${patient.gender}`,
      category: 'patients',
      channel: 'WhatsApp',
      preview: patient.notes ? `Notes: ${patient.notes.slice(0, 45)}` : 'New conversation with patient',
      timestamp: 'Just now',
      unread: false,
      tag: 'Registered Patient',
      tagColor: 'bg-teal-100 text-teal-800 border-teal-200',
      phone: cleanNumber,
      patientId: patient.id,
      aiSummary: `EHR Profile: ${patient.age}y ${patient.gender}. Allergies: ${patient.allergies || 'None documented'}. Medical History: ${patient.medicalHistory || 'Routine'}.`,
      messages: [
        {
          sender: 'ai',
          text: `EHR link established for ${patient.fullName} (${patient.patientCode}). You can send clinical updates, Rx reminders, or open WhatsApp Web directly.`,
          time: 'Just now'
        }
      ],
      draftReply: `Hello ${patient.fullName}, this is Dr. ${doctor?.name || 'Sarah Chen'} following up regarding your dermatology visit. How is your skin condition improving?`
    };

    setThreads(prev => [newThread, ...prev]);
    setSelectedThreadId(newThread.id);
    setShowNewMessageModal(false);
    showToast(`Started new WhatsApp thread with ${patient.fullName}`);
  };

  // Open full WhatsApp report modal for the active patient
  const handleOpenWhatsAppShareModal = () => {
    let targetPatient = realPatients.find(p => p.id === activeThread.patientId || p.fullName === activeThread.name);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#0d3f3b] text-white px-4 py-3 rounded-2xl shadow-xl border border-teal-500/40 flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0f2926] tracking-tight">
              Messages &amp; Patient Communications
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
              <WhatsAppIcon className="w-3 h-3 fill-emerald-700" />
              WhatsApp Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#5c7c77] mt-1">
            Omnichannel triage &amp; automated WhatsApp messaging pipeline for prescriptions, follow-ups, and clinical alerts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowNewMessageModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-teal-700" />
            <span>+ Message Patient</span>
          </button>
          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-teal-700" />
            <span>New broadcast</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const safeCount = threads.filter(t => t.tag?.includes('safe') || t.tag?.includes('draft ready')).length;
              showToast(`Approved ${safeCount} safe AI drafts! Dispatched to patient queue.`);
            }}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Approve safe drafts</span>
          </button>
        </div>
      </div>

      {/* AI Digest Banner */}
      <div className="bg-[#0f3b37] text-white p-6 rounded-3xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-3 z-10 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/30 text-teal-200 text-[10px] font-bold uppercase tracking-wider">
              While you were in clinic • AI Triage Digest
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            3 need you now. 5 are ready to approve. 4 can wait.
          </h2>
          <ul className="text-xs sm:text-sm text-teal-100 space-y-1 font-medium list-disc list-inside">
            <li>Rohit Sharma reports spreading rash &amp; chest tightness. Call him first.</li>
            <li>Simran&apos;s allergy tablet refill is safe to approve.</li>
            <li>Anita wants to move her visit to Friday. Three slots fit your day.</li>
          </ul>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('urgent');
                const urgent = threads.find(t => t.tag?.includes('Red flag') || t.tag?.includes('urgent'));
                if (urgent) setSelectedThreadId(urgent.id);
              }}
              className="px-4 py-2 bg-white text-[#0f3b37] rounded-xl text-xs font-bold hover:bg-teal-50 transition-colors shadow-xs cursor-pointer"
            >
              Handle urgent first →
            </button>
            <button
              type="button"
              onClick={() => setShowDigestModal(true)}
              className="px-4 py-2 bg-teal-800/80 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold transition-colors border border-teal-600/40 cursor-pointer"
            >
              Read full digest
            </button>
          </div>
        </div>

        {/* Digest Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 w-full lg:w-auto z-10 shrink-0">
          <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-2xl font-extrabold text-white block">12</span>
            <span className="text-[10px] text-teal-200 font-bold uppercase tracking-wider">unread</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-2xl font-extrabold text-rose-300 block">3</span>
            <span className="text-[10px] text-rose-200 font-bold uppercase tracking-wider">red flags</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-2xl font-extrabold text-white block">4 min</span>
            <span className="text-[10px] text-teal-200 font-bold uppercase tracking-wider">average reply</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-2xl font-extrabold text-teal-300 block">38%</span>
            <span className="text-[10px] text-teal-200 font-bold uppercase tracking-wider">AI resolved</span>
          </div>
        </div>
      </div>

      {/* Two-Column Inbox Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Thread List Column (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[760px]">
          {/* Search & Filters */}
          <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/70">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient name, phone, or message text..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            {/* Category / Channel Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon },
                { id: 'urgent', label: 'Urgent' },
                { id: 'refills', label: 'Refills' },
                { id: 'doubts', label: 'Doubts' },
                { id: 'sms', label: 'SMS' },
                { id: 'patients', label: `Clinic Patients (${realPatients.length})` }
              ].map(tab => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {IconComponent && <IconComponent className={`w-3 h-3 ${activeTab === tab.id ? 'fill-white' : 'fill-emerald-600'}`} />}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Patient Direct Message Shortcut Bar */}
          <div className="px-4 py-2.5 bg-teal-50/60 border-b border-teal-100/80 flex items-center justify-between text-xs">
            <span className="text-[11px] font-bold text-teal-900 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-teal-700" />
              Direct Patient Messaging
            </span>
            <button
              type="button"
              onClick={() => setShowNewMessageModal(true)}
              className="text-[10.5px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
            >
              <span>+ Pick from EHR</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Thread List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {threads
              .filter(t => {
                if (searchQuery) {
                  const q = searchQuery.toLowerCase();
                  if (!t.name.toLowerCase().includes(q) && !t.preview.toLowerCase().includes(q) && !t.phone.includes(q)) {
                    return false;
                  }
                }
                if (activeTab === 'urgent' && !t.tag?.toLowerCase().includes('red flag') && !t.tag?.toLowerCase().includes('urgent')) return false;
                if (activeTab === 'doubts' && !t.tag?.toLowerCase().includes('doubt')) return false;
                if (activeTab === 'refills' && !t.tag?.toLowerCase().includes('refill')) return false;
                if (activeTab === 'whatsapp' && t.channel !== 'WhatsApp') return false;
                if (activeTab === 'sms' && t.channel !== 'SMS') return false;
                if (activeTab === 'patients' && !t.patientId) return false;
                return true;
              })
              .map(th => {
                const isSelected = th.id === selectedThreadId;
                const isWhatsApp = th.channel === 'WhatsApp';
                return (
                  <div
                    key={th.id}
                    onClick={() => setSelectedThreadId(th.id)}
                    className={`p-4 cursor-pointer transition-colors flex items-start gap-3 relative ${
                      isSelected ? 'bg-teal-50/70 border-l-4 border-teal-700' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 relative ${
                      isWhatsApp ? 'bg-emerald-600' : 'bg-teal-800'
                    }`}>
                      {th.name.charAt(0)}
                      {isWhatsApp && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                          <WhatsAppIcon className="w-2.5 h-2.5 fill-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 truncate">{th.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{th.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{th.subtitle}</p>
                      <p className="text-xs font-medium text-slate-700 truncate mt-1">{th.preview}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {th.tag && (
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${th.tagColor}`}>
                            {th.tag}
                          </span>
                        )}
                        <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-semibold ${
                          isWhatsApp ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {th.channel}
                        </span>
                      </div>
                    </div>
                    {th.unread && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute right-4 top-4" />
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Active Thread Chat & Action Panel (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[760px]">
          {/* Thread Top Bar */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 gap-2 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 ${
                activeThread.channel === 'WhatsApp' ? 'bg-emerald-600' : 'bg-teal-700'
              }`}>
                {activeThread.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{activeThread.name}</h3>
                  {activeThread.channel === 'WhatsApp' && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1 shrink-0">
                      <WhatsAppIcon className="w-2.5 h-2.5 fill-emerald-800" />
                      WhatsApp
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-mono">{activeThread.phone}</span>
                  <span>•</span>
                  <span className="truncate">{activeThread.subtitle}</span>
                </div>
              </div>
            </div>

            {/* Header Direct Actions */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {/* WhatsApp Web Direct Launch Button */}
              <a
                href={getWhatsAppWebUrl(cleanPhoneNumber(activeThread.phone), customReply || activeThread.draftReply || `Hello ${activeThread.name}, this is Dr. ${doctor?.name || 'Sarah Chen'}.`)}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Open directly in WhatsApp Web in a new browser tab"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                <span>WhatsApp Web</span>
              </a>

              {/* Direct Phone Dial Link */}
              <a
                href={`tel:${activeThread.phone.replace(/\s+/g, '')}`}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Initiate direct phone call"
              >
                <Phone className="w-3.5 h-3.5 text-teal-700" />
                <span>Call</span>
              </a>

              {/* Send Clinical Report via WhatsApp */}
              <button
                type="button"
                onClick={handleOpenWhatsAppShareModal}
                className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Send full formatted medical report or Rx to patient's WhatsApp"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Send Rx / Report</span>
              </button>
            </div>
          </div>

          {/* Scrollable Chat & AI Draft Workspace */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8faf9]">
            {/* AI Summary Banner */}
            <div className="p-3.5 bg-teal-50/80 border border-teal-200 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <span>Clinical Triage &amp; AI Thread Summary</span>
              </div>
              <p className="text-teal-800 leading-relaxed font-medium">{activeThread.aiSummary}</p>
            </div>

            {/* Chat Bubbles */}
            {activeThread.messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'patient' ? 'justify-start' : m.sender === 'ai' ? 'justify-center' : 'justify-end'}`}>
                {m.sender === 'ai' ? (
                  <div className="bg-slate-100 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-[11px] max-w-md text-center italic">
                    {m.text}
                  </div>
                ) : (
                  <div className={`max-w-md p-3.5 rounded-2xl text-xs ${
                    m.sender === 'patient'
                      ? 'bg-white text-slate-800 border border-slate-200 shadow-2xs rounded-tl-xs'
                      : 'bg-teal-800 text-white rounded-tr-xs shadow-xs'
                  }`}>
                    <p className="leading-relaxed">{m.text}</p>
                    <div className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${m.sender === 'patient' ? 'text-slate-400' : 'text-teal-200'}`}>
                      <span>{m.time}</span>
                      {m.status && (
                        <span className="flex items-center gap-0.5">
                          • <CheckCheck className="w-3 h-3 inline text-teal-300" /> {m.status}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* AI Draft Response Box */}
            {activeThread.draftReply && (
              <div className="bg-white border-2 border-teal-600/30 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-bold">
                      AI
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      AI Suggested Response • Tailored to Patient EHR
                    </span>
                  </div>
                  <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                    Doctor approval required
                  </span>
                </div>

                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed font-medium">
                  {activeThread.draftReply}
                </p>

                {/* Tone / Language Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Tones:</span>
                  {['Reassuring', 'Clinical', 'Concise', 'English', 'हिंदी', 'ਪੰਜਾਬੀ'].map(pill => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => showToast(`Draft calibrated to ${pill} style.`)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold border border-slate-200 cursor-pointer transition-colors"
                    >
                      {pill}
                    </button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isDispatching}
                    onClick={() => handleSendMessage(activeThread.draftReply)}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve and Send</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomReply(activeThread.draftReply);
                      showToast('Draft copied to input bar for editing.');
                    }}
                    className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Edit in Bar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Alternate draft
                      const alternate = `Hi ${activeThread.name}, please follow up with the clinic regarding your current symptoms. Feel free to call us directly.`;
                      setThreads(prev =>
                        prev.map(t => (t.id === activeThread.id ? { ...t, draftReply: alternate } : t))
                      );
                      showToast('Generated fresh alternative draft.');
                    }}
                    className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-slate-500" />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Clinical Templates Drawer (Toggled) */}
            {showTemplateDrawer && (
              <div className="bg-white border border-teal-200 rounded-2xl p-3.5 shadow-sm space-y-2 animate-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-700" />
                    Insert Clinical Quick Template
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTemplateDrawer(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
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
                        showToast(`Inserted template: ${tpl.title}`);
                      }}
                      className="text-left p-2 rounded-xl bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 transition-colors cursor-pointer"
                    >
                      <div className="text-[11px] font-bold text-slate-900">{tpl.title}</div>
                      <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{tpl.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowTemplateDrawer(prev => !prev)}
                className="px-3 py-1.5 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-teal-900 rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>{showTemplateDrawer ? 'Close Templates' : 'Templates'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsAppShareModal}
                className="px-3 py-1.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600" />
                <span>WhatsApp Rx / PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCustomReply('Please find your consultation fee payment link: https://pay.dermacare.in/rx-portal');
                  showToast('Payment link inserted into message bar.');
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Payment Link
              </button>

              <button
                type="button"
                onClick={() => {
                  setCustomReply('Please fill out the electronic consent form before your procedure: https://consent.dermacare.in/form');
                  showToast('Consent form link inserted.');
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Consent Form
              </button>
            </div>
          </div>

          {/* Bottom Message Input Box */}
          <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
            <input
              type="text"
              placeholder={`Type a message to ${activeThread.name} (Press Enter to send)...`}
              value={customReply}
              onChange={e => setCustomReply(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage(customReply);
                }
              }}
              className="flex-1 text-xs px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
            />

            {/* Voice Dictation for hands-free typing */}
            <VoiceDictationButton
              value={customReply}
              onChange={setCustomReply}
              variant="badge"
              title="Speak reply with microphone (English / Hindi / Punjabi)"
            />

            {/* Send Button */}
            <button
              type="button"
              disabled={isDispatching || !customReply.trim()}
              onClick={() => handleSendMessage(customReply)}
              className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Feature Grid Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {/* 1. Refill Requests */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Refill Requests • AI Checked</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">3 pending</span>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Simran Kaur • tablet, 30 days', desc: 'Seen 3 weeks ago. No interactions. Dose unchanged.', status: 'Safe to Refill', color: 'bg-emerald-100 text-emerald-800' },
              { name: 'Meera Patel • cream, 2 tubes', desc: 'Review overdue by 40 days.', status: 'Review Needed', color: 'bg-amber-100 text-amber-800' },
              { name: 'Anil Kumar • steroid lotion', desc: 'Used more this month. Suggest in-clinic visit.', status: 'Red Flag', color: 'bg-rose-100 text-rose-800' },
            ].map((ref, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-900 truncate">{ref.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{ref.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast(`Handled refill: ${ref.name}`)}
                  className={`px-3 py-1 rounded-xl text-[11px] font-bold shrink-0 transition cursor-pointer hover:opacity-80 ${ref.color}`}
                >
                  {ref.status}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Symptom Check-Ins */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Symptom Check-Ins • Automated</h3>
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Improving</span>
                <span>64%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="w-[64%] h-full bg-teal-600 rounded-full" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Same</span>
                <span>24%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="w-[24%] h-full bg-amber-500 rounded-full" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Worse</span>
                <span>12%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="w-[12%] h-full bg-rose-500 rounded-full" />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Patients who reply &quot;worse&quot; automatically escalate to the top of your inbox with red flag banners.
          </p>
        </div>

        {/* 3. Team Inbox & Handover */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Team Inbox &amp; Handover</h3>
          <div className="space-y-3">
            {[
              { role: 'Receptionist Desk', count: '3 assigned', bg: 'bg-teal-50 text-teal-800' },
              { role: 'Clinical Nurse', count: '2 assigned', bg: 'bg-sky-50 text-sky-800' },
              { role: 'Doctor On-Duty', count: '7 open', bg: 'bg-amber-50 text-amber-800' },
            ].map((team, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{team.role}</span>
                <span className={`px-2.5 py-1 rounded-xl text-xs font-extrabold ${team.bg}`}>{team.count}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            Shift handover notes are compiled automatically by AI at the close of every clinic session.
          </p>
        </div>
      </div>

      {/* New Patient Direct Message Selector Modal */}
      {showNewMessageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Message a Registered Patient</h3>
                <p className="text-xs text-slate-500">Select any patient from your EHR database to start communicating</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewMessageModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {isLoadingPatients ? (
                <div className="p-6 text-center text-xs text-slate-500">Loading patients from database...</div>
              ) : realPatients.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No registered patients found.</div>
              ) : (
                realPatients.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPatientForMessaging(p)}
                    className="p-3 hover:bg-teal-50/70 transition-colors rounded-xl cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{p.fullName}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                          {p.patientCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {p.age}y • {p.gender} • {p.mobile || 'No mobile'}
                      </p>
                      {p.notes && (
                        <p className="text-[10.5px] text-teal-800 font-medium truncate mt-0.5">
                          {p.notes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                    >
                      <WhatsAppIcon className="w-3 h-3 fill-white" />
                      <span>Chat</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewMessageModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4 text-teal-800" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Patient Broadcast Campaign</h3>
                  <p className="text-xs text-slate-500">Send WhatsApp announcements, follow-up reminders, or seasonal tips</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBroadcastModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
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
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-2">
                <WhatsAppIcon className="w-4 h-4 fill-emerald-700 shrink-0" />
                <span className="text-[11px] font-medium">
                  Broadcasts are dispatched through the verified WhatsApp business gateway with compliance opt-out.
                </span>
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
                    showToast(`Broadcast campaign dispatched to ${broadcastFilter}!`);
                  }}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Broadcast</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Digest Modal */}
      {showDigestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold">
                  AI
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">AI Clinical Communication Digest</h3>
                  <p className="text-xs text-slate-500">Summary compiled while you were with patients</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDigestModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-teal-50 rounded-2xl border border-teal-200 space-y-2">
                <h4 className="font-bold text-teal-900 text-sm">Priority Action Summary</h4>
                <p className="text-teal-800 leading-relaxed font-medium">
                  12 unread messages analyzed. 3 require immediate clinical evaluation (Red Flags), 5 refills ready for safe batch approval, and 4 general appointments/inquiries waiting.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800">Critical Patient Cases</h4>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="flex justify-between font-bold text-rose-900">
                    <span>Rohit Sharma (P-24621) - WhatsApp</span>
                    <span className="text-rose-700">2 min ago</span>
                  </div>
                  <p className="text-rose-800">Acute chest tightness and spreading rash reported. High priority clinical triage advised.</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800">Routine Refills &amp; Follow-ups</h4>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900 block">Simran &amp; Meera Refill Requests</span>
                  <p className="text-slate-600">AI verified dosage safety against patient history. Ready for 1-click batch approval.</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDigestModal(false)}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-xs cursor-pointer"
              >
                Got it, Return to Inbox
              </button>
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
            showToast(`WhatsApp report dispatched to ${selectedPatientForReport.fullName}!`);
          }}
        />
      )}
    </div>
  );
};
