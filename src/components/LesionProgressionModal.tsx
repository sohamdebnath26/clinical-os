import React, { useState } from 'react';
import { Patient, ClinicalImage, ProgressionAnalysisResult } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import {
  X,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowRight,
  Check,
  Copy,
  Image as ImageIcon,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface LesionProgressionModalProps {
  patient: Patient;
  images: ClinicalImage[];
  onClose: () => void;
}

export const LesionProgressionModal: React.FC<LesionProgressionModalProps> = ({
  patient,
  images,
  onClose
}) => {
  const { doctor } = useAuth();
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  // Select baseline & follow-up images
  const [imageAId, setImageAId] = useState<string>(images.length > 1 ? images[images.length - 1].id : images[0]?.id || '');
  const [imageBId, setImageBId] = useState<string>(images[0]?.id || '');
  const [clinicalContext, setClinicalContext] = useState<string>(
    patient.currentMedications ? `Patient receiving: ${patient.currentMedications}` : ''
  );

  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ProgressionAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const imageA = images.find(img => img.id === imageAId);
  const imageB = images.find(img => img.id === imageBId);

  const handleCompare = async () => {
    if (!imageA || !imageB) {
      setErrorMsg('Please select two clinical images to compare.');
      return;
    }

    if (imageA.id === imageB.id) {
      setErrorMsg('Please select two distinct photographs (e.g. baseline visit vs follow-up).');
      return;
    }

    setIsComparing(true);
    setErrorMsg(null);

    try {
      const res = await api.ai.compareProgression({
        imageA: {
          base64: imageA.url,
          mimeType: imageA.mimeType,
          label: imageA.caption || 'Baseline',
          date: new Date(imageA.createdAt).toLocaleDateString()
        },
        imageB: {
          base64: imageB.url,
          mimeType: imageB.mimeType,
          label: imageB.caption || 'Follow-up',
          date: new Date(imageB.createdAt).toLocaleDateString()
        },
        patientId: patient.id,
        clinicalContext
      });

      setResult(res.progression);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Comparison failed';
      setErrorMsg(`AI Progression evaluation could not complete: ${msg}`);
    } finally {
      setIsComparing(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = [
      `AI CLINICAL LESION PROGRESSION ASSESSMENT`,
      `Patient: ${patient.fullName} (${patient.patientCode})`,
      `Comparison: ${imageA ? new Date(imageA.createdAt).toLocaleDateString() : 'Baseline'} -> ${imageB ? new Date(imageB.createdAt).toLocaleDateString() : 'Follow-up'}`,
      `Overall Trajectory: ${result.overallProgression} (${result.progressionScore > 0 ? `+${result.progressionScore}% healing` : `${result.progressionScore}% flare`})`,
      '',
      `MORPHOLOGICAL OBSERVATIONS:`,
      ...result.visualComparisonObservations.map(o => `• ${o}`),
      '',
      `THERAPEUTIC RESPONSE:`,
      result.treatmentResponseSummary,
      '',
      `RECOMMENDED ADJUSTMENTS:`,
      ...result.recommendedAdjustments.map(r => `• ${r}`),
      '',
      `Disclaimer: ${result.disclaimer}`
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Lesion Progression & Healing Assessment
              </h2>
              <p className="text-[11px] text-slate-400">
                Chronological side-by-side multimodal vision comparison for <strong>{patient.fullName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {images.length < 2 ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-2">
              <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
              <h4 className="text-xs font-bold text-slate-700">Need At Least Two Clinical Photos</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Chronological comparison requires at least one baseline photo and one follow-up photo in the patient's record. Please upload another photo in consultations or the Image Analyzer.
              </p>
            </div>
          ) : (
            <>
              {/* Image Selection Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Photo 1: Baseline */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      1. Baseline / Earlier Photo
                    </span>
                    {imageA && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(imageA.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <select
                    value={imageAId}
                    onChange={e => setImageAId(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  >
                    {images.map(img => (
                      <option key={img.id} value={img.id}>
                        {new Date(img.createdAt).toLocaleDateString()} — {img.caption || img.filename}
                      </option>
                    ))}
                  </select>

                  {imageA && (
                    <div className="aspect-4/3 rounded-lg overflow-hidden bg-black/5 border border-slate-200 flex items-center justify-center">
                      <img
                        src={imageA.url}
                        alt="Baseline clinical photo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Photo 2: Follow-up */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-500" />
                      2. Follow-Up / Current Photo
                    </span>
                    {imageB && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(imageB.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <select
                    value={imageBId}
                    onChange={e => setImageBId(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  >
                    {images.map(img => (
                      <option key={img.id} value={img.id}>
                        {new Date(img.createdAt).toLocaleDateString()} — {img.caption || img.filename}
                      </option>
                    ))}
                  </select>

                  {imageB && (
                    <div className="aspect-4/3 rounded-lg overflow-hidden bg-black/5 border border-slate-200 flex items-center justify-center">
                      <img
                        src={imageB.url}
                        alt="Follow-up clinical photo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Clinical Context / Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Therapy Received / Clinical Context (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Completed 14 days of topical mometasone cream and daily emollient barrier repair."
                  value={clinicalContext}
                  onChange={e => setClinicalContext(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-teal-500"
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Compare Button */}
              <button
                type="button"
                onClick={handleCompare}
                disabled={isComparing || !imageA || !imageB}
                className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
              >
                {isComparing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-teal-200" />
                    <span>Evaluating Chronological Progression...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-teal-200" />
                    <span>Compare Lesions & Evaluate Healing Response with AI</span>
                  </>
                )}
              </button>

              {/* Results Display */}
              {result && (
                <div className="p-5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        result.progressionScore >= 20
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : result.progressionScore <= -10
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {result.overallProgression}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        Progression Score: {result.progressionScore > 0 ? `+${result.progressionScore}%` : `${result.progressionScore}%`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowWhatsApp(true)}
                        className="px-2.5 py-1 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
                        title="Send Progression Report to Patient's WhatsApp"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-2xs"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Observations */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                      Visual Comparison Observations
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {result.visualComparisonObservations.map((obs, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Treatment Response */}
                  <div className="p-3 bg-white rounded-xl border border-teal-100 text-xs">
                    <span className="font-bold text-teal-900 block mb-0.5">Therapeutic Response Summary</span>
                    <p className="text-slate-700 leading-relaxed text-[11px]">{result.treatmentResponseSummary}</p>
                  </div>

                  {/* Adjustments */}
                  {result.recommendedAdjustments.length > 0 && (
                    <div className="p-3 bg-white rounded-xl border border-teal-100 text-xs">
                      <span className="font-bold text-slate-800 block mb-1">Recommended Regimen Adjustments</span>
                      <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                        {result.recommendedAdjustments.map((adj, i) => (
                          <li key={i}>{adj}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 italic">
                    {result.disclaimer}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showWhatsApp && result && (
        <WhatsAppShareModal
          isOpen={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          patient={patient}
          doctor={doctor}
          reportType="progression_report"
          data={{
            progression: result
          }}
        />
      )}
    </div>
  );
};
