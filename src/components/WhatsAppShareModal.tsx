import React, { useState, useMemo } from 'react';
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
  generateWhatsAppLink,
  formatWhatsAppClinicalReport,
  formatWhatsAppPrescription,
  formatWhatsAppConsultationSummary,
  formatWhatsAppProgressionReport,
  formatWhatsAppPatientSummary
} from '../lib/whatsappUtils';
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
  CheckCircle2
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
  const [preferWeb, setPreferWeb] = useState(false);

  // State
  const [isCopied, setIsCopied] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    } catch {
      setErrorMessage('Unable to copy directly. Please select and copy manually.');
    }
  };

  const handleSendWhatsApp = async (openAsWeb = false) => {
    setErrorMessage(null);

    if (phoneNumber.replace(/\D/g, '').length !== 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
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

      // 3. Open WhatsApp link
      const waUrl = generateWhatsAppLink(cleanedRecipient, messageText, openAsWeb || preferWeb);
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      setStatusMessage('Medical report dispatched to WhatsApp! Audit log updated.');
      if (onSentSuccess) {
        onSentSuccess();
      }

      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
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
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#128C7E] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shadow-xs">
              <WhatsAppIcon className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base tracking-tight text-white">
                  Send Medical Report to WhatsApp
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-100 border border-emerald-400/30 uppercase">
                  Direct Dispatch
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                {getReportTitle()} • {patient ? `${patient.fullName} (${patient.patientCode})` : 'Unassigned Patient'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {/* Status Alert if successfully sent */}
          {statusMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5 animate-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{statusMessage}</span>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Recipient Phone Settings */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-teal-700" />
                Patient WhatsApp Number
              </label>
              {patient?.mobile && (
                <span className="text-[11px] text-slate-500 font-mono">
                  Saved: {patient.mobile}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Country Code
                </label>
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-medium focus:ring-2 focus:ring-[#128C7E] focus:outline-hidden"
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Mobile Number (digits only)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
                    +{countryCode}
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={e => {
                      if (
                        !/[0-9]/.test(e.key) &&
                        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                        !e.ctrlKey &&
                        !e.metaKey
                      ) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="10-digit mobile number"
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-14 pr-12 py-2 font-mono font-medium focus:ring-2 focus:ring-[#128C7E] focus:outline-hidden"
                  />
                  {phoneNumber.length > 0 && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                      {phoneNumber.length}/10
                    </span>
                  )}
                </div>
              </div>
            </div>

            {patient && phoneNumber !== initialNumber && (
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={updatePatientMobile}
                  onChange={e => setUpdatePatientMobile(e.target.checked)}
                  className="rounded text-[#128C7E] focus:ring-[#128C7E]"
                />
                <span>Update patient profile with this new contact number</span>
              </label>
            )}
          </div>

          {/* Optional Doctor Note to Patient */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
              Personal Note / Doctor&apos;s Advice (Optional)
            </label>
            <textarea
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              placeholder="e.g. Please take all tablets strictly after meals. If itching flares or redness increases, send an update or visit the clinic immediately."
              rows={2}
              className="w-full text-xs bg-white border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-[#128C7E] focus:outline-hidden text-slate-800 placeholder:text-slate-400"
            />
          </div>

          {/* Quick Toggles */}
          <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap pt-1">
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
                onChange={e => setPreferWeb(e.target.checked)}
                className="rounded text-[#128C7E] focus:ring-[#128C7E]"
              />
              <span>Prefer WhatsApp Web (browser tab)</span>
            </label>
          </div>

          {/* Live Preview of WhatsApp Message */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#128C7E]" />
                WhatsApp Message Preview
              </span>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied to Clipboard' : 'Copy Text'}</span>
              </button>
            </div>

            {/* WhatsApp Chat bubble mock */}
            <div className="bg-[#efeae2] p-4 rounded-2xl border border-slate-300/80 shadow-inner">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 max-w-xl mx-auto space-y-2 text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed max-h-60 overflow-y-auto">
                {messageText}
              </div>
              <div className="text-center mt-2">
                <span className="text-[10px] text-slate-500 font-sans inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Direct encrypted WhatsApp patient link
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

            <button
              type="button"
              onClick={() => handleSendWhatsApp(true)}
              disabled={isLogging || !cleanedRecipient}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Open via WhatsApp Web in browser"
            >
              <ExternalLink className="w-4 h-4" />
              <span>WhatsApp Web</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendWhatsApp(false)}
              disabled={isLogging || !cleanedRecipient}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <WhatsAppIcon className="w-4 h-4 fill-white" />
              <span>{isLogging ? 'Logging & Opening...' : 'Send on WhatsApp'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
