import React, { useState, useEffect, useRef } from 'react';
import { api, subscribeToMobileSessionRealtimeEvents } from '../lib/api';
import { cleanPhoneNumber, launchWhatsAppSynchronously } from '../lib/whatsappUtils';
import {
  ShieldCheck,
  Send,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  Check,
  AlertCircle,
  Loader2,
  Phone,
  FileText,
  X,
  Sparkles,
  Download,
  MessageSquare
} from 'lucide-react';

interface PatientReplyPortalViewProps {
  token: string;
}

interface PortalSession {
  token: string;
  threadId: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  clinicName: string;
  clinicPhone: string;
  latestDoctorMessage?: string;
  expiresAt: number;
}

interface PortalMessage {
  id: string;
  sender: 'patient' | 'doctor' | 'ai';
  text: string;
  time: string;
  imageUrl?: string;
  hasAttachment?: boolean;
  attachmentFilename?: string;
  pdfAttachment?: {
    filename: string;
    reportId: string;
    sizeLabel: string;
    generatedAt: string;
    summaryPoints?: string[];
    pdfDataUrl?: string;
  };
  createdAt?: string;
}

const QUICK_CHIPS = [
  'Got it, thank you doctor!',
  'CONFIRM appointment',
  'RESCHEDULE appointment',
  'Rash is improving nicely',
  'Prescription medicines started',
  'Feeling better today'
];

export const PatientReplyPortalView: React.FC<PatientReplyPortalViewProps> = ({ token }) => {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Composer states
  const [replyText, setReplyText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessNotice, setSendSuccessNotice] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSession = async () => {
    try {
      setIsLoading(true);
      const res = await api.portal.getSession(token);
      setSession(res.session);
      setMessages(res.messages || []);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to clinic portal';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    // Subscribe to real-time SSE for instant doctor replies and PDF attachments
    const unsubscribeSse = subscribeToMobileSessionRealtimeEvents(token, evt => {
      if (evt.type === 'portal:message_sent' || evt.type === 'portal:message_received') {
        api.portal
          .getSession(token)
          .then(res => {
            setSession(res.session);
            setMessages(res.messages || []);
          })
          .catch(() => {});
      }
    });

    // Poll every 8 seconds as fallback so if doctor replies, it appears automatically
    const interval = setInterval(() => {
      api.portal
        .getSession(token)
        .then(res => {
          setSession(res.session);
          setMessages(res.messages || []);
        })
        .catch(() => {});
    }, 8000);
    return () => {
      unsubscribeSse();
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelected = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      setImagePreview(result);
      if (!imageCaption) {
        setImageCaption('Skin condition photo for review');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPdfAttachment = (m: PortalMessage) => {
    const pdfDataUrl = m.pdfAttachment?.pdfDataUrl;
    const filename =
      m.pdfAttachment?.filename || m.attachmentFilename || 'Medical_Report.pdf';
    if (pdfDataUrl && pdfDataUrl.startsWith('data:application/pdf')) {
      const link = document.createElement('a');
      link.href = pdfDataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSendSuccessNotice(`Downloaded ${filename}`);
      setTimeout(() => setSendSuccessNotice(null), 3500);
    } else {
      // Fallback text download if no raw PDF data URL was stored
      const blob = new Blob([m.text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename.replace(/\.pdf$/i, '.txt');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleOpenWhatsAppToClinic = () => {
    const clinicPhoneClean = cleanPhoneNumber(session?.clinicPhone || '919876500001');
    const draft =
      replyText.trim() ||
      `Hello Dr. ${session?.doctorName?.replace(/^Dr\.?\s*/i, '') || 'Doctor'}, this is ${
        session?.patientName || 'your patient'
      } replying regarding my dermatology consultation.`;
    launchWhatsAppSynchronously(clinicPhoneClean, draft, 'native');
  };

  const handleSendReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed && !imagePreview) return;

    try {
      setIsSending(true);
      setError(null);

      // Optimistic message
      const optimisticMsg: PortalMessage = {
        id: `opt-${Date.now()}`,
        sender: 'patient',
        text: trimmed || (imagePreview ? '📷 [Attached clinical photo]' : ''),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        imageUrl: imagePreview || undefined,
        createdAt: new Date().toISOString()
      };

      setMessages(prev => [...prev, optimisticMsg]);
      setReplyText('');
      const pendingImg = imagePreview;
      const pendingCaption = imageCaption;
      setImagePreview(null);
      setImageCaption('');

      const res = await api.portal.sendReply(token, {
        text: trimmed,
        imageDataUrl: pendingImg || undefined,
        imageCaption: pendingCaption || undefined
      });

      setSendSuccessNotice('Delivered directly to doctor & medical team');
      setTimeout(() => setSendSuccessNotice(null), 5000);

      // Refresh latest message state from server
      if (res?.message?.id) {
        setMessages(prev =>
          prev.map(m =>
            m.id === optimisticMsg.id
              ? {
                  ...m,
                  id: res.message.id,
                  imageUrl: res.message.imageUrl || m.imageUrl
                }
              : m
          )
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setError(msg);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <Loader2 className="w-10 h-10 text-teal-400 animate-spin mb-4" />
        <h2 className="text-lg font-semibold">Connecting to Clinic...</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Loading secure end-to-end patient communication portal.
        </p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 border border-rose-500/30">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Link Expired or Invalid</h2>
        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
          {error || 'This secure reply link is no longer active. For medical updates or assistance, please reach out to the clinic reception.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          Try Reloading
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center text-slate-900">
      {/* Maximum width container optimized for mobile screens */}
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-2xl relative border-x border-slate-200">
        {/* Clinic & Doctor Top Header */}
        <header className="bg-[#0b3330] text-white px-4 py-3 shrink-0 sticky top-0 z-30 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-inner shrink-0">
                {session?.doctorName
                  ? session.doctorName
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map(p => p[0])
                      .join('')
                      .toUpperCase()
                  : 'DR'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-semibold text-sm text-white truncate">
                    Dr. {session?.doctorName?.replace(/^Dr\.?\s*/i, '')}
                  </h1>
                  <span className="inline-flex items-center px-1.5 py-0.2 text-[9.5px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-400/30">
                    Verified
                  </span>
                </div>
                <p className="text-[11px] text-teal-200/90 truncate">
                  {session?.clinicName || 'Clinical OS Practice'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {session?.clinicPhone && (
                <button
                  type="button"
                  onClick={handleOpenWhatsAppToClinic}
                  className="px-2.5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-[10.5px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Open WhatsApp directly to Clinic Line"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>WhatsApp</span>
                </button>
              )}
              {session?.clinicPhone && (
                <a
                  href={`tel:${session.clinicPhone.replace(/\s+/g, '')}`}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
                  title="Call Clinic Hotline"
                >
                  <Phone className="w-4 h-4 text-teal-200" />
                </a>
              )}
            </div>
          </div>

          {/* Patient Context & Encryption Banner */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10.5px] text-teal-100/90">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-white/60">Patient:</span>
              <span className="font-medium text-white truncate">{session?.patientName}</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-300 shrink-0 font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Live Two-Way Clinic Link</span>
            </div>
          </div>
        </header>

        {/* Success toast if recently sent */}
        {sendSuccessNotice && (
          <div className="bg-emerald-600 text-white px-3 py-1.5 text-xs text-center font-medium flex items-center justify-center gap-1.5 animate-in fade-in duration-200 sticky top-[76px] z-20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{sendSuccessNotice}</span>
          </div>
        )}

        {/* Message Thread History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70">
          {/* Security Notice Bubble */}
          <div className="flex justify-center my-1">
            <div className="bg-slate-200/80 border border-slate-300/80 rounded-xl px-3 py-1.5 text-[10.5px] text-slate-600 max-w-xs text-center leading-relaxed">
              🔒 Messages and photos sent here reach your doctor&apos;s official Clinical OS Inbox in real time.
            </div>
          </div>

          {messages.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs">
              No previous messages in this consultation thread yet. Type a message or send a photo below.
            </div>
          )}

          {messages.map((m, idx) => (
            <div
              key={m.id || idx}
              className={`flex ${m.sender === 'patient' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                  m.sender === 'patient'
                    ? 'bg-[#0b3330] text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                }`}
              >
                {/* Doctor name tag on clinic messages */}
                {m.sender !== 'patient' && (
                  <div className="text-[10px] font-semibold text-teal-800 mb-1 flex items-center gap-1">
                    <span>Dr. {session?.doctorName?.replace(/^Dr\.?\s*/i, '')}</span>
                  </div>
                )}

                {/* Attached Medical Report PDF notice + Download button */}
                {(m.hasAttachment || m.pdfAttachment) && (
                  <div className="mb-2 p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-[11px] truncate">
                          {m.pdfAttachment?.filename || m.attachmentFilename || 'Medical Report.pdf'}
                        </div>
                        <div className="text-[9.5px] text-teal-600">
                          {m.pdfAttachment?.sizeLabel
                            ? `${m.pdfAttachment.sizeLabel} · Official Clinic PDF`
                            : 'Attached by Clinic'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdfAttachment(m)}
                      className="px-2.5 py-1 rounded-lg bg-[#0b3330] hover:bg-teal-800 text-white text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>PDF</span>
                    </button>
                  </div>
                )}

                {/* Attached Image Thumbnail */}
                {m.imageUrl && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-black/10 bg-black/5">
                    <img
                      src={m.imageUrl}
                      alt="Clinical photo"
                      onClick={() => setPreviewModalUrl(m.imageUrl!)}
                      className="w-full max-h-56 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                    />
                    <div className="px-2 py-1 text-[9.5px] bg-black/40 text-white flex items-center justify-between">
                      <span>Click to enlarge</span>
                    </div>
                  </div>
                )}

                <p className="leading-relaxed whitespace-pre-line text-xs">{m.text}</p>

                <div
                  className={`flex items-center justify-end gap-1.5 mt-1 text-[9.5px] font-mono tabular-nums ${
                    m.sender === 'patient' ? 'text-teal-200/90' : 'text-slate-400'
                  }`}
                >
                  <span>{m.time}</span>
                  {m.sender === 'patient' && (
                    <Check className="w-3 h-3 text-teal-300 inline" />
                  )}
                </div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Response Suggestion Chips */}
        <div className="bg-white border-t border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {QUICK_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setReplyText(prev => (prev ? `${prev} · ${chip}` : chip));
              }}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 text-[11px] font-medium text-slate-700 shrink-0 transition-colors whitespace-nowrap cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Selected Image Preview before sending */}
        {imagePreview && (
          <div className="p-3 bg-teal-50/80 border-t border-teal-200 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-teal-300 shrink-0 bg-black">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setImageCaption('');
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-teal-950 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-teal-600" />
                  <span>Clinical Photo Attached</span>
                </div>
                <input
                  type="text"
                  value={imageCaption}
                  onChange={e => setImageCaption(e.target.value)}
                  placeholder="e.g. Right forearm rash, day 3"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-teal-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Bottom Interactive Message Composer */}
        <footer className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
          {error && (
            <div className="text-[11px] text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Hidden native camera/file inputs */}
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImageSelected(file);
                e.target.value = '';
              }}
            />
            <input
              type="file"
              ref={galleryInputRef}
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImageSelected(file);
                e.target.value = '';
              }}
            />

            {/* Quick Photo Upload Buttons */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title="Take Photo with Camera"
            >
              <Camera className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title="Upload from Gallery"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Textarea input */}
            <div className="flex-1 relative">
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendReply();
                  }
                }}
                rows={1}
                placeholder="Type your reply to Dr..."
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent resize-none leading-relaxed"
              />
            </div>

            {/* Send Button */}
            <button
              type="button"
              disabled={isSending || (!replyText.trim() && !imagePreview)}
              onClick={handleSendReply}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 transition-all ${
                isSending || (!replyText.trim() && !imagePreview)
                  ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                  : 'bg-[#0b3330] hover:bg-teal-800 active:scale-95 shadow cursor-pointer'
              }`}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-1">
            <span>Tap photo icon to share rash/skin image</span>
            <span>Emergency? Call 112 / Hospital</span>
          </div>
        </footer>
      </div>

      {/* Full-screen Image Preview Modal */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div className="relative max-w-xl max-h-[85vh] w-full flex items-center justify-center">
            <img
              src={previewModalUrl}
              alt="Enlarged"
              className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewModalUrl(null)}
              className="absolute -top-10 right-0 text-white bg-white/20 hover:bg-white/30 rounded-full p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default PatientReplyPortalView;
