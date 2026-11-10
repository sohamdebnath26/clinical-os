import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Patient } from '../types';
import { api, subscribeToClinicRealtimeEvents } from '../lib/api';
import { VoiceDictationButton } from './VoiceDictationButton';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import {
  cleanPhoneNumber,
  getWhatsAppWebUrl,
  launchWhatsAppSynchronously
} from '../lib/whatsappUtils';
import { generatePatientAiReportPdf } from '../utils/generatePatientAiReportPdf';
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
  Clock,
  Edit2,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Download
} from 'lucide-react';

type PipelineStage = 'needs_review' | 'draft_ready' | 'resolved';

interface SuggestedResolution {
  id: string;
  label: string;
  intent: string;
  text: string;
}

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
  messages: {
    sender: 'patient' | 'doctor' | 'ai';
    text: string;
    time: string;
    status?: string;
    receiptId?: string;
    whatsappUrl?: string;
    recipientPhone?: string;
    pdfAttachment?: {
      filename: string;
      reportId: string;
      sizeLabel: string;
      generatedAt: string;
      summaryPoints?: string[];
      pdfDataUrl?: string;
    };
  }[];
  draftReply: string;
  suggestedReplies: SuggestedResolution[];
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

  // Clinic Linked Phone Number State (Editable inline badge, persisted in localStorage)
  const [clinicPhone, setClinicPhone] = useState<string>(() => {
    try {
      return localStorage.getItem('clinical_os_clinic_phone') || '+91 98765 00001';
    } catch {
      return '+91 98765 00001';
    }
  });
  const [isEditingClinicPhone, setIsEditingClinicPhone] = useState(false);
  const [clinicPhoneDraft, setClinicPhoneDraft] = useState(clinicPhone);

  // Patient Recipient Phone Inline Edit State (allows diverting to any real phone number)
  const [isEditingPatientPhone, setIsEditingPatientPhone] = useState(false);
  const [patientPhoneDraft, setPatientPhoneDraft] = useState('');

  // Filter, Search & Active Thread State
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'draft_ready' | 'resolved' | 'whatsapp' | 'sms'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('t-1');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const [isGeneratingAiReply, setIsGeneratingAiReply] = useState<boolean>(false);
  const [isPolishingDictation, setIsPolishingDictation] = useState<boolean>(false);
  const [realPatients, setRealPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Voice Dictation Language ('en-US' for English, 'pa-IN' for Punjabi)
  const [dictationLang, setDictationLang] = useState<'en-US' | 'pa-IN'>('en-US');

  // Modals & Drawers
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
  const [showWhatsAppReportModal, setShowWhatsAppReportModal] = useState(false);
  const [selectedPatientForReport, setSelectedPatientForReport] = useState<Patient | null>(null);

  // AI Clinical Analysis PDF Modal State
  const [showAiPdfModal, setShowAiPdfModal] = useState(false);
  const [aiPdfAssessmentDraft, setAiPdfAssessmentDraft] = useState('');
  const [aiPdfPlanDraft, setAiPdfPlanDraft] = useState('');
  const [aiPdfFollowUpDraft, setAiPdfFollowUpDraft] = useState('');
  const [alsoDownloadLocalPdf, setAlsoDownloadLocalPdf] = useState(true);
  const [isSendingAiPdf, setIsSendingAiPdf] = useState(false);

  // Reply & Live Diversion Receipt State
  const [customReply, setCustomReply] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [autoSimulatePatientReply, setAutoSimulatePatientReply] = useState(false);
  const [showIncomingReplyModal, setShowIncomingReplyModal] = useState(false);
  const [incomingTestText, setIncomingTestText] = useState('');
  const [isSimulatingIncoming, setIsSimulatingIncoming] = useState(false);
  const [lastDivertedReceipt, setLastDivertedReceipt] = useState<{
    receiptId: string;
    patientName: string;
    clinicPhone: string;
    recipientPhone: string;
    messageText: string;
    whatsappUrl: string;
    sentAt: string;
  } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const knownMessageCountRef = useRef<Record<string, number>>({});

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

  const handleSaveClinicPhone = () => {
    const trimmed = clinicPhoneDraft.trim();
    if (!trimmed) {
      setClinicPhoneDraft(clinicPhone);
      setIsEditingClinicPhone(false);
      return;
    }
    setClinicPhone(trimmed);
    try {
      localStorage.setItem('clinical_os_clinic_phone', trimmed);
    } catch {
      // ignore storage errors
    }
    setIsEditingClinicPhone(false);
    showToast(`Clinic WhatsApp & SMS line updated to ${trimmed}`);
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
        'Rohit, please stop any newly started medication immediately and visit the nearest emergency room or call our clinic hotline right away for an urgent evaluation of your chest tightness and rash.',
      suggestedReplies: [
        {
          id: 's-1a',
          label: 'Urgent ER & Stop Meds',
          intent: 'Immediate safety escalation',
          text: 'Rohit, please stop any newly started medication immediately and visit the nearest emergency room or call our clinic hotline right away for an urgent evaluation of your chest tightness and rash.'
        },
        {
          id: 's-1b',
          label: 'Immediate Clinic Walk-In',
          intent: 'Priority in-clinic triage',
          text: 'Rohit, chest tightness with a spreading rash needs immediate evaluation. Please come directly to the clinic priority desk now or head to the nearest emergency department.'
        },
        {
          id: 's-1c',
          label: 'Check Anaphylaxis Signs',
          intent: 'Symptom screening & call',
          text: 'Rohit, I am calling you now. If you have any difficulty breathing, lip/tongue swelling, or dizziness, please take your emergency antihistamine and go to the nearest ER immediately.'
        }
      ]
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
        'Mild itching at night is common as the skin barrier repairs. Keep the area well moisturised with your prescribed ceramide cream before sleep, avoid scratching, and continue your bedtime antihistamine.',
      suggestedReplies: [
        {
          id: 's-2a',
          label: 'Reassure & Moisturize',
          intent: 'Barrier healing guidance',
          text: 'Mild itching at night is common as the skin barrier repairs. Keep the area well moisturised with your prescribed ceramide cream before sleep, avoid scratching, and continue your bedtime antihistamine.'
        },
        {
          id: 's-2b',
          label: 'Cold Compress & Dosage Adjustment',
          intent: 'Symptomatic relief',
          text: 'Hi Harman, the reduced redness is a good sign of healing. For night itching, apply a cool damp compress for 5 minutes before applying your chilled moisturizer, and take your prescribed tablet 1 hour before bed.'
        },
        {
          id: 's-2c',
          label: 'Bilingual (English + Punjabi)',
          intent: 'Patient native comfort',
          text: 'Hi Harman, ਰਾਤ ਨੂੰ ਹਲਕੀ ਖਾਰਸ਼ ਚਮੜੀ ਦੇ ਠੀਕ ਹੋਣ ਦਾ ਹਿੱਸਾ ਹੈ। ਸੌਣ ਤੋਂ ਪਹਿਲਾਂ ਆਪਣੀ ਮਾਇਸਚਰਾਈਜ਼ਰ ਕਰੀਮ ਲਗਾਓ ਅਤੇ ਖੁਰਕਣ ਤੋਂ ਬਚੋ। (Mild night itching is normal during healing; apply moisturizer before bed.)'
        }
      ]
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
        'Hello Simran, your 30-day allergy tablet refill has been approved. We have updated your digital prescription—you can collect it at the clinic pharmacy or order directly.',
      suggestedReplies: [
        {
          id: 's-3a',
          label: 'Approve 30-Day Refill',
          intent: 'Full authorization',
          text: 'Hello Simran, your 30-day allergy tablet refill has been approved. We have updated your digital prescription—you can collect it at the clinic pharmacy or order directly.'
        },
        {
          id: 's-3b',
          label: 'Approve + Book 4-Week Review',
          intent: 'Refill with follow-up',
          text: 'Hello Simran, I have authorized your 30-day refill. Since this completes your 2-month course, please book a brief follow-up check next month so we can taper the dose.'
        },
        {
          id: 's-3c',
          label: 'Short 14-Day Bridge Refill',
          intent: 'Require in-person check',
          text: 'Hello Simran, I have approved a 14-day supply to keep your symptoms controlled. Please schedule a quick clinic visit within two weeks so we can review your progress.'
        }
      ]
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
        'Hi Anita, certainly. We have open slots this Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Please reply with your preferred time and we will confirm your appointment.',
      suggestedReplies: [
        {
          id: 's-4a',
          label: 'Offer Friday Slots (10 AM / 2:30 PM / 4 PM)',
          intent: 'Direct slot selection',
          text: 'Hi Anita, certainly. We have open slots this Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Please reply with your preferred time and we will confirm your appointment.'
        },
        {
          id: 's-4b',
          label: 'Confirm Friday 10:00 AM Slot',
          intent: 'Proactive booking',
          text: 'Hi Anita, I have tentatively reserved the Friday 10:00 AM morning slot for your visit. Let us know if you prefer an afternoon time instead.'
        },
        {
          id: 's-4c',
          label: 'Offer Tele-Consult Option',
          intent: 'Remote alternative',
          text: 'Hi Anita, we can move your in-clinic visit to Friday at 2:30 PM, or if it is more convenient, we can do a quick video follow-up tomorrow evening.'
        }
      ]
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
      draftReply:
        'Hi Meera, glad to hear that. Remember to apply SPF 50+ sunscreen every morning while using the night cream, and message us if you notice any dryness.',
      suggestedReplies: [
        {
          id: 's-5a',
          label: 'Sunscreen & Hydration Reminder',
          intent: 'Adherence support',
          text: 'Hi Meera, glad to hear that. Remember to apply SPF 50+ sunscreen every morning while using the night cream, and message us if you notice any dryness.'
        },
        {
          id: 's-5b',
          label: '1-Week Photo Check-In Request',
          intent: 'Visual progress tracking',
          text: 'Hi Meera, great! Please share a clear daylight photo of the treated area after 7 days so we can assess your pigmentation improvement.'
        },
        {
          id: 's-5c',
          label: 'Confirm 7-Day Review Slot',
          intent: 'Routine follow-up',
          text: 'Hi Meera, glad your skin is tolerating the cream well. We will check in with you next week for your 7-day progress review.'
        }
      ]
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
      draftReply: 'Prescription batch #RX-8842 for Harman Preet (P-24618) is verified and authorized for dispensing as written.',
      suggestedReplies: [
        {
          id: 's-6a',
          label: 'Authorize Dispensing (#RX-8842)',
          intent: 'Approve as written',
          text: 'Prescription batch #RX-8842 for Harman Preet (P-24618) is verified and authorized for dispensing as written.'
        },
        {
          id: 's-6b',
          label: 'Approve Brand Substitution',
          intent: 'Allow generic equivalent',
          text: 'Batch #RX-8842 is authorized. If the primary topical brand is out of stock, you may dispense the equivalent strength ceramide formulation.'
        },
        {
          id: 's-6c',
          label: 'Request Patient Call Before Dispense',
          intent: 'Dosage verification',
          text: 'Please hold batch #RX-8842 briefly and have the pharmacist call our clinic desk at ' + clinicPhone + ' to confirm the strength.'
        }
      ]
    }
  ]);

  // Load registered patients, native Clinical OS Inbox threads & background polling for incoming patient replies
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

    // Initial load of server-backed native Clinical OS Inbox threads
    api.whatsapp
      .threads()
      .then(res => {
        if (res.threads && res.threads.length > 0) {
          const counts: Record<string, number> = {};
          res.threads.forEach((th: Thread) => {
            counts[th.id] = th.messages?.length || 0;
          });
          knownMessageCountRef.current = counts;
          setThreads(res.threads);
        }
      })
      .catch(() => {});

    api.whatsapp
      .list()
      .then(res => {
        if (res.messages && res.messages.length > 0) {
          const latest = res.messages[0];
          setLastDivertedReceipt({
            receiptId: latest.id,
            patientName: latest.patientName,
            clinicPhone: latest.clinicPhone,
            recipientPhone: `+${latest.recipientMobile}`,
            messageText: latest.messageText,
            whatsappUrl: latest.whatsappUrl,
            sentAt: latest.sentAt
          });
        }
      })
      .catch(() => {});

    // Real-time Server-Sent Events (SSE) subscription for instant (<50ms) inbox messages & status receipts
    const unsubscribeSse = subscribeToClinicRealtimeEvents((evt) => {
      if (
        (evt.type === 'inbox:message_received' ||
          evt.type === 'inbox:message_sent' ||
          evt.type === 'inbox:status_updated') &&
        evt.thread
      ) {
        const updatedThread = evt.thread as Thread;
        setThreads((prev) => {
          const exists = prev.some((t) => t.id === updatedThread.id);
          const next = exists
            ? prev.map((t) => (t.id === updatedThread.id ? updatedThread : t))
            : [updatedThread, ...prev];
          return next;
        });
        knownMessageCountRef.current[updatedThread.id] = updatedThread.messages?.length || 0;

        if (evt.type === 'inbox:message_received') {
          showToast(
            `Incoming patient reply from ${updatedThread.name} routed into Clinical OS Inbox.`
          );
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }
          }, 80);
        }
      }
    });

    // Resilient background sync every 12s as fallback if proxy drops SSE
    const pollInterval = setInterval(() => {
      api.whatsapp
        .threads()
        .then(res => {
          if (!res.threads || res.threads.length === 0) return;

          let newlyArrivedPatientName: string | null = null;
          const prevCounts = { ...knownMessageCountRef.current };
          const nextCounts: Record<string, number> = {};

          res.threads.forEach((th: Thread) => {
            const len = th.messages?.length || 0;
            nextCounts[th.id] = len;
            const prevLen = prevCounts[th.id] ?? len;
            if (len > prevLen) {
              const lastMsg = th.messages[len - 1];
              if (lastMsg && lastMsg.sender === 'patient') {
                newlyArrivedPatientName = th.name;
              }
            }
          });

          knownMessageCountRef.current = nextCounts;
          setThreads(res.threads);

          if (newlyArrivedPatientName) {
            showToast(
              `Incoming patient reply from ${newlyArrivedPatientName} routed into Clinical OS Inbox.`
            );
            setTimeout(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTo({
                  top: messagesContainerRef.current.scrollHeight,
                  behavior: 'smooth'
                });
              }
            }, 100);
          }
        })
        .catch(() => {});
    }, 12000);

    return () => {
      unsubscribeSse();
      clearInterval(pollInterval);
    };
  }, []);

  const activeThread = threads.find(t => t.id === selectedThreadId) || threads[0];

  // Reset selected suggestion index & inline phone edit when switching threads
  useEffect(() => {
    setSelectedSuggestionIndex(0);
    setIsEditingPatientPhone(false);
    setPatientPhoneDraft(activeThread?.phone || '');
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
  }, [selectedThreadId]);

  const handleSavePatientPhone = () => {
    const rawDigits = patientPhoneDraft.replace(/\D/g, '');
    if (rawDigits.length < 10) {
      showToast('Please enter a valid 10-digit patient mobile number.');
      return;
    }
    const formattedPhone =
      rawDigits.length === 10
        ? `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`
        : `+${rawDigits}`;

    setThreads(prev =>
      prev.map(t => (t.id === activeThread.id ? { ...t, phone: formattedPhone } : t))
    );

    if (activeThread.patientId) {
      api.patients
        .update(activeThread.patientId, { mobile: rawDigits.slice(-10) })
        .catch(() => {});
    }

    setIsEditingPatientPhone(false);
    showToast(`Patient number for ${activeThread.name} updated to ${formattedPhone}`);
  };

  // Keyboard shortcuts (1 / 2 / 3 to quickly select AI resolution strategy when not typing in an input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const idx = parseInt(e.key, 10) - 1;
        if (activeThread?.suggestedReplies && activeThread.suggestedReplies[idx]) {
          setSelectedSuggestionIndex(idx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeThread]);

  // Pipeline counts
  const urgentCount = threads.filter(t => t.priority === 'urgent' && t.stage !== 'resolved').length;
  const draftReadyCount = threads.filter(t => t.stage === 'draft_ready').length;
  const needsReviewCount = threads.filter(t => t.stage === 'needs_review').length;
  const resolvedCount = threads.filter(t => t.stage === 'resolved').length;

  // Generate fresh AI suggested reply for the active patient's issue using backend Gemini AI
  const handleGenerateCustomAiSuggestion = async (clinicalAngle?: string) => {
    if (!activeThread || isGeneratingAiReply) return;
    setIsGeneratingAiReply(true);

    const lastPatientMsg =
      [...activeThread.messages].reverse().find(m => m.sender === 'patient')?.text ||
      activeThread.preview;

    const prompt = `Act as Dr. ${doctor?.name || 'Sarah Chen'} (Dermatologist, Clinic Phone: ${clinicPhone}). Draft a direct, compassionate, and clinically sound WhatsApp/SMS reply (2-3 sentences max, plain text, no markdown headers) to resolve this patient's issue:
Patient Name: ${activeThread.name} (${activeThread.subtitle})
Clinical Context: ${activeThread.aiSummary}
Patient's Latest Message: "${lastPatientMsg}"
${clinicalAngle ? `Resolution Focus: ${clinicalAngle}` : 'Resolution Focus: Provide clear medical guidance and next steps.'}`;

    try {
      const res = await api.ai.chat({
        question: prompt,
        patientId: activeThread.patientId,
        contextType: 'followup'
      });

      const cleanedReply = res.answer
        .replace(/^["']|["']$/g, '')
        .replace(/\*\*/g, '')
        .trim();

      const newSuggestion: SuggestedResolution = {
        id: `ai-gen-${Date.now()}`,
        label: clinicalAngle ? clinicalAngle.split(' ').slice(0, 4).join(' ') : 'AI Tailored Resolution',
        intent: 'Live AI clinical synthesis',
        text: cleanedReply
      };

      setThreads(prev =>
        prev.map(t => {
          if (t.id === activeThread.id) {
            const updatedSuggestions = [newSuggestion, ...(t.suggestedReplies || [])].slice(0, 3);
            return {
              ...t,
              draftReply: cleanedReply,
              suggestedReplies: updatedSuggestions
            };
          }
          return t;
        })
      );
      setSelectedSuggestionIndex(0);
      showToast('Generated new AI clinical reply for ' + activeThread.name);
    } catch {
      const fallbackText =
        clinicalAngle?.toLowerCase().includes('punjabi')
          ? `Hi ${activeThread.name}, ਤੁਹਾਡੇ ਸੁਨੇਹੇ ਦੀ ਜਾਂਚ ਕੀਤੀ ਗਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਦੱਸੀ ਹੋਈ ਦਵਾਈ ਜਾਰੀ ਰੱਖੋ ਅਤੇ ਲੋੜ ਪੈਣ 'ਤੇ ਕਲੀਨਿਕ ਵਿਖੇ ਸੰਪਰਕ ਕਰੋ। (We reviewed your message; please continue your prescribed regimen.)`
          : `Hi ${activeThread.name}, I have reviewed your message regarding "${lastPatientMsg.slice(
              0,
              40
            )}...". Please continue your prescribed regimen and let us know if symptoms change so we can prioritize a clinic review.`;
      const fallbackSuggestion: SuggestedResolution = {
        id: `ai-fallback-${Date.now()}`,
        label: clinicalAngle ? clinicalAngle.split(' ').slice(0, 3).join(' ') : 'Updated Clinical Reply',
        intent: 'Clinical guidance',
        text: fallbackText
      };
      setThreads(prev =>
        prev.map(t =>
          t.id === activeThread.id
            ? {
                ...t,
                draftReply: fallbackText,
                suggestedReplies: [fallbackSuggestion, ...(t.suggestedReplies || [])].slice(0, 3)
              }
            : t
        )
      );
      setSelectedSuggestionIndex(0);
      showToast('Updated clinical reply suggestion.');
    } finally {
      setIsGeneratingAiReply(false);
    }
  };

  // Polish dictated or rough text in the composer using AI (supports English & Punjabi)
  const handlePolishDictatedReply = async () => {
    if (!customReply.trim() || !activeThread || isPolishingDictation) return;
    setIsPolishingDictation(true);

    const isPunjabiMode = dictationLang === 'pa-IN';
    const prompt = `Act as Dr. ${doctor?.name || 'Sarah Chen'} (Dermatologist). The doctor dictated or typed this rough note for patient ${activeThread.name}:
"${customReply.trim()}"
Clinical Context: ${activeThread.aiSummary}
Rewrite this into a polite, clear, ready-to-send 2-sentence WhatsApp message to the patient${
      isPunjabiMode
        ? ' in bilingual Punjabi (Gurmukhi) + English so the patient understands clearly.'
        : ' in clear professional English.'
    } Output ONLY the message text with no quotes or markdown.`;

    try {
      const res = await api.ai.chat({
        question: prompt,
        patientId: activeThread.patientId,
        contextType: 'followup'
      });
      const polished = res.answer
        .replace(/^["']|["']$/g, '')
        .replace(/\*\*/g, '')
        .trim();
      if (polished) {
        setCustomReply(polished);
        showToast(isPunjabiMode ? 'Polished reply in Punjabi & English' : 'Polished dictated reply with AI');
      }
    } catch {
      const capitalized =
        customReply.trim().charAt(0).toUpperCase() + customReply.trim().slice(1);
      setCustomReply(
        `Hi ${activeThread.name}, ${capitalized}${/[.!?]$/.test(capitalized) ? '' : '.'} — Dr. ${
          doctor?.name || 'Sarah Chen'
        }`
      );
      showToast('Formatted reply for ' + activeThread.name);
    } finally {
      setIsPolishingDictation(false);
    }
  };

  // Dispatch a message in the background via Clinic Gateway & update the native Clinical OS conversation thread without leaving the app
  const handleSendMessage = async (textToSend: string, openUnfocusedBackgroundTab = false) => {
    if (!textToSend.trim() || !activeThread) return;
    setIsDispatching(true);

    const messageText = textToSend.trim();
    const cleanPhone = cleanPhoneNumber(activeThread.phone) || '919876543210';
    const whatsappUrl = getWhatsAppWebUrl(cleanPhone, messageText);

    // Never open a foreground WhatsApp tab that steals focus from Clinical OS.
    if (openUnfocusedBackgroundTab) {
      launchWhatsAppSynchronously(cleanPhone, messageText, 'unfocused');
    }

    let receiptId = `wa-${Date.now().toString(36)}`;
    try {
      const res = await api.whatsapp.send({
        threadId: activeThread.id,
        patientId: activeThread.patientId || activeThread.id,
        patientName: activeThread.name,
        recipientMobile: cleanPhone,
        clinicPhone,
        reportType: 'chat_message',
        messageText,
        note: `[From Clinic ${clinicPhone}] ${messageText.slice(0, 100)}`,
        autoSimulateReply: autoSimulatePatientReply
      });
      if (res?.dispatch?.id) {
        receiptId = res.dispatch.id;
      }
      if (res?.threads && Array.isArray(res.threads)) {
        const counts: Record<string, number> = {};
        res.threads.forEach((th: Thread) => {
          counts[th.id] = th.messages?.length || 0;
        });
        knownMessageCountRef.current = counts;
        setThreads(res.threads);
      }
    } catch {
      // Fallback local state update if offline
      setThreads(prev =>
        prev.map(t => {
          if (t.id === activeThread.id) {
            return {
              ...t,
              stage: 'resolved',
              statusLabel: 'Resolved · Dispatched in background',
              messages: [
                ...t.messages,
                {
                  sender: 'doctor',
                  text: messageText,
                  time: 'Just now',
                  status: `Delivered in background (${clinicPhone} → ${activeThread.phone})`,
                  receiptId,
                  whatsappUrl,
                  recipientPhone: activeThread.phone
                }
              ],
              preview: `You: ${messageText}`,
              timestamp: 'Just now',
              unread: false
            };
          }
          return t;
        })
      );
    }

    setLastDivertedReceipt({
      receiptId,
      patientName: activeThread.name,
      clinicPhone,
      recipientPhone: activeThread.phone,
      messageText,
      whatsappUrl,
      sentAt: new Date().toISOString()
    });

    setCustomReply('');
    setIsDispatching(false);
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 80);
    showToast(
      `Dispatched in background to ${activeThread.name} (${activeThread.phone}) · Receipt #${receiptId}`
    );
  };

  // Route an incoming patient WhatsApp/SMS reply directly into the native Clinical OS Inbox UI
  const handleReceiveIncomingPatientReply = async (incomingText?: string) => {
    const textToRoute =
      (incomingText ?? incomingTestText).trim() ||
      `Hello Dr. ${doctor?.name || 'Sarah Chen'}, thank you for the update. My skin is feeling calmer now—should I continue the same ointment tonight?`;

    if (!activeThread || isSimulatingIncoming) return;
    setIsSimulatingIncoming(true);

    try {
      const res = await api.whatsapp.receiveIncoming({
        threadId: activeThread.id,
        patientId: activeThread.patientId,
        patientName: activeThread.name,
        senderPhone: activeThread.phone,
        messageText: textToRoute,
        channel: activeThread.channel === 'SMS' ? 'SMS' : 'WhatsApp'
      });

      if (res?.threads && Array.isArray(res.threads)) {
        const counts: Record<string, number> = {};
        res.threads.forEach((th: Thread) => {
          counts[th.id] = th.messages?.length || 0;
        });
        knownMessageCountRef.current = counts;
        setThreads(res.threads);
      }
      setSelectedSuggestionIndex(0);
      setIncomingTestText('');
      setShowIncomingReplyModal(false);
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 80);
      showToast(`Incoming reply from ${activeThread.name} routed into Clinical OS Inbox.`);
    } catch {
      showToast('Failed to route incoming message.');
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  // Batch approve all safe drafts in pipeline via background API dispatch (no foreground tabs)
  const handleBatchApproveDrafts = () => {
    const readyThreads = threads.filter(t => t.stage === 'draft_ready' && t.draftReply);
    if (readyThreads.length === 0) {
      showToast('All queued drafts have already been approved and sent.');
      return;
    }

    const targetThread =
      readyThreads.find(t => t.id === activeThread.id) || readyThreads[0];
    if (targetThread) {
      const cleanPhone = cleanPhoneNumber(targetThread.phone) || '919876543210';
      const url = getWhatsAppWebUrl(cleanPhone, targetThread.draftReply);
      setLastDivertedReceipt({
        receiptId: `wa-batch-${Date.now().toString(36)}`,
        patientName: targetThread.name,
        clinicPhone,
        recipientPhone: targetThread.phone,
        messageText: targetThread.draftReply,
        whatsappUrl: url,
        sentAt: new Date().toISOString()
      });
    }

    for (const rt of readyThreads) {
      const cleanPhone = cleanPhoneNumber(rt.phone) || '919876543210';
      api.whatsapp
        .send({
          threadId: rt.id,
          patientId: rt.patientId || rt.id,
          patientName: rt.name,
          recipientMobile: cleanPhone,
          clinicPhone,
          reportType: 'batch_draft_reply',
          messageText: rt.draftReply
        })
        .catch(() => {});
    }

    setThreads(prev =>
      prev.map(t => {
        if (t.stage === 'draft_ready' && t.draftReply) {
          const cleanPhone = cleanPhoneNumber(t.phone) || '919876543210';
          return {
            ...t,
            stage: 'resolved',
            statusLabel: 'Resolved · Batch dispatched in background',
            messages: [
              ...t.messages,
              {
                sender: 'doctor',
                text: t.draftReply,
                time: 'Just now',
                status: `Delivered in background (${clinicPhone} → ${t.phone})`,
                whatsappUrl: getWhatsAppWebUrl(cleanPhone, t.draftReply),
                recipientPhone: t.phone
              }
            ],
            preview: `You: ${t.draftReply}`,
            timestamp: 'Just now',
            unread: false
          };
        }
        return t;
      })
    );
    showToast(`Approved & dispatched ${readyThreads.length} drafts in background.`);
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
    const patientDigits = (patient.mobile || '').replace(/\D/g, '').slice(-10);
    const existingThread = threads.find(
      t =>
        t.patientId === patient.id ||
        (patientDigits.length === 10 && t.phone.replace(/\D/g, '').endsWith(patientDigits))
    );

    if (existingThread) {
      setSelectedThreadId(existingThread.id);
      setShowNewMessageModal(false);
      showToast(`Opened conversation with ${patient.fullName}`);
      return;
    }

    const cleanNumber =
      patientDigits.length === 10
        ? `+91 ${patientDigits.slice(0, 5)} ${patientDigits.slice(5)}`
        : '+91 98765 43210';
    const defaultDraft = `Hello ${patient.fullName}, this is Dr. ${
      doctor?.name || 'Sarah Chen'
    } following up regarding your dermatology visit. How is your skin responding to treatment?`;

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
          text: `Linked clinic line (${clinicPhone}) to ${patient.fullName}'s EHR record (${patient.patientCode}).`,
          time: 'Just now'
        }
      ],
      draftReply: defaultDraft,
      suggestedReplies: [
        {
          id: `s-${patient.id}-1`,
          label: 'Treatment Progress Check-In',
          intent: 'Routine follow-up',
          text: defaultDraft
        },
        {
          id: `s-${patient.id}-2`,
          label: 'Request Daylight Lesion Photo',
          intent: 'Visual assessment',
          text: `Hello ${patient.fullName}, please reply with a clear daylight photo of the treated skin area so Dr. ${
            doctor?.name || 'Sarah Chen'
          } can review your healing progress.`
        },
        {
          id: `s-${patient.id}-3`,
          label: 'Bilingual Follow-Up (EN + Punjabi)',
          intent: 'Patient native comfort',
          text: `Hello ${patient.fullName}, ਤੁਹਾਡੀ ਚਮੜੀ ਦੇ ਇਲਾਜ ਦਾ ਕੀ ਹਾਲ ਹੈ? ਜੇ ਕੋਈ ਸਵਾਲ ਹੋਵੇ ਤਾਂ ਦੱਸੋ। (Checking in on your skin treatment progress—let us know how you are feeling.)`
        }
      ]
    };

    setThreads(prev => [newThread, ...prev]);
    setSelectedThreadId(newThread.id);
    setShowNewMessageModal(false);
    showToast(`Started conversation with ${patient.fullName}`);
  };

  // Open full WhatsApp report modal for the active patient
  const handleOpenWhatsAppShareModal = () => {
    const activePhoneDigits = activeThread.phone.replace(/\D/g, '').slice(-10) || '9876543210';
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
        mobile: activePhoneDigits,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      targetPatient = {
        ...targetPatient,
        mobile: activePhoneDigits
      };
    }
    setSelectedPatientForReport(targetPatient || null);
    setShowWhatsAppReportModal(true);
  };

  // Open AI Clinical Analysis PDF Modal pre-populated with the active patient's AI summary & recommended clinical plan
  const handleOpenAiPdfModal = () => {
    if (!activeThread) return;
    const currentSug =
      (activeThread.suggestedReplies || [])[selectedSuggestionIndex] ||
      (activeThread.suggestedReplies || [])[0] ||
      null;
    const planText = currentSug ? currentSug.text : activeThread.draftReply;

    setAiPdfAssessmentDraft(
      activeThread.aiSummary ||
        `Clinical triage assessment for ${activeThread.name}. Patient reported symptoms reviewed against dermatology chart.`
    );
    setAiPdfPlanDraft(
      planText ||
        `Continue prescribed topical therapy and share a daylight progress photo with our clinic desk.`
    );
    setAiPdfFollowUpDraft(
      activeThread.priority === 'urgent'
        ? `Immediate priority dermatology evaluation advised. Contact clinic helpline (${clinicPhone}) or visit the nearest emergency center if red-flag symptoms progress.`
        : `Follow prescribed skin care regimen for 7–14 days. Reply directly in this WhatsApp thread (${clinicPhone}) with any questions or updated photos.`
    );
    setShowAiPdfModal(true);
  };

  // Build the PDF payload for the active thread
  const buildCurrentPatientAiPdf = () => {
    const lastPatientMsg =
      [...activeThread.messages].reverse().find(m => m.sender === 'patient')?.text ||
      activeThread.preview;

    return generatePatientAiReportPdf({
      patientName: activeThread.name,
      patientSubtitle: activeThread.subtitle,
      patientPhone: activeThread.phone,
      clinicPhone,
      doctorName: doctor?.name || 'Sarah Chen',
      doctorQualification: 'MD, Dermatology',
      priority: activeThread.priority,
      aiSummary: aiPdfAssessmentDraft.trim() || activeThread.aiSummary,
      latestPatientMessage: lastPatientMsg,
      recommendedPlan: aiPdfPlanDraft.trim() || activeReplyText,
      followUpAdvice: aiPdfFollowUpDraft.trim() || undefined
    });
  };

  // Preview / Download the AI Analysis Report PDF locally
  const handleDownloadOrPreviewAiReportPdf = () => {
    if (!activeThread) return;
    const generated = buildCurrentPatientAiPdf();
    generated.triggerDownload();
    showToast(`Downloaded ${generated.filename} (${generated.sizeLabel})`);
  };

  // Generate & Dispatch the AI Analysis Report PDF over WhatsApp in-app (and optionally download locally)
  const handleSendAiReportPdf = async () => {
    if (!activeThread || isSendingAiPdf) return;
    setIsSendingAiPdf(true);

    try {
      const generated = buildCurrentPatientAiPdf();
      if (alsoDownloadLocalPdf) {
        generated.triggerDownload();
      }

      const cleanPhone = cleanPhoneNumber(activeThread.phone) || '919876543210';
      const whatsappUrl = getWhatsAppWebUrl(cleanPhone, generated.whatsappCompanionText);
      const pdfAttachmentPayload = {
        filename: generated.filename,
        reportId: generated.reportId,
        sizeLabel: generated.sizeLabel,
        generatedAt: generated.generatedAt,
        summaryPoints: generated.summaryPoints,
        pdfDataUrl: generated.pdfDataUrl
      };

      let receiptId = `wa-pdf-${Date.now().toString(36)}`;
      try {
        const res = await api.whatsapp.send({
          threadId: activeThread.id,
          patientId: activeThread.patientId || activeThread.id,
          patientName: activeThread.name,
          recipientMobile: cleanPhone,
          clinicPhone,
          reportType: 'ai_analysis_pdf',
          messageText: generated.whatsappCompanionText,
          note: `[AI Analysis PDF: ${generated.filename}] Ref #${generated.reportId}`,
          autoSimulateReply: autoSimulatePatientReply,
          pdfAttachment: pdfAttachmentPayload
        });

        if (res?.dispatch?.id) {
          receiptId = res.dispatch.id;
        }
        if (res?.threads && Array.isArray(res.threads)) {
          const counts: Record<string, number> = {};
          res.threads.forEach((th: Thread) => {
            counts[th.id] = th.messages?.length || 0;
          });
          knownMessageCountRef.current = counts;
          setThreads(res.threads);
        }
      } catch {
        setThreads(prev =>
          prev.map(t => {
            if (t.id === activeThread.id) {
              return {
                ...t,
                stage: 'resolved',
                statusLabel: 'Resolved · AI Report PDF Sent',
                messages: [
                  ...t.messages,
                  {
                    sender: 'doctor',
                    text: generated.whatsappCompanionText,
                    time: 'Just now',
                    status: `PDF Report Dispatched (${clinicPhone} → ${activeThread.phone})`,
                    receiptId,
                    whatsappUrl,
                    recipientPhone: activeThread.phone,
                    pdfAttachment: pdfAttachmentPayload
                  }
                ],
                preview: `📄 PDF Sent: ${generated.filename}`,
                timestamp: 'Just now',
                unread: false
              };
            }
            return t;
          })
        );
      }

      setLastDivertedReceipt({
        receiptId,
        patientName: activeThread.name,
        clinicPhone,
        recipientPhone: activeThread.phone,
        messageText: `[PDF: ${generated.filename}] ${generated.whatsappCompanionText}`,
        whatsappUrl,
        sentAt: new Date().toISOString()
      });

      setShowAiPdfModal(false);
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 90);
      showToast(
        `AI Analysis Report PDF (${generated.filename}) sent on WhatsApp to ${activeThread.name}!`
      );
    } finally {
      setIsSendingAiPdf(false);
    }
  };

  // Download a PDF attachment directly from a chat message bubble
  const handleDownloadMessagePdfAttachment = (
    att: NonNullable<Thread['messages'][number]['pdfAttachment']>,
    messageText: string
  ) => {
    if (att.pdfDataUrl && att.pdfDataUrl.startsWith('data:application/pdf')) {
      const link = document.createElement('a');
      link.href = att.pdfDataUrl;
      link.download = att.filename || 'AI_Clinical_Analysis_Report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Downloaded ${att.filename}`);
      return;
    }

    // Regenerate on the fly if dataUrl was omitted
    const regenerated = generatePatientAiReportPdf({
      patientName: activeThread.name,
      patientSubtitle: activeThread.subtitle,
      patientPhone: activeThread.phone,
      clinicPhone,
      doctorName: doctor?.name || 'Sarah Chen',
      doctorQualification: 'MD, Dermatology',
      priority: activeThread.priority,
      aiSummary: activeThread.aiSummary,
      recommendedPlan: messageText
    });
    regenerated.triggerDownload();
    showToast(`Downloaded ${att.filename}`);
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

  const activeSuggestions = activeThread.suggestedReplies || [];
  const currentSuggestion =
    activeSuggestions[selectedSuggestionIndex] || activeSuggestions[0] || null;
  const activeReplyText = currentSuggestion ? currentSuggestion.text : activeThread.draftReply;

  return (
    <div className="space-y-4 animate-in fade-in duration-150 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#0d3f3b] text-white px-4 py-3 rounded-xl shadow-lg border border-teal-500/30 flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Header with Editable Clinic Phone Badge & Primary Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Patient Inbox &amp; AI Triage
            </h1>

            {/* Simple Clinic Phone Badge with Manual Number Edit */}
            <div className="inline-flex items-center gap-2 bg-emerald-50/90 border border-emerald-200 px-3 py-1 rounded-lg">
              <span className="text-[11px] font-semibold text-emerald-900">
                Clinic WhatsApp/SMS Line:
              </span>
              {isEditingClinicPhone ? (
                <div className="inline-flex items-center gap-1.5">
                  <input
                    type="text"
                    value={clinicPhoneDraft}
                    onChange={e => setClinicPhoneDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveClinicPhone();
                      if (e.key === 'Escape') {
                        setClinicPhoneDraft(clinicPhone);
                        setIsEditingClinicPhone(false);
                      }
                    }}
                    autoFocus
                    className="text-xs font-mono font-bold text-slate-900 bg-white border border-emerald-400 rounded px-2 py-0.5 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="+91 98765 00001"
                  />
                  <button
                    type="button"
                    onClick={handleSaveClinicPhone}
                    className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold rounded cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClinicPhoneDraft(clinicPhone);
                      setIsEditingClinicPhone(false);
                    }}
                    className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-emerald-950 tabular-nums">
                    {clinicPhone}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setClinicPhoneDraft(clinicPhone);
                      setIsEditingClinicPhone(true);
                    }}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 hover:text-emerald-950 underline decoration-emerald-400/70 underline-offset-2 ml-1 cursor-pointer"
                    title="Edit clinic WhatsApp/SMS phone number"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>Edit</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            All outgoing messages dispatch in the background and all incoming patient WhatsApp/SMS replies route directly into this native Clinical OS Inbox—you never leave the app.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowIncomingReplyModal(true)}
            className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl text-xs font-semibold text-teal-900 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Test routing an incoming patient WhatsApp/SMS reply directly into the native Clinical OS Inbox"
          >
            <RefreshCw className="w-3.5 h-3.5 text-teal-700" />
            <span>Simulate Patient Reply</span>
          </button>
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
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
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
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {urgentCount}
            </span>
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
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
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
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {draftReadyCount}
            </span>
            <span className="text-xs text-slate-500">awaiting 1-click send</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
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
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {needsReviewCount + draftReadyCount}
            </span>
            <span className="text-xs text-slate-500">active conversations</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('resolved')}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
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
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {resolvedCount}
            </span>
            <span className="text-xs text-slate-500">completed today</span>
          </div>
        </button>
      </div>

      {/* Main Split-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Clean Queue List (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[760px]">
          {/* Search & Segmented Filter Controls */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by patient name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
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
              <div className="p-8 text-center space-y-2.5">
                <p className="text-xs font-semibold text-slate-700">No conversations in this filter</p>
                <p className="text-[11px] text-slate-400">
                  Switch filters above or start a new message with a registered patient.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Show All Conversations
                </button>
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
                        ? 'bg-teal-50/70'
                        : 'hover:bg-slate-50'
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
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums shrink-0">
                          {th.timestamp}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 truncate">
                        <span className="font-mono text-[10.5px] text-slate-500">{th.phone}</span>
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

        {/* RIGHT COLUMN: Focused Conversation & AI Resolution Workspace (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[760px]">
          {/* Active Patient Top Bar + Editable Clinic ↔ Patient Phone Diversion Bar */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap bg-white">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900 truncate">{activeThread.name}</h2>
                <span className="text-xs text-slate-300" aria-hidden="true">
                  |
                </span>
                {/* Explicit Clinic Number ↔ Patient Number Routing Relationship with Inline Edit */}
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200/80">
                  <span className="text-teal-800 font-semibold">Clinic {clinicPhone}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  {isEditingPatientPhone ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="tel"
                        value={patientPhoneDraft}
                        onChange={e => setPatientPhoneDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSavePatientPhone();
                          if (e.key === 'Escape') {
                            setPatientPhoneDraft(activeThread.phone);
                            setIsEditingPatientPhone(false);
                          }
                        }}
                        autoFocus
                        placeholder="+91 98765 43210"
                        className="text-[11px] font-mono font-bold text-slate-900 bg-white border border-teal-500 rounded px-1.5 py-0.5 w-36 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSavePatientPhone}
                        className="px-1.5 py-0.5 bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-sans font-bold rounded cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientPhoneDraft(activeThread.phone);
                          setIsEditingPatientPhone(false);
                        }}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">Patient {activeThread.phone}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientPhoneDraft(activeThread.phone);
                          setIsEditingPatientPhone(true);
                        }}
                        className="text-[10px] font-sans font-semibold text-teal-700 hover:text-teal-950 underline cursor-pointer"
                        title="Edit patient recipient mobile number"
                      >
                        Edit
                      </button>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span>{activeThread.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span>Channel: {activeThread.channel}</span>
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
                onClick={handleOpenAiPdfModal}
                className="px-3 py-1.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Generate AI Clinical Analysis Report as PDF and send to patient on WhatsApp"
              >
                <FileText className="w-3.5 h-3.5 text-teal-200" />
                <span>Send AI Report PDF</span>
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsAppShareModal}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Format & send full Rx or clinical summary on WhatsApp"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Send Rx / Report</span>
              </button>
            </div>
          </div>

          {/* Clinical Context Strip */}
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-700 shrink-0">Clinical Context:</span>
              <span className="text-slate-600 truncate">{activeThread.aiSummary}</span>
            </div>
            <span className="text-[11px] font-medium text-slate-400 shrink-0">
              Stage:{' '}
              <strong className="text-slate-700">
                {activeThread.stage === 'needs_review'
                  ? 'Needs Doctor'
                  : activeThread.stage === 'draft_ready'
                  ? 'Draft Ready'
                  : 'Resolved'}
              </strong>
            </span>
          </div>

          {/* Live Background Dispatch Receipt Strip */}
          {lastDivertedReceipt && (
            <div className="px-5 py-2 bg-emerald-50/90 border-b border-emerald-200 flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[11px] text-emerald-950 truncate">
                  <strong>Dispatched in background to {lastDivertedReceipt.patientName}</strong> ({lastDivertedReceipt.clinicPhone} →{' '}
                  <span className="font-mono font-bold">{lastDivertedReceipt.recipientPhone}</span>) · Receipt{' '}
                  <span className="font-mono">#{lastDivertedReceipt.receiptId}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10.5px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded">
                  In-App Native Delivery Active
                </span>
                <button
                  type="button"
                  onClick={() => setLastDivertedReceipt(null)}
                  className="text-emerald-700 hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Dismiss receipt banner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Conversation History + AI Suggested Replies Panel */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#f9fbfa]"
          >
            {/* Chat Message Bubbles */}
            <div className="space-y-3">
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
                      className={`max-w-lg px-4 py-2.5 rounded-2xl text-xs ${
                        m.sender === 'patient'
                          ? 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                          : 'bg-[#0d3f3b] text-white rounded-tr-xs'
                      }`}
                    >
                      {/* WhatsApp PDF Document Attachment Card */}
                      {m.pdfAttachment && (
                        <div className="mb-2.5 p-3 rounded-xl bg-white/12 border border-teal-300/30 text-white space-y-2">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex flex-col items-center justify-center shrink-0 shadow-2xs border border-rose-400/40">
                                <FileText className="w-4 h-4" />
                                <span className="text-[8px] font-extrabold tracking-tighter uppercase leading-none mt-0.5">
                                  PDF
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-white truncate">
                                  {m.pdfAttachment.filename}
                                </div>
                                <div className="text-[10.5px] text-teal-200 flex items-center gap-1.5 flex-wrap">
                                  <span>{m.pdfAttachment.sizeLabel}</span>
                                  <span>·</span>
                                  <span className="font-mono">Ref #{m.pdfAttachment.reportId}</span>
                                  <span>·</span>
                                  <span>AI Clinical Report</span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadMessagePdfAttachment(m.pdfAttachment!, m.text)
                              }
                              className="px-2.5 py-1.5 bg-white text-[#0d3f3b] hover:bg-teal-50 rounded-lg text-[10.5px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer shadow-2xs"
                              title="Download AI Clinical Analysis PDF Report"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download PDF</span>
                            </button>
                          </div>

                          {m.pdfAttachment.summaryPoints &&
                            m.pdfAttachment.summaryPoints.length > 0 && (
                              <div className="pt-1.5 border-t border-white/15 space-y-0.5 text-[10.5px] text-teal-100">
                                {m.pdfAttachment.summaryPoints.map((pt, pIdx) => (
                                  <div key={pIdx} className="truncate">
                                    • {pt}
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}

                      <p className="leading-relaxed whitespace-pre-line">{m.text}</p>
                      <div
                        className={`flex items-center justify-end gap-2 mt-1.5 text-[10px] flex-wrap ${
                          m.sender === 'patient' ? 'text-slate-400' : 'text-teal-200/90'
                        }`}
                      >
                        <span className="font-mono tabular-nums">{m.time}</span>
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
            </div>

            {/* Unified Reply Composer Text Box (Positioned Above AI Suggestions) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              {/* Text Input, Bilingual Voice Dictation Button & Background In-App Dispatch Controls */}
              <div className="flex items-center gap-2">
                <input
                  ref={composerInputRef}
                  type="text"
                  placeholder={
                    dictationLang === 'pa-IN'
                      ? `${activeThread.name} ਲਈ ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲੋ ਜਾਂ ਟਾਈਪ ਕਰੋ (Speak or type in Punjabi)...`
                      : `Type or dictate a reply to ${activeThread.name} (Press Enter to send in-app)...`
                  }
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

                {/* Prominent Bilingual Voice Dictation Button */}
                <VoiceDictationButton
                  value={customReply}
                  onChange={setCustomReply}
                  language={dictationLang}
                  variant="button"
                  label={dictationLang === 'pa-IN' ? 'Speak ਪੰਜਾਬੀ' : 'Dictate EN'}
                  title={
                    dictationLang === 'pa-IN'
                      ? 'Click to dictate reply in Punjabi (ਪੰਜਾਬੀ)'
                      : 'Click to dictate reply in English'
                  }
                />

                <button
                  type="button"
                  disabled={isDispatching || !customReply.trim()}
                  onClick={() => handleSendMessage(customReply, false)}
                  className="px-4 py-2.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shrink-0 shadow-2xs"
                  title="Dispatch reply in background without leaving Clinical OS"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                  <span>Send Reply</span>
                  <Send className="w-3 h-3" />
                </button>
              </div>

              {/* Composer Quick Templates + Voice Dictation Language Switcher */}
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-1 border-t border-slate-100">
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
                  {customReply.trim().length > 3 && (
                    <button
                      type="button"
                      disabled={isPolishingDictation}
                      onClick={handlePolishDictatedReply}
                      className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Let AI refine your spoken or typed note into a polished reply"
                    >
                      <Sparkles className="w-3 h-3 text-teal-700" />
                      <span>{isPolishingDictation ? 'Polishing...' : 'AI Polish Reply'}</span>
                    </button>
                  )}
                </div>

                {/* Bilingual Voice Dictation Language Selector (English / Punjabi) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Voice Mic Language:</span>
                  <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setDictationLang('en-US');
                        showToast('Voice dictation set to English');
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-colors cursor-pointer ${
                        dictationLang === 'en-US'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      EN (English)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDictationLang('pa-IN');
                        showToast('Voice dictation set to Punjabi (ਪੰਜਾਬੀ)');
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-colors cursor-pointer ${
                        dictationLang === 'pa-IN'
                          ? 'bg-white text-teal-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ਪੰਜਾਬੀ (Punjabi)
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Clinical Templates Drawer */}
              {showTemplateDrawer && (
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
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
                          composerInputRef.current?.focus();
                        }}
                        className="text-left p-2.5 rounded-lg bg-white hover:bg-teal-50/70 border border-slate-200/80 hover:border-teal-300 transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-900">{tpl.title}</div>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{tpl.text}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Suggested Replies Panel to Resolve Patient's Issue */}
            <div className="bg-white border border-teal-700/25 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-900">
                      AI Suggested Replies to Resolve Issue
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[11px] text-teal-800 font-medium">
                      {currentSuggestion?.intent || 'Tailored to patient chart'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pick an option below (or press keys 1, 2, 3) and click send to dispatch the reply in-app without leaving Clinical OS.
                  </p>
                </div>

                {/* Live AI Generation Trigger */}
                <button
                  type="button"
                  disabled={isGeneratingAiReply}
                  onClick={() => handleGenerateCustomAiSuggestion()}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer disabled:opacity-50"
                  title="Generate a fresh AI clinical reply using the patient's chart and message history"
                >
                  <RefreshCw className={`w-3 h-3 ${isGeneratingAiReply ? 'animate-spin text-teal-700' : ''}`} />
                  <span>{isGeneratingAiReply ? 'Synthesizing...' : 'Generate New AI Option'}</span>
                </button>
              </div>

              {/* Selectable Resolution Strategy Cards */}
              {activeSuggestions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {activeSuggestions.map((sug, idx) => {
                    const isSelected = idx === selectedSuggestionIndex;
                    return (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => setSelectedSuggestionIndex(idx)}
                        className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50/80 border-teal-700 text-slate-900 shadow-2xs'
                            : 'bg-slate-50/70 border-slate-200/90 text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold truncate">
                            {idx + 1}. {sug.label}
                          </span>
                          {isSelected && (
                            <Check className="w-3 h-3 text-teal-700 shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{sug.intent}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected Suggested Reply Preview Box */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200/90 space-y-2.5">
                <p className="text-xs text-slate-800 leading-relaxed">
                  {activeReplyText}
                </p>

                {/* Quick AI Refinement Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-200/60">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
                      AI Tailor:
                    </span>
                    {[
                      { label: 'More Reassuring', angle: 'Warm, reassuring bedside manner with clear comfort measures' },
                      { label: 'Request Photo', angle: 'Ask patient to send a clear daylight close-up photo of the skin area' },
                      { label: 'Advise Clinic Visit', angle: 'Recommend an in-person dermatology examination at the clinic today or tomorrow' },
                      { label: 'Bilingual (EN + Punjabi)', angle: 'Write in both Punjabi (Gurmukhi) and English for patient comfort' }
                    ].map(action => (
                      <button
                        key={action.label}
                        type="button"
                        disabled={isGeneratingAiReply}
                        onClick={() => handleGenerateCustomAiSuggestion(action.angle)}
                        className="px-2 py-0.5 bg-white hover:bg-teal-50 text-slate-600 hover:text-teal-900 border border-slate-200 rounded text-[10.5px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomReply(activeReplyText);
                      composerInputRef.current?.focus();
                      showToast('Loaded suggested reply into the text box above for editing.');
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-950 cursor-pointer"
                  >
                    Load into composer above to edit ↑
                  </button>
                </div>
              </div>

              {/* Primary 1-Click Resolution Action (Background API Dispatch — Never Leaves Clinical OS) */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-slate-500">
                    Dispatches in background to <strong className="text-slate-700 font-mono">{activeThread.phone}</strong> &amp; keeps you in Clinical OS.
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-teal-800 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSimulatePatientReply}
                      onChange={e => setAutoSimulatePatientReply(e.target.checked)}
                      className="rounded text-teal-700 focus:ring-teal-600"
                    />
                    <span>Auto-route patient reply (3s)</span>
                  </label>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={isDispatching || isSendingAiPdf}
                    onClick={handleOpenAiPdfModal}
                    className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-950 border border-teal-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    title="Generate a formal AI Clinical Analysis PDF Report and dispatch it on WhatsApp"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-800" />
                    <span>Send as AI Report PDF</span>
                  </button>
                  <button
                    type="button"
                    disabled={isDispatching || !activeReplyText}
                    onClick={() => handleSendMessage(activeReplyText, false)}
                    className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shadow-2xs"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                    <span>{isDispatching ? 'Dispatching...' : 'Use Reply & Send In-App'}</span>
                    <Send className="w-3 h-3 opacity-90" />
                  </button>
                </div>
              </div>
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
              One-click verification dispatches the refill confirmation in the background and logs it directly in the Clinical OS patient thread.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 font-mono tabular-nums">
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
                    Approved &amp; Sent In-App
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const targetThread = threads.find(t => t.id === item.threadId);
                      const refillMsg = `Hello ${item.name}, your prescription refill for ${item.medication} has been authorized by Dr. ${
                        doctor?.name || 'Sarah Chen'
                      }.`;
                      const cleanPhone = cleanPhoneNumber(targetThread?.phone || '') || '919123456789';
                      const whatsappUrl = getWhatsAppWebUrl(cleanPhone, refillMsg);

                      api.whatsapp
                        .send({
                          threadId: item.threadId,
                          patientId: targetThread?.patientId || item.threadId,
                          patientName: item.name,
                          recipientMobile: cleanPhone,
                          clinicPhone,
                          reportType: 'refill_authorization',
                          messageText: refillMsg,
                          autoSimulateReply: autoSimulatePatientReply
                        })
                        .then(res => {
                          if (res?.threads && Array.isArray(res.threads)) {
                            setThreads(res.threads);
                          }
                        })
                        .catch(() => {});

                      setLastDivertedReceipt({
                        receiptId: `wa-rx-${Date.now().toString(36)}`,
                        patientName: item.name,
                        clinicPhone,
                        recipientPhone: targetThread?.phone || `+${cleanPhone}`,
                        messageText: refillMsg,
                        whatsappUrl,
                        sentAt: new Date().toISOString()
                      });

                      setRefillQueue(prev =>
                        prev.map(r => (r.id === item.id ? { ...r, status: 'approved' } : r))
                      );
                      setThreads(prev =>
                        prev.map(t =>
                          t.id === item.threadId
                            ? {
                                ...t,
                                stage: 'resolved',
                                statusLabel: 'Refill approved & dispatched',
                                messages: [
                                  ...t.messages,
                                  {
                                    sender: 'doctor',
                                    text: refillMsg,
                                    time: 'Just now',
                                    status: `Delivered in background (${clinicPhone} → ${t.phone})`,
                                    whatsappUrl,
                                    recipientPhone: t.phone
                                  }
                                ]
                              }
                            : t
                        )
                      );
                      showToast(`Refill authorized & dispatched in background to ${item.name}.`);
                    }}
                    className="px-3.5 py-1.5 bg-[#0d3f3b] hover:bg-[#135650] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Authorize &amp; Send In-App
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
                  Select any patient from your clinic EHR to open a direct thread linked to {clinicPhone}
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
                  Send follow-up reminders or clinic announcements from {clinicPhone}
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
                    const personalizedMsg = broadcastText.replace(/\[name\]/gi, activeThread.name);
                    const cleanPhone = cleanPhoneNumber(activeThread.phone) || '919876543210';
                    const whatsappUrl = getWhatsAppWebUrl(cleanPhone, personalizedMsg);

                    api.whatsapp
                      .send({
                        threadId: activeThread.id,
                        patientId: activeThread.patientId || activeThread.id,
                        patientName: activeThread.name,
                        recipientMobile: cleanPhone,
                        clinicPhone,
                        reportType: 'broadcast_campaign',
                        messageText: personalizedMsg,
                        note: `[Broadcast: ${broadcastFilter}] ${personalizedMsg.slice(0, 80)}`
                      })
                      .then(res => {
                        if (res?.threads && Array.isArray(res.threads)) {
                          setThreads(res.threads);
                        }
                      })
                      .catch(() => {});

                    setLastDivertedReceipt({
                      receiptId: `wa-bcast-${Date.now().toString(36)}`,
                      patientName: activeThread.name,
                      clinicPhone,
                      recipientPhone: activeThread.phone,
                      messageText: personalizedMsg,
                      whatsappUrl,
                      sentAt: new Date().toISOString()
                    });

                    setBroadcastModalOpen(false);
                    showToast(`Broadcast dispatched in background from ${clinicPhone} for ${broadcastFilter}.`);
                  }}
                  className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Broadcast (In-App)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Simulate / Route Incoming Patient WhatsApp/SMS Reply into Clinical OS Inbox */}
      {showIncomingReplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Route Incoming Patient Reply into Clinical OS
                </h3>
                <p className="text-xs text-slate-500">
                  Simulate or inject an inbound WhatsApp/SMS message from{' '}
                  <strong>{activeThread.name}</strong> ({activeThread.phone}) to{' '}
                  <strong>{clinicPhone}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIncomingReplyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 block">
                  Quick Preset Patient Replies (Click to route immediately):
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    `Thank you Doctor! The redness has reduced today and the new cream feels soothing.`,
                    `Doctor, the rash is spreading faster and I have a mild fever since afternoon. Should I come in now?`,
                    `Friday at 10:00 AM works well for my follow-up visit. Please confirm my appointment.`
                  ].map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={isSimulatingIncoming}
                      onClick={() => handleReceiveIncomingPatientReply(preset)}
                      className="text-left p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-slate-700 transition-colors cursor-pointer"
                    >
                      &ldquo;{preset}&rdquo;
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Or Type Custom Incoming Patient Message:
                </label>
                <textarea
                  rows={3}
                  placeholder={`Type what ${activeThread.name} replies on WhatsApp/SMS...`}
                  value={incomingTestText}
                  onChange={e => setIncomingTestText(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIncomingReplyModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSimulatingIncoming}
                  onClick={() => handleReceiveIncomingPatientReply()}
                  className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSimulatingIncoming ? 'Routing...' : 'Route Reply into Inbox'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: AI Clinical Analysis Report PDF Generator & WhatsApp Dispatcher */}
      {showAiPdfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0d3f3b] text-white flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-teal-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Send AI Clinical Analysis Report (PDF) via WhatsApp
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase">
                      PDF Document
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Generates an official A4 clinical analysis PDF for{' '}
                    <strong className="text-slate-800">{activeThread.name}</strong> and dispatches it on WhatsApp ({clinicPhone} →{' '}
                    <span className="font-mono font-semibold text-slate-700">{activeThread.phone}</span>).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiPdfModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live PDF Document Header Card Preview */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex flex-col items-center justify-center shrink-0 font-bold">
                  <FileText className="w-4 h-4" />
                  <span className="text-[8px] tracking-tighter uppercase mt-0.5">PDF</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    AI_Clinical_Analysis_{activeThread.name.replace(/\s+/g, '_')}.pdf
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                    <span>Patient: {activeThread.subtitle}</span>
                    <span>·</span>
                    <span
                      className={
                        activeThread.priority === 'urgent'
                          ? 'text-rose-700 font-semibold'
                          : 'text-teal-800 font-semibold'
                      }
                    >
                      {activeThread.priority === 'urgent'
                        ? 'Priority: Urgent Triage'
                        : 'Priority: Routine Follow-Up'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadOrPreviewAiReportPdf}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                title="Download a copy of the generated PDF to inspect locally"
              >
                <Download className="w-3.5 h-3.5 text-teal-700" />
                <span>Download PDF Preview</span>
              </button>
            </div>

            {/* Editable PDF Report Sections */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  1. AI Clinical Assessment &amp; Triage Findings (Included in PDF Section 2 &amp; 3)
                </label>
                <textarea
                  rows={3}
                  value={aiPdfAssessmentDraft}
                  onChange={e => setAiPdfAssessmentDraft(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  placeholder="Enter AI clinical assessment and dermatological findings..."
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  2. Doctor&apos;s Recommended Action Plan &amp; Regimen (Included in PDF Section 4)
                </label>
                <textarea
                  rows={3}
                  value={aiPdfPlanDraft}
                  onChange={e => setAiPdfPlanDraft(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  placeholder="Enter treatment plan and medical guidance..."
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  3. Follow-Up &amp; Safety Instructions (Included in PDF Section 5)
                </label>
                <textarea
                  rows={2}
                  value={aiPdfFollowUpDraft}
                  onChange={e => setAiPdfFollowUpDraft(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  placeholder="Enter follow-up schedule and red-flag instructions..."
                />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoDownloadLocalPdf}
                    onChange={e => setAlsoDownloadLocalPdf(e.target.checked)}
                    className="rounded text-teal-700 focus:ring-teal-600"
                  />
                  <span>Also download PDF file to my computer when sending</span>
                </label>

                <span className="text-[11px] text-slate-500">
                  Signed by <strong>Dr. {doctor?.name || 'Sarah Chen'}</strong>
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowAiPdfModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingAiPdf}
                onClick={handleSendAiReportPdf}
                className="px-4 py-2.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <WhatsAppIcon className="w-4 h-4 fill-white" />
                <span>
                  {isSendingAiPdf
                    ? 'Generating & Sending PDF...'
                    : `Send AI Report PDF to ${activeThread.name} (In-App)`}
                </span>
                <Send className="w-3.5 h-3.5" />
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
            showToast(`WhatsApp report dispatched to ${selectedPatientForReport.fullName}.`);
          }}
        />
      )}
    </div>
  );
};
