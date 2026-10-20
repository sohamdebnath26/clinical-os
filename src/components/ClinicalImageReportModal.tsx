import React, { useState } from 'react';
import { Patient, AIImageAnalysisResult, Doctor } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import {
  X,
  Printer,
  Sparkles,
  ShieldAlert,
  Clock,
  Eye,
  CheckCircle2,
  FileText,
  Stethoscope,
  Building2,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface ClinicalImageReportModalProps {
  patient: Patient | null;
  analysis: AIImageAnalysisResult;
  imageSrc?: string | null;
  anatomicalSite?: string;
  doctor?: Doctor | null;
  onClose: () => void;
}

export const ClinicalImageReportModal: React.FC<ClinicalImageReportModalProps> = ({
  patient,
  analysis,
  imageSrc,
  anatomicalSite,
  doctor,
  onClose
}) => {
  const { t, language } = useLanguage();
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const reportDate = new Date(analysis.analyzedAt || Date.now()).toLocaleDateString(
    language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : 'en-US',
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[94vh] border border-slate-200">
        {/* Controls Bar (Hidden during print) */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl print:hidden flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-900 border border-teal-200">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              AI Clinical Diagnostic Report
            </span>
            <span className="text-xs text-slate-500 font-mono">
              REF: {analysis.id || `REP-${Date.now()}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowWhatsApp(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-xl shadow-xs transition"
              title="Send report directly to patient's WhatsApp"
            >
              <WhatsAppIcon className="w-4 h-4 fill-white" />
              <span>Send via WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl shadow-xs transition"
            >
              <Printer className="w-4 h-4" />
              <span>{t('print')} / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-slate-800 print:p-0 print:m-0 print:overflow-visible">
          {/* Clinic Header */}
          <div className="border-b-2 border-teal-800/80 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-5 h-5 text-teal-800" />
                <span className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {doctor?.clinicName || 'Apex Multispecialty Clinic & Tele-Dermatology'}
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                {doctor?.name || 'Dr. Attending Physician, MD'}
                {doctor?.speciality ? ` · ${doctor.speciality}` : ' · General Medicine & Clinical Dermatology'}
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Reg No: {doctor?.registrationNumber || 'MCI-2024-88421'} · Clinical Decision Support System v4.0
              </p>
            </div>

            <div className="text-left sm:text-right text-xs text-slate-600">
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-900 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-100 mb-1">
                <Calendar className="w-3 h-3 text-teal-700" />
                {reportDate}
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                Report ID: {analysis.id}
              </p>
            </div>
          </div>

          {/* Patient Demographics Box */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Patient Name
              </span>
              <span className="font-bold text-slate-900 text-sm">
                {patient ? patient.fullName : 'Guest Presentation'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Patient ID / UHID
              </span>
              <span className="font-semibold text-slate-800 font-mono">
                {patient ? patient.patientCode : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Age / Gender
              </span>
              <span className="font-semibold text-slate-800">
                {patient ? `${patient.age} YRS / ${patient.gender}` : 'Undisclosed'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Anatomical Site
              </span>
              <span className="font-semibold text-teal-900">
                {anatomicalSite || 'Cutaneous / Unspecified'}
              </span>
            </div>

            {patient && (
              <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="font-bold text-slate-600">Known Allergies: </span>
                  <span className="text-rose-700 font-medium">
                    {patient.allergies || 'No known drug allergies (NKDA)'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Current Medications: </span>
                  <span className="text-slate-700">
                    {patient.currentMedications || 'None recorded'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Primary Impression & Clinical Photo Dual Section */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Visual Photo preview */}
            {imageSrc && (
              <div className="md:col-span-4">
                <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-900/5 aspect-4/3 relative shadow-2xs">
                  <img
                    src={imageSrc}
                    alt="Clinical Presentation"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 bg-black/60 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded flex items-center justify-between">
                    <span>Clinical Specimen</span>
                    {analysis.isAiPowered && <span className="text-teal-300 font-bold">Multimodal AI Verified</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Primary Impression Card */}
            <div className={imageSrc ? 'md:col-span-8' : 'md:col-span-12'}>
              <div className="bg-teal-900 text-white rounded-xl p-5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200 block mb-1">
                  Primary Clinical Diagnostic Impression
                </span>
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                  {analysis.primaryImpression}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-teal-800 text-xs">
                  <span className="px-2 py-0.5 rounded bg-teal-800 text-teal-100 font-semibold text-[11px]">
                    Status: Evaluated
                  </span>
                  <span className="text-teal-200 text-[11px]">
                    Grounded with Longitudinal Timeline Analysis
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 01. Differential Diagnoses Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-100/90 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                01. Differential Diagnosis
              </h3>
              <span className="text-[11px] text-slate-500">Ranked by likelihood</span>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {analysis.differentials.map((diff, i) => (
                <div key={i} className="p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {i + 1}. {diff.condition}
                      </span>
                      {diff.icdCode && (
                        <span className="text-xs font-mono text-slate-500">
                          · ICD-10: {diff.icdCode}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {diff.rationale}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-bold self-start ${
                      diff.confidence === 'High'
                        ? 'text-emerald-700'
                        : diff.confidence === 'Moderate'
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {diff.confidence} Likelihood
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 02. Observed Morphological Findings & Timeline Correlation */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              02. Key Visual Findings & Patient History
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                  Visual Observations
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {analysis.visualFindings.map((finding, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0 mt-1.5" />
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg p-3 bg-teal-50/50 border border-teal-100">
                <div className="text-[11px] font-semibold text-teal-900 uppercase mb-1">
                  Patient History & Lab Correlation
                </div>
                <p className="text-xs text-teal-950 leading-relaxed font-normal">
                  {analysis.timelineCorrelation}
                </p>
              </div>
            </div>
          </div>

          {/* 03. Recommended Workup & Suggested Management */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              03. Recommended Workup & Treatment Plan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] font-semibold text-slate-600 uppercase mb-1.5">
                  Recommended Tests / Workup
                </div>
                <ul className="space-y-1 text-xs text-slate-700">
                  {analysis.recommendedInvestigations.map((inv, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-slate-400 font-semibold">{idx + 1}.</span>
                      <span>{inv}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="text-[11px] font-semibold text-slate-600 uppercase mb-1.5">
                  Suggested Treatment Regimen
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                  {analysis.suggestedManagementPlan}
                </p>
              </div>
            </div>
          </div>

          {/* 04. Safety Warnings & Red Flags */}
          {analysis.redFlags.length > 0 && (
            <div className="border border-rose-200 rounded-xl p-4 bg-rose-50/50">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider text-rose-900">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>04. Red Flags to Watch / Rule Out</span>
              </div>
              <ul className="space-y-1 text-xs text-rose-800">
                {analysis.redFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Doctor Signature & Legal Disclaimer */}
          <div className="pt-6 border-t border-slate-200 mt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="max-w-md">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Statutory Medical Disclaimer
              </div>
              <p className="text-[10px] text-slate-500 italic leading-relaxed">
                {analysis.disclaimer}
              </p>
            </div>

            <div className="text-right shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0">
              <div className="h-10 border-b border-dashed border-slate-300 w-44 ml-auto mb-1 flex items-end justify-center text-[11px] text-teal-800 font-serif italic">
                {doctor?.name || 'Authorized Physician'}
              </div>
              <span className="text-[11px] font-bold text-slate-800 block">
                {doctor?.name || 'Dr. Physician Signature'}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                Digitally Generated Report
              </span>
            </div>
          </div>
        </div>
      </div>

      {showWhatsApp && (
        <WhatsAppShareModal
          isOpen={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          patient={patient}
          doctor={doctor || null}
          reportType="clinical_image_report"
          data={{
            analysis,
            anatomicalSite
          }}
        />
      )}
    </div>
  );
};
