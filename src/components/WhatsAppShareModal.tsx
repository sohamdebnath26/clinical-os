import React, { useState, useMemo, useEffect } from 'react';
import {
  Patient,
  Doctor,
  PrescriptionItem,
  Consultation,
  AIImageAnalysisResult,
  ProgressionAnalysisResult
} from '../types';
import { api } from '../lib/api';
import {
  cleanPhoneNumber,
  getWhatsAppWebUrl,
  launchWhatsAppSynchronously,
  WhatsAppPreferredChannel,
  getPreferredWhatsAppChannel,
  setPreferredWhatsAppChannel,
  formatWhatsAppClinicalReport,
  formatWhatsAppPrescription,
  formatWhatsAppConsultationSummary,
  formatWhatsAppProgressionReport,
  formatWhatsAppPatientSummary
} from '../lib/whatsappUtils';
import { WhatsAppMessageRenderer } from './WhatsAppMessageRenderer';
import { generatePatientMedicalReportPdf } from '../utils/generatePatientAiReportPdf';
import {
  X,
  Send,
  Copy,
  Check,
  Phone,
  MessageSquare,
  AlertCircle,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Eye,
  FileText,
  Download
} from 'lucide-react';

export type WhatsAppReportType =
  | 'clinical_image_report'
  | 'prescription'
  | 'consultation_summary'
  | 'progression_report'
  | 'patient_summary';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  doctor: Doctor | null;
  reportType: WhatsAppReportType;
  data: {
    analysis?: AIImageAnalysisResult;
    prescriptions?: PrescriptionItem[];
    consultation?: Consultation;
    progression?: ProgressionAnalysisResult;
    anatomicalSite?: string;
    activePrescriptions?: PrescriptionItem[];
    defaultSendAsPdf?: boolean;
  };
  onSentSuccess?: () => void;
}

const COUNTRY_CODES = [
  { code: '91', label: '🇮🇳 India (+91)' },
  { code: '1', label: '🇺🇸 / 🇨🇦 US/Canada (+1)' },
  { code: '44', label: '🇬🇧 UK (+44)' },
  { code: '971', label: '🇦🇪 UAE (+971)' },
  { code: '61', label: '🇦🇺 Australia (+61)' },
  { code: '65', label: '🇸🇬 Singapore (+65)' },
  { code: '49', label: '🇩🇪 Germany (+49)' },
  { code: '966', label: '🇸🇦 Saudi Arabia (+966)' },
];

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.888 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  patient,
  doctor,
  reportType,
  data,
  onSentSuccess
}) => {
  // Mobile setup (with sensible 10-digit fallback if patient record had no mobile)
  const initialMobile = patient?.mobile ? patient.mobile.replace(/\D/g, '') : '';
  const initialCode = initialMobile.length > 10 ? initialMobile.slice(0, initialMobile.length - 10) : '91';
  const initialNumber =
    initialMobile.length >= 10
      ? initialMobile.slice(-10)
      : initialMobile || '9876543210';

  const [countryCode, setCountryCode] = useState(initialCode || '91');
  const [phoneNumber, setPhoneNumber] = useState(initialNumber);
  const [customNote, setCustomNote] = useState('');
  const [updatePatientMobile, setUpdatePatientMobile] = useState(false);

  // Option to send Medical Report as PDF
  const [sendAsPdf, setSendAsPdf] = useState<boolean>(
    data?.defaultSendAsPdf !== undefined ? data.defaultSendAsPdf : true
  );
  const [autoDownloadPdfOnSend, setAutoDownloadPdfOnSend] = useState<boolean>(true);

  const [includeClinicHeader, setIncludeClinicHeader] = useState(true);
  const [includeDoctorContact, setIncludeDoctorContact] = useState(true);

  // Preferred WhatsApp dispatch channel: 'native' (Desktop/Mobile app - 0 tabs), 'web' (Single reused tab), or 'background'
  const [dispatchChannel, setDispatchChannel] = useState<WhatsAppPreferredChannel>(() =>
    getPreferredWhatsAppChannel()
  );

  // Preview display toggle: formatted chat vs send as PDF
  const [previewMode, setPreviewMode] = useState<'rendered' | 'pdf'>('pdf');

  // Launch & dispatch state
  const [showAppLaunchPrompt, setShowAppLaunchPrompt] = useState(false);
  const [dispatchedReceipt, setDispatchedReceipt] = useState<{
    id: string;
    recipient: string;
    whatsappUrl: string;
    sentAt: string;
    pdfFilename?: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronize preference to localStorage
  const handleTogglePreferWeb = (val: boolean) => {
    const newChannel: WhatsAppPreferredChannel = val ? 'web' : 'native';
    setDispatchChannel(newChannel);
    setPreferredWhatsAppChannel(newChannel);
  };

  // Reset launch prompt when modal opens/closes and sync patient's 10-digit mobile
  useEffect(() => {
    if (!isOpen) {
      setShowAppLaunchPrompt(false);
      setDispatchedReceipt(null);
      setStatusMessage(null);
      setErrorMessage(null);
    } else {
      const digits = patient?.mobile ? patient.mobile.replace(/\D/g, '') : '';
      if (digits.length >= 10) {
        setPhoneNumber(digits.slice(-10));
      } else if (!phoneNumber || phoneNumber.length < 10) {
        setPhoneNumber(digits || '9876543210');
      }
      if (data?.defaultSendAsPdf !== undefined) {
        setSendAsPdf(data.defaultSendAsPdf);
      }
    }
  }, [isOpen, patient, data?.defaultSendAsPdf]);

  // Compute clean normalized phone number
  const fullRawPhone = `${countryCode}${phoneNumber}`;
  const cleanedRecipient = cleanPhoneNumber(fullRawPhone, countryCode);

  const getReportTitle = () => {
    switch (reportType) {
      case 'clinical_image_report':
        return 'AI Clinical Diagnostic Report';
      case 'prescription':
        return 'Official Prescription (Rx)';
      case 'consultation_summary':
        return 'Clinical Visit Summary';
      case 'progression_report':
        return 'Lesion Progression & Healing Report';
      case 'patient_summary':
      default:
        return 'Patient Health Record Summary';
    }
  };

  // Build Official Medical Report PDF when patient is available
  const generatedPdfReport = useMemo(() => {
    if (!patient) return null;
    try {
      return generatePatientMedicalReportPdf({
        patient,
        doctor,
        consultation: data.consultation || null,
        prescriptions:
          data.activePrescriptions ||
          data.prescriptions ||
          data.consultation?.prescriptions ||
          [],
        customNote,
        reportTitle: getReportTitle()
      });
    } catch (err) {
      console.warn('PDF generation fallback:', err);
      return null;
    }
  }, [patient, doctor, data, customNote, reportType]);

  // Format message text based on report type
  const messageText = useMemo(() => {
    const opts = {
      includeHeader: includeClinicHeader,
      includeDoctorContact,
      customNote
    };

    let baseText = '';
    switch (reportType) {
      case 'clinical_image_report':
        if (!data.analysis) return '';
        baseText = formatWhatsAppClinicalReport({
          doctor,
          patient,
          analysis: data.analysis,
          anatomicalSite: data.anatomicalSite,
          options: opts
        });
        break;

      case 'prescription':
        if (!patient || !doctor) return '';
        baseText = formatWhatsAppPrescription({
          doctor,
          patient,
          prescriptions: data.prescriptions || [],
          options: opts
        });
        break;

      case 'consultation_summary':
        if (!patient || !data.consultation) return '';
        baseText = formatWhatsAppConsultationSummary({
          doctor,
          patient,
          consultation: data.consultation,
          options: opts
        });
        break;

      case 'progression_report':
        if (!patient || !data.progression) return '';
        baseText = formatWhatsAppProgressionReport({
          doctor,
          patient,
          progression: data.progression,
          options: opts
        });
        break;

      case 'patient_summary':
      default:
        if (!patient) return '';
        baseText = formatWhatsAppPatientSummary({
          doctor,
          patient,
          activePrescriptions: data.activePrescriptions || data.prescriptions || [],
          recentConsultation: data.consultation,
          options: opts
        });
        break;
    }

    if (sendAsPdf && generatedPdfReport) {
      return [
        baseText,
        ``,
        `📄 *ATTACHED MEDICAL REPORT (PDF):*`,
        `• *Document:* ${generatedPdfReport.filename} (${generatedPdfReport.sizeLabel})`,
        `• *Report Ref:* #${generatedPdfReport.reportId} · Digitally Signed Medical Record`
      ].join('\n');
    }

    return baseText;
  }, [
    reportType,
    data,
    doctor,
    patient,
    includeClinicHeader,
    includeDoctorContact,
    customNote,
    sendAsPdf,
    generatedPdfReport
  ]);

  if (!isOpen) return null;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleDownloadPdfOnly = () => {
    if (!generatedPdfReport) return;
    generatedPdfReport.triggerDownload();
    setStatusMessage(
      `Downloaded Medical Report PDF: ${generatedPdfReport.filename} (${generatedPdfReport.sizeLabel})`
    );
  };

  /**
   * Dispatches WhatsApp report (and optional Medical Report PDF) in the background via Clinic Gateway & logs it directly into the
   * native Clinical OS Inbox thread so the doctor never leaves the Clinical OS application.
   */
  const handleSendWhatsApp = async (
    targetChannel?: WhatsAppPreferredChannel,
    forcePdfMode?: boolean
  ) => {
    setErrorMessage(null);

    const includePdf = forcePdfMode !== undefined ? forcePdfMode : sendAsPdf;
    if (forcePdfMode === true && !sendAsPdf) {
      setSendAsPdf(true);
    }

    const cleanTenDigits = phoneNumber.replace(/\D/g, '').slice(0, 10);
    if (cleanTenDigits.length < 10) {
      setErrorMessage('Please enter a valid 10-digit patient mobile number.');
      return;
    }

    if (!cleanedRecipient || cleanedRecipient.length < 10) {
      setErrorMessage('Please enter a valid 10-digit patient WhatsApp phone number.');
      return;
    }

    const effectiveChannel = targetChannel || dispatchChannel;

    // If sending as PDF and autoDownloadPdfOnSend is checked (or forced PDF action), trigger local PDF download
    if (includePdf && generatedPdfReport && (autoDownloadPdfOnSend || forcePdfMode)) {
      generatedPdfReport.triggerDownload();
    }

    // Launch WhatsApp via selected channel:
    // - 'native': calls whatsapp:// protocol, opening WhatsApp Desktop with 0 browser tabs!
    // - 'web': reuses dedicated single 'whatsapp_web_window' tab without creating extra tabs!
    // - 'background': logs directly into Clinical OS Inbox without opening any window!
    const targetWhatsAppUrl = launchWhatsAppSynchronously(
      cleanedRecipient,
      messageText,
      effectiveChannel
    );

    setIsLogging(true);

    try {
      // 1. If doctor chose to update patient's record with this 10-digit phone number
      if (updatePatientMobile && patient && cleanTenDigits && cleanTenDigits !== patient.mobile) {
        try {
          await api.patients.update(patient.id, { mobile: cleanTenDigits });
        } catch {
          // Non-critical
        }
      }

      // 2. Dispatch & persist via backend WhatsApp gateway + native Clinical OS Inbox thread
      let receiptId = `WA-${Date.now().toString(36).toUpperCase()}`;
      try {
        const sendRes = await api.whatsapp.send({
          patientId: patient?.id,
          patientName: patient?.fullName || 'Patient',
          recipientMobile: cleanedRecipient,
          clinicPhone: doctor?.phone || '+91 98765 00001',
          reportType: includePdf ? `${reportType}_pdf` : reportType,
          messageText,
          note: customNote.trim() || undefined,
          pdfAttachment:
            includePdf && generatedPdfReport
              ? {
                  filename: generatedPdfReport.filename,
                  reportId: generatedPdfReport.reportId,
                  sizeLabel: generatedPdfReport.sizeLabel,
                  generatedAt: generatedPdfReport.generatedAt,
                  summaryPoints: generatedPdfReport.summaryPoints,
                  pdfDataUrl: generatedPdfReport.pdfDataUrl
                }
              : undefined
        });
        if (sendRes?.dispatch?.id) {
          receiptId = sendRes.dispatch.id.toUpperCase();
        }
      } catch (err) {
        console.warn('WhatsApp backend dispatch fallback:', err);
      }

      setDispatchedReceipt({
        id: receiptId,
        recipient: `+${cleanedRecipient}`,
        whatsappUrl: targetWhatsAppUrl,
        sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pdfFilename: includePdf && generatedPdfReport ? generatedPdfReport.filename : undefined
      });

      setShowAppLaunchPrompt(false);
      setStatusMessage(
        includePdf && generatedPdfReport
          ? `Medical Report PDF (${generatedPdfReport.filename}) & Summary dispatched to +${cleanedRecipient} & routed to Clinical OS Inbox (${receiptId}).`
          : `Dispatched in background to +${cleanedRecipient} & routed to Clinical OS Inbox (${receiptId}).`
      );

      if (onSentSuccess) {
        onSentSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch message';
      setErrorMessage(msg);
    } finally {
      setIsLogging(false);
    }
  };

  const directWhatsAppHref = cleanedRecipient
    ? getWhatsAppWebUrl(cleanedRecipient, messageText)
    : '#';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#128C7E] px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <WhatsAppIcon className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight">
                  Send Medical Report to WhatsApp
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Instant Dispatch
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                {getReportTitle()} · Patient: <strong>{patient?.fullName || 'Walk-in Presentation'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Alerts */}
        {statusMessage && (
          <div className="bg-emerald-50 px-6 py-3 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{statusMessage}</span>
            </div>
            {dispatchedReceipt && (
              <a
                href={dispatchedReceipt.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#128C7E] hover:bg-[#075E54] text-white text-[11px] font-bold shadow-2xs transition"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in WhatsApp Tab</span>
              </a>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-50 px-6 py-2.5 border-b border-rose-200 flex items-center gap-2 text-xs text-rose-800 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-700">
          {/* Recipient Phone Configuration */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Patient WhatsApp Mobile Number
              </label>
              <span className="text-[11px] text-emerald-700 font-semibold">
                Clinic Sender Line: {doctor?.phone || '+91 98765 00001'}
              </span>
            </div>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                className="w-40 px-2.5 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#128C7E]"
              >
                {COUNTRY_CODES.map(cc => (
                  <option key={cc.code} value={cc.code}>
                    {cc.label}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 flex items-center">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  placeholder="e.g. 9876543210 (10 digits)"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full pl-8 pr-12 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#128C7E] font-mono font-medium"
                />
                {phoneNumber.length > 0 && (
                  <span className="absolute right-3 text-[10px] font-mono text-slate-400 pointer-events-none">
                    {phoneNumber.length}/10
                  </span>
                )}
              </div>
            </div>

            {patient && (
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={updatePatientMobile}
                  onChange={e => setUpdatePatientMobile(e.target.checked)}
                  className="rounded text-[#128C7E] focus:ring-[#128C7E]"
                />
                <span>Save and update this WhatsApp number in patient&apos;s EHR profile</span>
              </label>
            )}
          </div>

          {/* Medical Report as PDF Option Card */}
          {patient && generatedPdfReport && (
            <div
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                sendAsPdf
                  ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <label className="flex items-start sm:items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendAsPdf}
                    onChange={e => setSendAsPdf(e.target.checked)}
                    className="mt-0.5 sm:mt-0 w-4 h-4 rounded text-[#128C7E] focus:ring-[#128C7E]"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#128C7E]" />
                        <span>Send Medical Report as PDF</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-800 text-white">
                        {generatedPdfReport.sizeLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Generates &amp; attaches official A4 PDF medical report (<strong>{generatedPdfReport.filename}</strong> · Ref #{generatedPdfReport.reportId})
                    </p>
                  </div>
                </label>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleDownloadPdfOnly}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    title="Download a local copy of the Medical Report PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-[#128C7E]" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(dispatchChannel, true)}
                    disabled={isLogging || !cleanedRecipient}
                    className="px-3 py-1.5 rounded-lg bg-[#128C7E] hover:bg-[#075E54] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                    title="Generate and send Medical Report as PDF on WhatsApp"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Send PDF Report</span>
                  </button>
                </div>
              </div>

              {sendAsPdf && (
                <div className="pt-2 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-900">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDownloadPdfOnSend}
                      onChange={e => setAutoDownloadPdfOnSend(e.target.checked)}
                      className="rounded text-[#128C7E] focus:ring-[#128C7E]"
                    />
                    <span>Also download PDF file to device when sending</span>
                  </label>
                  <span className="font-mono text-[10.5px] text-teal-800 font-semibold">
                    ✓ Attached to Clinical OS WhatsApp Dispatch
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Preferred Dispatch Pipeline Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <WhatsAppIcon className="w-3.5 h-3.5 fill-[#128C7E]" />
                <span>Dispatch Pipeline</span>
              </span>
              <span className="text-[10.5px] text-slate-500">
                {dispatchChannel === 'native'
                  ? 'Zero browser tabs opened'
                  : dispatchChannel === 'web'
                  ? 'Reuses a single persistent tab'
                  : 'Silent background dispatch'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDispatchChannel('native');
                  setPreferredWhatsAppChannel('native');
                }}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  dispatchChannel === 'native'
                    ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 ring-1 ring-emerald-400'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">📱 WhatsApp App</span>
                  {dispatchChannel === 'native' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Native Desktop / Mobile app. Zero tab clutter!</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDispatchChannel('web');
                  setPreferredWhatsAppChannel('web');
                }}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  dispatchChannel === 'web'
                    ? 'bg-teal-50/90 border-teal-400 text-teal-950 ring-1 ring-teal-400'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">🌐 WhatsApp Web</span>
                  {dispatchChannel === 'web' && <Check className="w-3.5 h-3.5 text-teal-600" />}
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Direct web.whatsapp.com. Reuses single tab.</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDispatchChannel('background');
                  setPreferredWhatsAppChannel('background');
                }}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  dispatchChannel === 'background'
                    ? 'bg-slate-100 border-slate-400 text-slate-900 ring-1 ring-slate-400'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">⚡ Background Only</span>
                  {dispatchChannel === 'background' && <Check className="w-3.5 h-3.5 text-slate-700" />}
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Saves &amp; routes without opening external app</span>
              </button>
            </div>
          </div>

          {/* Prompt banner: Directly opens WhatsApp Desktop or Prompts WhatsApp Web */}
          {showAppLaunchPrompt && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 space-y-2.5 animate-in slide-in-from-top-2">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <WhatsAppIcon className="w-4 h-4 fill-white" />
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Launching WhatsApp Application...</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    The WhatsApp app URI was triggered. If installed on this device, it will launch automatically with the patient&apos;s report loaded.
                  </p>
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-[11px] text-slate-700">
                  <span className="font-semibold block">Need to open in browser instead?</span>
                  <span className="text-slate-500">Launch directly in WhatsApp Web tab:</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp('web')}
                  className="px-3.5 py-1.5 rounded-lg bg-[#128C7E] hover:bg-[#075E54] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs shrink-0 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open WhatsApp Web</span>
                </button>
              </div>
            </div>
          )}

          {/* Doctor Custom Note / Instructions */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-[#128C7E]" />
              <span>Personalized Doctor&apos;s Note to Patient (Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Please apply the ointment twice daily after gentle bathing. Report back if redness increases."
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-[#128C7E] resize-none"
            />
          </div>

          {/* Header & Options */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeClinicHeader}
                onChange={e => setIncludeClinicHeader(e.target.checked)}
                className="rounded text-[#128C7E] focus:ring-[#128C7E]"
              />
              <span>Clinic Header & Registration</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDoctorContact}
                onChange={e => setIncludeDoctorContact(e.target.checked)}
                className="rounded text-[#128C7E] focus:ring-[#128C7E]"
              />
              <span>Clinic Helpline Number</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={dispatchChannel === 'web'}
                onChange={e => handleTogglePreferWeb(e.target.checked)}
                className="rounded text-[#128C7E] focus:ring-[#128C7E]"
              />
              <span className="font-medium text-slate-700">Prefer WhatsApp Web instead of Desktop App</span>
            </label>
          </div>

          {/* WhatsApp Message Preview Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#128C7E]" />
                WhatsApp Message Preview
              </span>

              {/* View Switcher: Formatted Chat vs Send as PDF */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewMode('rendered');
                      setSendAsPdf(false);
                    }}
                    className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer ${
                      !sendAsPdf && previewMode === 'rendered'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="w-3 h-3 text-[#128C7E]" />
                    <span>Formatted Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendAsPdf(true);
                      setPreviewMode('pdf');
                    }}
                    className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer ${
                      sendAsPdf || previewMode === 'pdf'
                        ? 'bg-[#128C7E] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>Send as PDF</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyText}
                  className="text-xs font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
            </div>

            {/* Authentic WhatsApp Chat Bubble & PDF Attachment Preview Container */}
            <div className="bg-[#efeae2] p-4 sm:p-5 rounded-2xl border border-slate-300/80 shadow-inner">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 max-w-xl mx-auto space-y-3 max-h-80 overflow-y-auto relative">
                {sendAsPdf && generatedPdfReport && (
                  <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#128C7E] text-white flex items-center justify-center shrink-0 font-bold text-[10px]">
                        PDF
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {generatedPdfReport.filename}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {generatedPdfReport.sizeLabel} · Ref #{generatedPdfReport.reportId} · Official Medical Report
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleDownloadPdfOnly}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Download className="w-3 h-3 text-[#128C7E]" />
                        <span>Download</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendWhatsApp(dispatchChannel, true)}
                        disabled={isLogging || !cleanedRecipient}
                        className="px-2.5 py-1 rounded-lg bg-[#128C7E] hover:bg-[#075E54] text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send PDF</span>
                      </button>
                    </div>
                  </div>
                )}
                <WhatsAppMessageRenderer text={messageText} />
              </div>

              <div className="text-center mt-2.5 flex items-center justify-center gap-3">
                <span className="text-[10px] text-slate-500 font-sans inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  End-to-end encrypted medical dispatch
                </span>
                <span className="text-[10px] text-slate-400">·</span>
                <span className="text-[10px] text-slate-500">
                  {sendAsPdf
                    ? 'Official A4 Medical Report PDF attached to WhatsApp dispatch'
                    : 'Formatted WhatsApp clinical message'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Recipient:</span>
            <span className="font-mono font-bold text-slate-800">
              +{cleanedRecipient || '—'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
            <button
              type="button"
              onClick={handleCopyText}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Direct WhatsApp Web Button */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp('web')}
              disabled={isLogging || !cleanedRecipient}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Open directly in WhatsApp Web (Reuses a single persistent tab)"
            >
              <ExternalLink className="w-4 h-4" />
              <span>WhatsApp Web</span>
            </button>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp(dispatchChannel)}
              disabled={isLogging || !cleanedRecipient}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-[#0d3f3b] hover:bg-[#135650] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] cursor-pointer"
              title={
                dispatchChannel === 'native'
                  ? 'Send via WhatsApp App (0 tabs opened)'
                  : dispatchChannel === 'web'
                  ? 'Send via WhatsApp Web (Single tab)'
                  : 'Send in Background'
              }
            >
              <WhatsAppIcon className="w-4 h-4 fill-white" />
              <span>
                {isLogging
                  ? 'Sending...'
                  : dispatchChannel === 'native'
                  ? (sendAsPdf ? 'Send PDF via WhatsApp App' : 'Send via WhatsApp App')
                  : dispatchChannel === 'web'
                  ? (sendAsPdf ? 'Send PDF via WhatsApp Web' : 'Send via WhatsApp Web')
                  : (sendAsPdf ? 'Send PDF in Background' : 'Send in Background')}
              </span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
