import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';
import {
  Search,
  Sparkles,
  Phone,
  Video,
  Send,
  Paperclip,
  Mic,
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
  Plus
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
  messages: { sender: 'patient' | 'doctor' | 'ai'; text: string; time: string; status?: string }[];
  draftReply: string;
}

export const MessagesView: React.FC = () => {
  const { doctor } = useAuth();
  const { t } = useLanguage();
  const isReceptionist = doctor?.role === 'receptionist';

  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'doubts' | 'refills' | 'whatsapp' | 'sms' | 'email' | 'app'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('t-1');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedPatientForAppt, setSelectedPatientForAppt] = useState<any | null>(null);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [customReply, setCustomReply] = useState('');
  const [showDigestModal, setShowDigestModal] = useState(false);

  const [threads, setThreads] = useState<Thread[]>([
    {
      id: 't-1',
      name: 'Rohit',
      subtitle: '28y • P-24621 • WhatsApp • English',
      category: 'patients',
      channel: 'WhatsApp',
      preview: 'Chest feels tight since morning',
      timestamp: '2 min ago',
      unread: true,
      tag: 'Red flag - call now',
      tagColor: 'bg-rose-100 text-rose-800 border-rose-200',
      phone: '+91 98765 43210',
      aiSummary: 'Patient reports acute chest tightness. High priority cardiac/respiratory evaluation advised immediately.',
      messages: [
        { sender: 'patient', text: 'Doctor, my chest feels tight since morning. Is this normal?', time: '9:30 AM' }
      ],
      draftReply: 'Rohit, please call the clinic immediately or visit the nearest emergency room for an ECG evaluation.'
    },
    {
      id: 't-2',
      name: 'Harman',
      subtitle: '25y • P-24618 • WhatsApp • English and Punjabi',
      category: 'patients',
      channel: 'WhatsApp',
      preview: 'Itching more at night, is it normal?',
      timestamp: '40 min ago',
      unread: true,
      tag: 'Doubt - draft ready',
      tagColor: 'bg-amber-100 text-amber-800 border-amber-200',
      phone: '+91 98765 11223',
      aiSummary: 'Less redness, more night itching. Photo shows improvement. No fever or swelling mentioned.',
      messages: [
        { sender: 'patient', text: 'Doctor, the redness is better but the itching is more at night. Is this normal?', time: '9:41 AM', status: 'photo attached' },
        { sender: 'doctor', text: 'Hi Harman. I received this. I will reply with advice shortly.', time: '9:45 AM', status: 'read' }
      ],
      draftReply: 'Mild itching at night can be common while the skin heals. Keep the area moisturised, avoid scratching, and continue the course. Message me if you see swelling, pus, or fever.'
    },
    {
      id: 't-3',
      name: 'Simran',
      subtitle: '31y • P-24619 • SMS • Refill request',
      category: 'patients',
      channel: 'SMS',
      preview: 'Need refill for my tablets',
      timestamp: '3 h ago',
      unread: false,
      tag: 'Refill - safe',
      tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      phone: '+91 91234 56789',
      aiSummary: 'Tablet, 30 days. Seen 3 weeks ago. No interactions. Dose unchanged.',
      messages: [
        { sender: 'patient', text: 'Hello doctor, I need a refill for my tablets for another 30 days.', time: '7:15 AM' }
      ],
      draftReply: 'Hello Simran, your refill request has been approved. You can collect the prescription or order via our partner pharmacy.'
    },
    {
      id: 't-4',
      name: 'Anita',
      subtitle: '42y • P-24622 • App • Reschedule request',
      category: 'patients',
      channel: 'App',
      preview: 'Can we move my visit to Friday?',
      timestamp: '3 h ago',
      unread: false,
      tag: 'Reschedule - 3 slots',
      tagColor: 'bg-teal-100 text-teal-800 border-teal-200',
      phone: '+91 99887 76655',
      aiSummary: 'Wants to move visit. Three slots fit your day (10:00 AM, 2:30 PM, 4:00 PM).',
      messages: [
        { sender: 'patient', text: 'Can we move my visit from tomorrow to Friday? Something urgent came up.', time: '6:50 AM' }
      ],
      draftReply: 'Hi Anita, we have open slots on Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Would any of these work for you?'
    },
    {
      id: 't-5',
      name: 'Meera',
      subtitle: '29y • P-24623 • Email • Follow-up check',
      category: 'patients',
      channel: 'Email',
      preview: 'No reply to follow-up request',
      timestamp: 'Yesterday',
      unread: false,
      tag: 'Needs nudge',
      tagColor: 'bg-slate-100 text-slate-700 border-slate-200',
      phone: '+91 98111 22334',
      aiSummary: 'Cream, 2 tubes. Review overdue by 40 days.',
      messages: [
        { sender: 'patient', text: 'Thank you for the prescription. I am using the cream as directed.', time: 'Yesterday' }
      ],
      draftReply: 'Hi Meera, checking in on your progress after 2 weeks. How is your skin responding to the treatment?'
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
      aiSummary: 'Partner pharmacy requesting stock confirmation for topical steroid cream.',
      messages: [
        { sender: 'patient', text: 'Hello Doctor, confirming prescription for patient Harman (P-24618). Please authorize.', time: '11:15 AM' }
      ],
      draftReply: 'Prescription batch #RX-8842 verified and authorized for dispensing.'
    },
    {
      id: 't-7',
      name: 'Dermacare Corp Collaborators',
      subtitle: 'B2B Research Outreach',
      category: 'collaborations',
      channel: 'Email',
      preview: 'Quarterly clinical trial data sync',
      timestamp: '2 days ago',
      unread: false,
      tag: 'Corporate',
      tagColor: 'bg-purple-100 text-purple-800 border-purple-200',
      phone: '+91 98999 88877',
      aiSummary: 'Corporate inquiry regarding anonymous pigmentation dataset metrics.',
      messages: [
        { sender: 'patient', text: 'Dear Clinic Head, regarding our upcoming research symposium...', time: 'Oct 20' }
      ],
      draftReply: 'Thank you for reaching out. Our research team will review the dataset parameters and respond by Friday.'
    }
  ]);

  const activeThread = threads.find(t => t.id === selectedThreadId) || threads[0];

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    setThreads(prev =>
      prev.map(t => {
        if (t.id === activeThread.id) {
          return {
            ...t,
            messages: [...t.messages, { sender: 'doctor', text, time: 'Just now', status: 'sent' }],
            draftReply: ''
          };
        }
        return t;
      })
    );
    setCustomReply('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0f2926] tracking-tight">
            Messages &amp; Communications Inbox
          </h1>
          <p className="text-xs sm:text-sm text-[#5c7c77] mt-1">
            AI-powered patient communication. You approve before it is sent.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5"
          >
            <MessageSquare className="w-4 h-4 text-teal-700" />
            <span>New broadcast</span>
          </button>
          <button
            type="button"
            onClick={() => alert('All safe AI drafts approved and queued for dispatch.')}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>+ Approve safe drafts</span>
          </button>
        </div>
      </div>

      {/* AI Digest Banner */}
      <div className="bg-[#0f3b37] text-white p-6 rounded-3xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-3 z-10 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/30 text-teal-200 text-[10px] font-bold uppercase tracking-wider">
              While you were with patients • AI Digest
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            3 need you now. 5 are ready to approve. 4 can wait.
          </h2>
          <ul className="text-xs sm:text-sm text-teal-100 space-y-1 font-medium list-disc list-inside">
            <li>Rohit reports chest tightness. Call him first.</li>
            <li>Simran&apos;s refill is safe to approve.</li>
            <li>Anita wants to move her visit. Three slots fit your day.</li>
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
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[750px]">
          {/* Search & Filters */}
          <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patients or messages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            {/* Category / Channel Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'all', label: 'All 12' },
                { id: 'urgent', label: 'Urgent 3' },
                { id: 'doubts', label: 'Doubts 4' },
                { id: 'refills', label: 'Refills 3' },
                { id: 'whatsapp', label: 'WhatsApp 7' },
                { id: 'sms', label: 'SMS 3' },
                { id: 'email', label: 'Email 1' },
                { id: 'app', label: 'App 1' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                    activeTab === tab.id
                      ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thread List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {threads
              .filter(t => {
                if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) && !t.preview.toLowerCase().includes(searchQuery.toLowerCase())) {
                  return false;
                }
                if (activeTab === 'urgent' && !t.tag?.includes('Red flag')) return false;
                if (activeTab === 'doubts' && !t.tag?.includes('Doubt')) return false;
                if (activeTab === 'refills' && !t.tag?.includes('Refill')) return false;
                if (activeTab === 'whatsapp' && t.channel !== 'WhatsApp') return false;
                if (activeTab === 'sms' && t.channel !== 'SMS') return false;
                if (activeTab === 'email' && t.channel !== 'Email') return false;
                if (activeTab === 'app' && t.channel !== 'App') return false;
                return true;
              })
              .map(th => {
                const isSelected = th.id === selectedThreadId;
                return (
                  <div
                    key={th.id}
                    onClick={() => setSelectedThreadId(th.id)}
                    className={`p-4 cursor-pointer transition-colors flex items-start gap-3 relative ${
                      isSelected ? 'bg-teal-50/70 border-l-4 border-teal-700' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-teal-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {th.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 truncate">{th.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{th.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{th.subtitle}</p>
                      <p className="text-xs font-medium text-slate-700 truncate mt-1">{th.preview}</p>
                      {th.tag && (
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold border ${th.tagColor}`}>
                          {th.tag}
                        </span>
                      )}
                    </div>
                    {th.unread && (
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-600 absolute right-4 top-4" />
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Active Thread Chat & Action Panel (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[750px]">
          {/* Thread Top Bar */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-700 text-white font-bold text-sm flex items-center justify-center">
                {activeThread.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{activeThread.name}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">{activeThread.phone}</span>
                </div>
                <p className="text-[11px] text-slate-500">{activeThread.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => alert(`Initiating secure voice call with ${activeThread.name}...`)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5 text-teal-700" />
                <span>Voice call</span>
              </button>
              <button
                type="button"
                onClick={() => alert(`Initiating secure video consultation with ${activeThread.name}...`)}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video call</span>
              </button>
            </div>
          </div>

          {/* Scrollable Chat & AI Draft Workspace */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8faf9]">
            {/* AI Summary Banner */}
            <div className="p-3.5 bg-teal-50/80 border border-teal-200 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <span>AI Thread Summary</span>
              </div>
              <p className="text-teal-800 leading-relaxed">{activeThread.aiSummary}</p>
            </div>

            {/* Chat Bubbles */}
            {activeThread.messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'patient' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-md p-3.5 rounded-2xl text-xs ${
                  m.sender === 'patient'
                    ? 'bg-white text-slate-800 border border-slate-200 shadow-2xs rounded-tl-xs'
                    : 'bg-teal-800 text-white rounded-tr-xs shadow-xs'
                }`}>
                  <p className="leading-relaxed">{m.text}</p>
                  <div className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${m.sender === 'patient' ? 'text-slate-400' : 'text-teal-200'}`}>
                    <span>{m.time}</span>
                    {m.status && <span>• {m.status}</span>}
                  </div>
                </div>
              </div>
            ))}

            {/* AI Draft Response Box */}
            <div className="bg-white border-2 border-teal-600/30 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-bold">
                    AI
                  </span>
                  <span className="text-xs font-bold text-slate-900">AI Draft • Based on his chart and photo</span>
                </div>
                <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                  Not sent yet
                </span>
              </div>

              <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed font-medium">
                {activeThread.draftReply}
              </p>

              {/* Tone / Language Pills */}
              <div className="flex flex-wrap gap-1.5">
                {['Reassuring', 'Simple', 'Detailed', 'English', 'हिंदी', 'ਪੰਜਾਬੀ'].map(pill => (
                  <span key={pill} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                    {pill}
                  </span>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleSendMessage(activeThread.draftReply);
                    alert('AI draft approved and dispatched via ' + activeThread.channel);
                  }}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve and send</span>
                </button>
                <button
                  type="button"
                  onClick={() => alert('Regenerating AI clinical draft...')}
                  className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => alert('Dictation voice mode activated.')}
                  className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Speak your reply
                </button>
                <button
                  type="button"
                  onClick={() => alert('Scheduled for dispatch at 8:00 AM.')}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Send at 8 am
                </button>
              </div>
            </div>

            {/* Quick Attachment & Tool Toolbar */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {['Templates', 'Attach file', 'Payment link', 'Consent form', 'Lab report', 'Dictate'].map(tool => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => alert(`Opening ${tool} tool for ${activeThread.name}...`)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Message Input Box */}
          <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
            <input
              type="text"
              placeholder={`Type a message to ${activeThread.name}...`}
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
            <button
              type="button"
              onClick={() => alert('File attachment dialog opened.')}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              title="Attach File"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => alert('Voice dictation started.')}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              title="Voice Dictation"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage(customReply)}
              className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Feature Grid Sections (Matching Screenshot) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {/* 1. Refill Requests */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Refill Requests • AI Checked</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">3 pending</span>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Simran • tablet, 30 days', desc: 'Seen 3 weeks ago. No interactions. Dose unchanged.', status: 'Safe', color: 'bg-emerald-100 text-emerald-800' },
              { name: 'Meera • cream, 2 tubes', desc: 'Review overdue by 40 days.', status: 'Review', color: 'bg-amber-100 text-amber-800' },
              { name: 'Anil • inhaler', desc: 'Used more this month. Suggest a visit.', status: 'Flag', color: 'bg-rose-100 text-rose-800' },
            ].map((ref, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-900 truncate">{ref.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{ref.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert(`Handling refill for ${ref.name}`)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 ${ref.color}`}
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
            Patients who say &quot;worse&quot; automatically move to the top of your inbox with red flags.
          </p>
        </div>

        {/* 3. Team Inbox & Handover */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Team Inbox &amp; Handover</h3>
          <div className="space-y-3">
            {[
              { role: 'Reception', count: '3 assigned', bg: 'bg-teal-50 text-teal-800' },
              { role: 'Nurse', count: '2 assigned', bg: 'bg-sky-50 text-sky-800' },
              { role: 'You (Doctor)', count: '7 open', bg: 'bg-amber-50 text-amber-800' },
            ].map((team, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{team.role}</span>
                <span className={`px-2.5 py-1 rounded-xl text-xs font-extrabold ${team.bg}`}>{team.count}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            AI writes a handover note at the end of your shift.
          </p>
        </div>
      </div>

      {/* Broadcast Modal */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900">New SMS / WhatsApp Broadcast Campaign</h3>
            <p className="text-xs text-slate-500">Send automated follow-ups, seasonal check-ins, or health tips to your patient panel.</p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Audience Filter</label>
                <select className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white">
                  <option>Follow-up due this week (18 patients)</option>
                  <option>All active patients</option>
                  <option>Post-procedure check-in</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Message Template</label>
                <textarea
                  rows={4}
                  defaultValue="Hi [name], it is time for your check-up. Reply YES and we will book a slot."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBroadcastModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBroadcastModalOpen(false);
                    alert('Broadcast campaign scheduled successfully for 18 patients.');
                  }}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-semibold shadow-xs"
                >
                  Schedule Broadcast
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Digest Modal */}
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
                ✕
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
                    <span>Rohit (P-24621) - WhatsApp</span>
                    <span className="text-rose-700">2 min ago</span>
                  </div>
                  <p className="text-rose-800">Acute chest tightness reported since morning. High priority cardiac/respiratory evaluation advised.</p>
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
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-semibold shadow-xs"
              >
                Got it, Return to Inbox
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
