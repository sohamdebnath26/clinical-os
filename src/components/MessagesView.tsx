import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
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
  Check,
  RefreshCw,
  FileText,
  MessageSquare,
  Plus,
  X,
  CheckCheck,
  Edit2,
  Sparkles,
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

  // Clinic Linked Phone Number State (Editable inline, persisted in localStorage)
  const [clinicPhone, setClinicPhone] = useState<string>(() => {
    try {
      return localStorage.getItem('clinical_os_clinic_phone') || '+91 98765 00001';
    } catch {
      return '+91 98765 00001';
    }
  });
  const [isEditingClinicPhone, setIsEditingClinicPhone] = useState(false);
  const [clinicPhoneDraft, setClinicPhoneDraft] = useState(clinicPhone);

  // Patient Recipient Phone Inline Edit State
  const [isEditingPatientPhone, setIsEditingPatientPhone] = useState(false);
  const [patientPhoneDraft, setPatientPhoneDraft] = useState('');

  // Filter, Search & Active Thread State
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'draft_ready' | 'resolved'>('all');
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

  // Reply & Live Dispatch State
  const [customReply, setCustomReply] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [autoSimulatePatientReply, setAutoSimulatePatientReply] = useState(false);
  const [showIncomingReplyModal, setShowIncomingReplyModal] = useState(false);
  const [incomingTestText, setIncomingTestText] = useState('');
  const [isSimulatingIncoming, setIsSimulatingIncoming] = useState(false);

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

  // Refill queue state (rendered contextually inside the matching patient thread)
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
    showToast(`Clinic WhatsApp/SMS line updated to ${trimmed}`);
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
      timestamp: '2m ago',
      unread: true,
      statusLabel: 'Urgent triage',
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
      timestamp: '40m ago',
      unread: true,
      statusLabel: 'AI draft ready',
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
          label: 'Cold Compress & Dosage',
          intent: 'Symptomatic relief',
          text: 'Hi Harman, the reduced redness is a good sign of healing. For night itching, apply a cool damp compress for 5 minutes before applying your chilled moisturizer, and take your prescribed tablet 1 hour before bed.'
        },
        {
          id: 's-2c',
          label: 'Bilingual (EN + Punjabi)',
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
      timestamp: '3h ago',
      unread: false,
      statusLabel: 'Refill verified',
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
      timestamp: '3h ago',
      unread: false,
      statusLabel: '3 open Friday slots',
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
          label: 'Offer Friday Slots',
          intent: 'Direct slot selection',
          text: 'Hi Anita, certainly. We have open slots this Friday at 10:00 AM, 2:30 PM, or 4:00 PM. Please reply with your preferred time and we will confirm your appointment.'
        },
        {
          id: 's-4b',
          label: 'Confirm Friday 10:00 AM',
          intent: 'Proactive booking',
          text: 'Hi Anita, I have tentatively reserved the Friday 10:00 AM morning slot for your visit. Let us know if you prefer an afternoon time instead.'
        },
        {
          id: 's-4c',
          label: 'Offer Tele-Consult',
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
      statusLabel: 'Resolved',
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
          label: 'Sunscreen & Hydration',
          intent: 'Adherence support',
          text: 'Hi Meera, glad to hear that. Remember to apply SPF 50+ sunscreen every morning while using the night cream, and message us if you notice any dryness.'
        },
        {
          id: 's-5b',
          label: '1-Week Photo Check-In',
          intent: 'Visual progress tracking',
          text: 'Hi Meera, great! Please share a clear daylight photo of the treated area after 7 days so we can assess your pigmentation improvement.'
        },
        {
          id: 's-5c',
          label: 'Confirm 7-Day Review',
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
      timestamp: '1h ago',
      unread: true,
      statusLabel: 'Pharmacy verification',
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
          label: 'Authorize Dispensing',
          intent: 'Approve as written',
          text: 'Prescription batch #RX-8842 for Harman Preet (P-24618) is verified and authorized for dispensing as written.'
        },
        {
          id: 's-6b',
          label: 'Approve Substitution',
          intent: 'Allow generic equivalent',
          text: 'Batch #RX-8842 is authorized. If the primary topical brand is out of stock, you may dispense the equivalent strength ceramide formulation.'
        },
        {
          id: 's-6c',
          label: 'Request Pharmacist Call',
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

    const unsubscribeSse = subscribeToClinicRealtimeEvents(evt => {
      if (
        (evt.type === 'inbox:message_received' ||
          evt.type === 'inbox:message_sent' ||
          evt.type === 'inbox:status_updated') &&
        evt.thread
      ) {
        const updatedThread = evt.thread as Thread;
        setThreads(prev => {
          const exists = prev.some(t => t.id === updatedThread.id);
          return exists
            ? prev.map(t => (t.id === updatedThread.id ? updatedThread : t))
            : [updatedThread, ...prev];
        });
        knownMessageCountRef.current[updatedThread.id] = updatedThread.messages?.length || 0;

        if (evt.type === 'inbox:message_received') {
          showToast(`New reply from ${updatedThread.name}`);
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
            showToast(`New reply from ${newlyArrivedPatientName}`);
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

  useEffect(() => {
    setSelectedSuggestionIndex(0);
    setIsEditingPatientPhone(false);
    setPatientPhoneDraft(activeThread?.phone || '');
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [selectedThreadId]);

  const handleSavePatientPhone = () => {
    const rawDigits = patientPhoneDraft.replace(/\D/g, '');
    if (rawDigits.length < 10) {
      showToast('Please enter a valid 10-digit mobile number.');
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
    showToast(`Updated number for ${activeThread.name}`);
  };

  // Keyboard shortcuts (1 / 2 / 3 to quickly select AI suggestion when not typing in an input)
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
          setCustomReply(activeThread.suggestedReplies[idx].text);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeThread]);

  // Pipeline counts
  const urgentCount = threads.filter(t => t.priority === 'urgent' && t.stage !== 'resolved').length;
  const draftReadyCount = threads.filter(t => t.stage === 'draft_ready').length;
  const resolvedCount = threads.filter(t => t.stage === 'resolved').length;

  // Generate fresh AI suggested reply for the active patient's issue
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
        label: clinicalAngle ? clinicalAngle.split(' ').slice(0, 3).join(' ') : 'AI Clinical Reply',
        intent: 'Live AI synthesis',
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
      setCustomReply(cleanedReply);
      showToast('Loaded new AI clinical suggestion into composer');
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
        label: clinicalAngle ? clinicalAngle.split(' ').slice(0, 3).join(' ') : 'Updated Reply',
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
      setCustomReply(fallbackText);
      showToast('Updated clinical reply suggestion');
    } finally {
      setIsGeneratingAiReply(false);
    }
  };

  // Polish dictated or rough text in the composer using AI
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
        showToast(isPunjabiMode ? 'Polished reply in Punjabi & English' : 'Polished reply with AI');
      }
    } catch {
      const capitalized =
        customReply.trim().charAt(0).toUpperCase() + customReply.trim().slice(1);
      setCustomReply(
        `Hi ${activeThread.name}, ${capitalized}${/[.!?]$/.test(capitalized) ? '' : '.'} — Dr. ${
          doctor?.name || 'Sarah Chen'
        }`
      );
      showToast('Formatted reply');
    } finally {
      setIsPolishingDictation(false);
    }
  };

  // Dispatch a message in the background & update the conversation thread
  const handleSendMessage = async (textToSend: string, openUnfocusedBackgroundTab = false) => {
    if (!textToSend.trim() || !activeThread) return;
    setIsDispatching(true);

    const messageText = textToSend.trim();
    const cleanPhone = cleanPhoneNumber(activeThread.phone) || '919876543210';
    const whatsappUrl = getWhatsAppWebUrl(cleanPhone, messageText);

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
      setThreads(prev =>
        prev.map(t => {
          if (t.id === activeThread.id) {
            return {
              ...t,
              stage: 'resolved',
              statusLabel: 'Resolved',
              messages: [
                ...t.messages,
                {
                  sender: 'doctor',
                  text: messageText,
                  time: 'Just now',
                  status: 'Delivered',
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
    showToast(`Sent to ${activeThread.name} (${activeThread.phone})`);
  };

  // Route an incoming patient WhatsApp/SMS reply directly into the Inbox
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
      showToast(`Incoming reply from ${activeThread.name} added to thread`);
    } catch {
      showToast('Failed to route incoming message.');
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  // Batch approve all safe drafts
  const handleBatchApproveDrafts = () => {
    const readyThreads = threads.filter(t => t.stage === 'draft_ready' && t.draftReply);
    if (readyThreads.length === 0) {
      showToast('All queued drafts have already been sent.');
      return;
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
            statusLabel: 'Resolved',
            messages: [
              ...t.messages,
              {
                sender: 'doctor',
                text: t.draftReply,
                time: 'Just now',
                status: 'Delivered',
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
    showToast(`Approved & sent ${readyThreads.length} drafts`);
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
            statusLabel: nextStage === 'resolved' ? 'Resolved' : 'Needs review'
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
      statusLabel: 'Draft ready',
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
          label: 'Request Daylight Photo',
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
    const planText = customReply.trim() || (currentSug ? currentSug.text : activeThread.draftReply);

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

  const handleDownloadOrPreviewAiReportPdf = () => {
    if (!activeThread) return;
    const generated = buildCurrentPatientAiPdf();
    generated.triggerDownload();
    showToast(`Downloaded ${generated.filename}`);
  };

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
                statusLabel: 'PDF Sent',
                messages: [
                  ...t.messages,
                  {
                    sender: 'doctor',
                    text: generated.whatsappCompanionText,
                    time: 'Just now',
                    status: 'PDF Delivered',
                    receiptId,
                    whatsappUrl,
                    recipientPhone: activeThread.phone,
                    pdfAttachment: pdfAttachmentPayload
                  }
                ],
                preview: `PDF Sent: ${generated.filename}`,
                timestamp: 'Just now',
                unread: false
              };
            }
            return t;
          })
        );
      }

      setShowAiPdfModal(false);
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 90);
      showToast(`Sent PDF report (${generated.filename}) to ${activeThread.name}`);
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
    return true;
  });

  const activeSuggestions = activeThread.suggestedReplies || [];
  const currentSuggestion =
    activeSuggestions[selectedSuggestionIndex] || activeSuggestions[0] || null;
  const activeReplyText = currentSuggestion ? currentSuggestion.text : activeThread.draftReply;

  // Check if the active thread has a pending refill request
  const activeThreadRefill = refillQueue.find(
    r => r.threadId === activeThread.id && r.status === 'pending'
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#0d3f3b] text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Clean Minimal Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Patient Inbox
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
            <span>Clinic Line:</span>
            {isEditingClinicPhone ? (
              <span className="inline-flex items-center gap-1.5">
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
                  className="text-xs font-mono font-semibold text-slate-900 bg-white border border-slate-300 rounded px-2 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
                <button
                  type="button"
                  onClick={handleSaveClinicPhone}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClinicPhoneDraft(clinicPhone);
                    setIsEditingClinicPhone(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono font-semibold text-slate-700 tabular-nums">
                  {clinicPhone}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClinicPhoneDraft(clinicPhone);
                    setIsEditingClinicPhone(true);
                  }}
                  className="text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer"
                >
                  Change
                </button>
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{urgentCount} urgent</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{draftReadyCount} drafts ready</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowIncomingReplyModal(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
          >
            Simulate Reply
          </button>
          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
            <span>Broadcast</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewMessageModal(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-teal-700" />
            <span>New Message</span>
          </button>
          {draftReadyCount > 0 && (
            <button
              type="button"
              onClick={handleBatchApproveDrafts}
              className="px-3.5 py-1.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
              <span className="tabular-nums">Approve All Drafts ({draftReadyCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* LEFT COLUMN: Clean Conversation Queue (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-180px)] min-h-[620px] max-h-[780px]">
          {/* Search & Segmented Filter Tabs */}
          <div className="p-3 border-b border-slate-200 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-teal-600 focus:outline-none"
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

            {/* Clean Segmented Filter Tabs with Live Counts */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { id: 'all', label: `All (${threads.length})` },
                { id: 'urgent', label: `Urgent (${urgentCount})` },
                { id: 'draft_ready', label: `Drafts (${draftReadyCount})` },
                { id: 'resolved', label: `Done (${resolvedCount})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id as any)}
                  className={`py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    activeFilter === tab.id
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thread Queue List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-700">No conversations match this filter</p>
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                >
                  View all conversations
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
                    className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 cursor-pointer ${
                      isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                        isUrgent
                          ? 'bg-rose-600'
                          : th.stage === 'resolved'
                          ? 'bg-slate-400'
                          : 'bg-[#0d3f3b]'
                      }`}
                    >
                      {th.name.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs truncate ${
                            th.unread ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'
                          }`}
                        >
                          {th.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                          {th.timestamp}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 truncate mt-0.5">{th.preview}</p>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 truncate">
                        <span>{th.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            isUrgent
                              ? 'text-rose-600 font-semibold'
                              : th.stage === 'draft_ready'
                              ? 'text-amber-700 font-medium'
                              : th.stage === 'resolved'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }
                        >
                          {th.statusLabel}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Focused Conversation & Pinned Bottom Composer (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-180px)] min-h-[620px] max-h-[780px]">
          {/* 1. Compact Thread Header */}
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900 truncate">{activeThread.name}</h2>
                <span className="text-xs text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs text-slate-500">{activeThread.subtitle}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                {isEditingPatientPhone ? (
                  <span className="inline-flex items-center gap-1.5">
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
                      className="text-xs font-mono font-semibold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 w-36 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSavePatientPhone}
                      className="text-xs font-semibold text-teal-700 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientPhoneDraft(activeThread.phone);
                        setIsEditingPatientPhone(false);
                      }}
                      className="text-xs text-slate-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                      {activeThread.phone}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientPhoneDraft(activeThread.phone);
                        setIsEditingPatientPhone(true);
                      }}
                      className="text-[11px] text-teal-700 hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span className="text-[11px] text-slate-500 truncate">{activeThread.aiSummary}</span>
              </div>
            </div>

            {/* Focused Header Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`tel:${activeThread.phone.replace(/\s+/g, '')}`}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>Call</span>
              </a>

              <button
                type="button"
                onClick={handleOpenWhatsAppShareModal}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Send Report / Rx</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleThreadStage(activeThread.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeThread.stage === 'resolved'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{activeThread.stage === 'resolved' ? 'Resolved' : 'Resolve'}</span>
              </button>
            </div>
          </div>

          {/* Contextual Inline Refill Banner (Only shown when this patient has a pending refill) */}
          {activeThreadRefill && (
            <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-200/80 flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-amber-950">
                  Refill Request: {activeThreadRefill.medication}
                </span>
                <span className="text-amber-700" aria-hidden="true">
                  ·
                </span>
                <span className="text-amber-900 truncate">{activeThreadRefill.note}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const refillMsg = `Hello ${activeThreadRefill.name}, your prescription refill for ${activeThreadRefill.medication} has been authorized by Dr. ${
                    doctor?.name || 'Sarah Chen'
                  }.`;
                  setRefillQueue(prev =>
                    prev.map(r => (r.id === activeThreadRefill.id ? { ...r, status: 'approved' } : r))
                  );
                  handleSendMessage(refillMsg, false);
                }}
                className="px-3 py-1 bg-[#0d3f3b] hover:bg-[#135650] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                Authorize &amp; Send Refill
              </button>
            </div>
          )}

          {/* 2. Scrollable Conversation History */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50"
          >
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
                  <div className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-md">
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
                    {/* Attached PDF Card */}
                    {m.pdfAttachment && (
                      <div className="mb-2.5 p-2.5 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-teal-200 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-white truncate">
                              {m.pdfAttachment.filename}
                            </div>
                            <div className="text-[10.5px] text-teal-200">
                              {m.pdfAttachment.sizeLabel} · Ref #{m.pdfAttachment.reportId}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadMessagePdfAttachment(m.pdfAttachment!, m.text)}
                          className="px-2.5 py-1 bg-white text-[#0d3f3b] hover:bg-teal-50 rounded-md text-[10.5px] font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </div>
                    )}

                    <p className="leading-relaxed whitespace-pre-line">{m.text}</p>
                    <div
                      className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${
                        m.sender === 'patient' ? 'text-slate-400' : 'text-teal-200/80'
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

          {/* 3. Pinned Bottom Unified Composer (Text Box Above Compact AI Suggestions) */}
          <div className="p-4 bg-white border-t border-slate-200 space-y-3">
            {/* Quick Clinical Templates Drawer */}
            {showTemplateDrawer && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Insert Clinical Template
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTemplateDrawer(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {CLINICAL_TEMPLATES.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setCustomReply(tpl.text);
                        setShowTemplateDrawer(false);
                        composerInputRef.current?.focus();
                      }}
                      className="text-left p-2 rounded-lg bg-white hover:bg-teal-50/60 border border-slate-200 text-xs transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-slate-900">{tpl.title}</div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{tpl.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Primary Composer Input Row (Above AI Suggestions) */}
            <div className="flex items-center gap-2">
              <input
                ref={composerInputRef}
                type="text"
                placeholder={
                  dictationLang === 'pa-IN'
                    ? `${activeThread.name} ਲਈ ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲੋ ਜਾਂ ਟਾਈਪ ਕਰੋ...`
                    : `Write a reply to ${activeThread.name} or click an AI suggestion below...`
                }
                value={customReply}
                onChange={e => setCustomReply(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customReply.trim()) {
                    e.preventDefault();
                    handleSendMessage(customReply, false);
                  }
                }}
                className="flex-1 text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-600 focus:bg-white"
              />

              <VoiceDictationButton
                value={customReply}
                onChange={setCustomReply}
                language={dictationLang}
                variant="button"
                label={dictationLang === 'pa-IN' ? 'ਪੰਜਾਬੀ Mic' : 'Voice'}
              />

              <button
                type="button"
                onClick={handleOpenAiPdfModal}
                disabled={isDispatching || isSendingAiPdf}
                className="px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                title="Send as Official A4 PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Send as PDF</span>
              </button>

              <button
                type="button"
                disabled={isDispatching || !(customReply.trim() || activeReplyText)}
                onClick={() => handleSendMessage(customReply.trim() || activeReplyText, false)}
                className="px-4 py-2.5 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shrink-0 whitespace-nowrap"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                <span>{customReply.trim() ? 'Send Reply' : 'Send AI Draft'}</span>
                <Send className="w-3 h-3" />
              </button>
            </div>

            {/* Compact AI Suggested Replies Strip (Directly Below Text Box) */}
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1 mr-1">
                    <Sparkles className="w-3 h-3 text-teal-700" />
                    <span>AI Suggestions:</span>
                  </span>
                  {activeSuggestions.map((sug, idx) => {
                    const isSelected = idx === selectedSuggestionIndex;
                    return (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => {
                          setSelectedSuggestionIndex(idx);
                          setCustomReply(sug.text);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-[#0d3f3b] text-white font-semibold'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {idx + 1}. {sug.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    disabled={isGeneratingAiReply}
                    onClick={() => handleGenerateCustomAiSuggestion()}
                    className="text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGeneratingAiReply ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingAiReply ? 'Drafting...' : 'Regenerate'}</span>
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => handleGenerateCustomAiSuggestion('Write in both Punjabi (Gurmukhi) and English')}
                    className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer whitespace-nowrap"
                  >
                    Punjabi + EN
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTemplateDrawer(prev => !prev)}
                    className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer whitespace-nowrap"
                  >
                    {showTemplateDrawer ? 'Hide Templates' : 'Templates'}
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDictationLang(prev => (prev === 'en-US' ? 'pa-IN' : 'en-US'))
                    }
                    className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer whitespace-nowrap"
                  >
                    Mic: {dictationLang === 'pa-IN' ? 'ਪੰਜਾਬੀ' : 'EN'}
                  </button>
                  {customReply.trim().length > 3 && (
                    <>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <button
                        type="button"
                        disabled={isPolishingDictation}
                        onClick={handlePolishDictatedReply}
                        className="text-teal-700 hover:text-teal-900 font-semibold cursor-pointer whitespace-nowrap"
                      >
                        {isPolishingDictation ? 'Polishing...' : 'Polish Text'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Clean 2-Line Preview of Active Suggestion when composer is empty */}
              {!customReply.trim() && activeReplyText && (
                <div className="flex items-start justify-between gap-3 pt-1 border-t border-slate-200/70 text-xs text-slate-600">
                  <p className="line-clamp-2 leading-relaxed">{activeReplyText}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomReply(activeReplyText);
                      composerInputRef.current?.focus();
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    Edit in box ↑
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Select Registered Patient from EHR */}
      {showNewMessageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Message a Patient</h3>
                <p className="text-xs text-slate-500">
                  Select a patient from your clinic EHR to open a conversation
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
                  Loading patients...
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
                      <span>Message</span>
                    </button>
                  </div>
                ))
              )}
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
                <h3 className="text-base font-bold text-slate-900">Patient Broadcast</h3>
                <p className="text-xs text-slate-500">
                  Send follow-up reminders from {clinicPhone}
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
                <label className="block font-bold text-slate-700 mb-1">Audience</label>
                <select
                  value={broadcastFilter}
                  onChange={e => setBroadcastFilter(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option>All active patients ({realPatients.length || 18} patients)</option>
                  <option>Follow-up due this week (8 patients)</option>
                  <option>Post-procedure healing check (5 patients)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Message</label>
                <textarea
                  rows={4}
                  value={broadcastText}
                  onChange={e => setBroadcastText(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-600"
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
                    api.whatsapp
                      .send({
                        threadId: activeThread.id,
                        patientId: activeThread.patientId || activeThread.id,
                        patientName: activeThread.name,
                        recipientMobile: cleanPhone,
                        clinicPhone,
                        reportType: 'broadcast_campaign',
                        messageText: personalizedMsg
                      })
                      .then(res => {
                        if (res?.threads && Array.isArray(res.threads)) {
                          setThreads(res.threads);
                        }
                      })
                      .catch(() => {});

                    setBroadcastModalOpen(false);
                    showToast(`Broadcast sent for ${broadcastFilter}`);
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

      {/* Modal: Simulate Incoming Patient Reply */}
      {showIncomingReplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Simulate Incoming Patient Reply
                </h3>
                <p className="text-xs text-slate-500">
                  Route a test reply from <strong>{activeThread.name}</strong> ({activeThread.phone})
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
                <span className="font-semibold text-slate-700 block">Quick Presets:</span>
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
                      className="text-left p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      &ldquo;{preset}&rdquo;
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Or Custom Patient Message:
                </label>
                <textarea
                  rows={3}
                  placeholder={`Type what ${activeThread.name} replies...`}
                  value={incomingTestText}
                  onChange={e => setIncomingTestText(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSimulatePatientReply}
                    onChange={e => setAutoSimulatePatientReply(e.target.checked)}
                    className="rounded text-teal-700"
                  />
                  <span>Auto-simulate reply 3s after sending</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIncomingReplyModal(false)}
                    className="px-3.5 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer"
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
                    <span>{isSimulatingIncoming ? 'Routing...' : 'Route Reply'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: AI Clinical Analysis Report PDF Generator & WhatsApp Dispatcher */}
      {showAiPdfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Send Medical Report as PDF
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generates an A4 clinical report PDF for <strong>{activeThread.name}</strong> ({activeThread.phone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAiPdfModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  AI_Clinical_Analysis_{activeThread.name.replace(/\s+/g, '_')}.pdf
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {activeThread.subtitle} · Signed by Dr. {doctor?.name || 'Sarah Chen'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadOrPreviewAiReportPdf}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-teal-700" />
                <span>Download PDF</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  1. Clinical Assessment &amp; Findings
                </label>
                <textarea
                  rows={2}
                  value={aiPdfAssessmentDraft}
                  onChange={e => setAiPdfAssessmentDraft(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  2. Recommended Treatment Plan
                </label>
                <textarea
                  rows={3}
                  value={aiPdfPlanDraft}
                  onChange={e => setAiPdfPlanDraft(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  3. Follow-Up Instructions
                </label>
                <textarea
                  rows={2}
                  value={aiPdfFollowUpDraft}
                  onChange={e => setAiPdfFollowUpDraft(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoDownloadLocalPdf}
                  onChange={e => setAlsoDownloadLocalPdf(e.target.checked)}
                  className="rounded text-teal-700"
                />
                <span>Also download PDF copy to computer when sending</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
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
                className="px-4 py-2 bg-[#0d3f3b] hover:bg-[#135650] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                <span>{isSendingAiPdf ? 'Sending PDF...' : 'Send PDF on WhatsApp'}</span>
                <Send className="w-3 h-3" />
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
            showToast(`WhatsApp report sent to ${selectedPatientForReport.fullName}`);
          }}
        />
      )}
    </div>
  );
};
