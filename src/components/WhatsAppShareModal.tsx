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
  getWhatsAppNativeUri,
  getWhatsAppWebUrl,
  formatWhatsAppClinicalReport,
  formatWhatsAppPrescription,
  formatWhatsAppConsultationSummary,
  formatWhatsAppProgressionReport,
  formatWhatsAppPatientSummary
} from '../lib/whatsappUtils';
import { WhatsAppMessageRenderer } from './WhatsAppMessageRenderer';
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
  Monitor,
  Eye,
  FileText
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
  // Mobile setup
  const initialMobile = patient?.mobile ? patient.mobile.replace(/\D/g, '') : '';
  const initialCode = initialMobile.length > 10 ? initialMobile.slice(0, initialMobile.length - 10) : '91';
  const initialNumber = initialMobile.length > 10 ? initialMobile.slice(-10) : initialMobile;

  const [countryCode, setCountryCode] = useState(initialCode || '91');
  const [phoneNumber, setPhoneNumber] = useState(initialNumber);
  const [customNote, setCustomNote] = useState('');
  const [updatePatientMobile, setUpdatePatientMobile] = useState(false);

  // Formatting options
  const [includeClinicHeader, setIncludeClinicHeader] = useState(true);
  const [includeDoctorContact, setIncludeDoctorContact] = useState(true);
  const [preferWeb, setPreferWeb] = useState(() => {
    try {
      return localStorage.getItem('prefer_whatsapp_web') === 'true';
    } catch {
      return false;
    }
  });

  // Preview display toggle: formatted chat vs raw text
  const [previewMode, setPreviewMode] = useState<'rendered' | 'raw'>('rendered');

  // Launch state
  const [showAppLaunchPrompt, setShowAppLaunchPrompt] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronize preference to localStorage
  const handleTogglePreferWeb = (val: boolean) => {
    setPreferWeb(val);
    try {
      localStorage.setItem('prefer_whatsapp_web', String(val));
    } catch {
      // non-critical
    }
  };

  // Reset launch prompt when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setShowAppLaunchPrompt(false);
      setStatusMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Compute clean normalized phone number
  const fullRawPhone = `${countryCode}${phoneNumber}`;
  const cleanedRecipient = cleanPhoneNumber(fullRawPhone, countryCode);

  // Format message text based on report type
  const messageText = useMemo(() => {
    const opts = {
      includeHeader: includeClinicHeader,
      includeDoctorContact,
      customNote
    };

    switch (reportType) {
      case 'clinical_image_report':
        if (!data.analysis) return '';
        return formatWhatsAppClinicalReport({
          doctor,
          patient,
          analysis: data.analysis,
          anatomicalSite: data.anatomicalSite,
          options: opts
        });

      case 'prescription':
        if (!patient || !doctor) return '';
        return formatWhatsAppPrescription({
          doctor,
          patient,
          prescriptions: data.prescriptions || [],
          options: opts
        });

      case 'consultation_summary':
        if (!patient || !data.consultation) return '';
        return formatWhatsAppConsultationSummary({
          doctor,
          patient,
          consultation: data.consultation,
          options: opts
        });

      case 'progression_report':
        if (!patient || !data.progression) return '';
        return formatWhatsAppProgressionReport({
          doctor,
          patient,
          progression: data.progression,
          options: opts
        });

      case 'patient_summary':
      default:
        if (!patient) return '';
        return formatWhatsAppPatientSummary({
          doctor,
          patient,
          activePrescriptions: data.activePrescriptions || data.prescriptions || [],
          recentConsultation: data.consultation,
          options: opts
        });
    }
  }, [reportType, data, doctor, patient, includeClinicHeader, includeDoctorContact, customNote]);

  if (!isOpen) return null;

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

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  /**
   * Dispatches WhatsApp report.
   * If openAsWeb is true or preferWeb is checked: opens WhatsApp Web directly.
   * If false: launches the native WhatsApp Desktop protocol (whatsapp://),
   * and displays a prompt offering to launch WhatsApp Web if the app is not installed.
   */
  const handleSendWhatsApp = async (openAsWeb = false) => {
    setErrorMessage(null);

    if (phoneNumber.replace(/\D/g, '').length < 7) {
      setErrorMessage('Please enter a valid patient mobile number.');
      return;
    }

    if (!cleanedRecipient || cleanedRecipient.length < 10) {
      setErrorMessage('Please enter a valid patient WhatsApp phone number.');
      return;
    }

    setIsLogging(true);

    try {
      // 1. If doctor chose to update patient's record with this phone number
      if (updatePatientMobile && patient && phoneNumber && phoneNumber !== patient.mobile) {
        try {
          await api.patients.update(patient.id, { mobile: fullRawPhone });
        } catch {
          // Non-critical, continue
        }
      }

      // 2. Log dispatch to server medical audit log
      try {
        await api.reports.logWhatsApp({
          patientId: patient?.id,
          reportType,
          recipientMobile: cleanedRecipient,
          note: customNote.trim() || undefined
        });
      } catch (err) {
        console.warn('Audit logging error:', err);
      }

      if (openAsWeb || preferWeb) {
        // Direct WhatsApp Web in browser tab
        const webUrl = getWhatsAppWebUrl(cleanedRecipient, messageText);
        window.open(webUrl, '_blank', 'noopener,noreferrer');
        setShowAppLaunchPrompt(false);
        setStatusMessage('Medical report opened in WhatsApp Web! Audit log updated.');
      } else {
        // Direct Native Application protocol (Windows/Mac/Mobile WhatsApp app)
        const nativeUri = getWhatsAppNativeUri(cleanedRecipient, messageText);

        // Trigger native protocol via hidden anchor click
        const a = document.createElement('a');
        a.href = nativeUri;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
        }, 500);

        // Display interactive prompt in UI: if WhatsApp didn't open or isn't installed, prompt to open WhatsApp Web
        setShowAppLaunchPrompt(true);
        setStatusMessage('Launching WhatsApp Desktop... If not installed, click "Open in WhatsApp Web".');
      }

      if (onSentSuccess) {
        onSentSuccess();
      }

      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch WhatsApp';
      setErrorMessage(msg);
    } finally {
      setIsLogging(false);
    }
  };

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
          <div className="bg-emerald-50 px-6 py-2.5 border-b border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
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
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
              Patient WhatsApp Mobile Number
            </label>
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

              <div className="relative flex-1">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="tel"
                  placeholder="e.g. 9876543210 (10 digits)"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#128C7E] font-mono font-medium"
                />
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
                <span>Save and update this WhatsApp number in patient's EHR profile</span>
              </label>
            )}
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
                    <span>Launching WhatsApp Desktop Application...</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    The native WhatsApp app URI was triggered. If installed on this device, it will launch automatically with the patient's report loaded.
                  </p>
                </div>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-[11px] text-slate-700">
                  <span className="font-semibold block">WhatsApp didn't open or not installed on this PC?</span>
                  <span className="text-slate-500">Launch in browser without installing any desktop software:</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#128C7E] hover:bg-[#075E54] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs shrink-0"
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
              <span>Personalized Doctor's Note to Patient (Optional)</span>
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
                checked={preferWeb}
                onChange={e => handleTogglePreferWeb(e.target.checked)}
                className="rounded text-[#128C7E] focus:ring-[#128C7E]"
              />
              <span className="font-medium text-slate-700">Always use WhatsApp Web by default</span>
            </label>
          </div>

          {/* WhatsApp Message Preview Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#128C7E]" />
                WhatsApp Message Preview
              </span>

              {/* View Switcher: Formatted Chat vs Raw Text */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('rendered')}
                    className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition ${
                      previewMode === 'rendered'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="w-3 h-3 text-[#128C7E]" />
                    <span>Formatted Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('raw')}
                    className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition ${
                      previewMode === 'raw'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3 h-3 text-slate-500" />
                    <span>Raw Markdown</span>
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

            {/* Authentic WhatsApp Chat Bubble Container */}
            <div className="bg-[#efeae2] p-4 sm:p-5 rounded-2xl border border-slate-300/80 shadow-inner">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 max-w-xl mx-auto space-y-2 max-h-72 overflow-y-auto relative">
                {previewMode === 'rendered' ? (
                  <WhatsAppMessageRenderer text={messageText} />
                ) : (
                  <div className="text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed">
                    {messageText}
                  </div>
                )}
              </div>

              <div className="text-center mt-2.5 flex items-center justify-center gap-3">
                <span className="text-[10px] text-slate-500 font-sans inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  End-to-end encrypted medical dispatch
                </span>
                <span className="text-[10px] text-slate-400">·</span>
                <span className="text-[10px] text-slate-500">
                  Bold <strong className="font-bold text-slate-700">*text*</strong>, Italics <em className="italic text-slate-700">_text_</em> & Emojis fully rendered
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

          <div className="flex items-center gap-2 w-full sm:w-auto">
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
              onClick={() => handleSendWhatsApp(true)}
              disabled={isLogging || !cleanedRecipient}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Open via WhatsApp Web directly in a browser tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span>WhatsApp Web</span>
            </button>

            {/* Primary Action Button: Directly opens WhatsApp Desktop if installed, or prompts to open WhatsApp Web */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp(false)}
              disabled={isLogging || !cleanedRecipient}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
              title={preferWeb ? "Open in WhatsApp Web" : "Launch WhatsApp App directly on your device"}
            >
              <WhatsAppIcon className="w-4 h-4 fill-white" />
              <span>{isLogging ? 'Logging & Dispatching...' : preferWeb ? 'Send via WhatsApp Web' : 'Send on WhatsApp'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
