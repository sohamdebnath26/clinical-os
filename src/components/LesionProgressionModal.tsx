import React, { useState } from 'react';
import { Patient, ClinicalImage, ProgressionAnalysisResult } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { VoiceDictationButton } from './VoiceDictationButton';
import { FullScreenSideBySideModal, ImageAreaAnnotation } from './FullScreenSideBySideModal';
import {
  X,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Check,
  Copy,
  Image as ImageIcon,
  AlertCircle,
  AlertTriangle,
  Maximize2,
  Pencil,
  RotateCcw,
  ChevronRight
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
  const [showFullScreenSideBySide, setShowFullScreenSideBySide] = useState(false);

  // Select first image from earlier visit & latest visit
  const sortedImages = [...images].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const [imageAId, setImageAId] = useState<string>(sortedImages[0]?.id || '');
  const [imageBId, setImageBId] = useState<string>(
    sortedImages.length > 1 ? sortedImages[sortedImages.length - 1].id : sortedImages[0]?.id || ''
  );
  const [clinicalContext, setClinicalContext] = useState<string>(
    patient.currentMedications ? `Patient receiving: ${patient.currentMedications}` : ''
  );
  const [annotations, setAnnotations] = useState<ImageAreaAnnotation[]>([]);

  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ProgressionAnalysisResult | null>(null);
  const [editableSummary, setEditableSummary] = useState<string>('');
  const [isEditingSummary, setIsEditingSummary] = useState<boolean>(true);
  const [severityStatus, setSeverityStatus] = useState<
    'Severity Increased' | 'Severity Decreased (Improving)' | 'Severity Stable'
  >('Severity Decreased (Improving)');
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
      const markedText = annotations
        .map((a, i) => `#${i + 1} [Visit ${a.side}] ${a.label}`)
        .join('; ');
      const combinedContext = [
        clinicalContext.trim(),
        markedText ? `Doctor Marked Areas: ${markedText}` : ''
      ]
        .filter(Boolean)
        .join('. ');

      const res = await api.ai.compareProgression({
        imageA: {
          base64: imageA.url,
          mimeType: imageA.mimeType,
          label: imageA.caption || 'Visit 1 · First Image',
          date: new Date(imageA.createdAt).toLocaleDateString()
        },
        imageB: {
          base64: imageB.url,
          mimeType: imageB.mimeType,
          label: imageB.caption || 'Visit 2 · First Image',
          date: new Date(imageB.createdAt).toLocaleDateString()
        },
        patientId: patient.id,
        clinicalContext: combinedContext
      });

      setResult(res.progression);
      const isWorse =
        res.progression.progressionScore < -5 ||
        res.progression.overallProgression.toLowerCase().includes('worsen') ||
        res.progression.overallProgression.toLowerCase().includes('flare');
      const isStable = Math.abs(res.progression.progressionScore) <= 5;
      const computedSev = isWorse
        ? 'Severity Increased'
        : isStable
        ? 'Severity Stable'
        : 'Severity Decreased (Improving)';
      setSeverityStatus(computedSev);

      const initialDraft =
        `${res.progression.treatmentResponseSummary}` +
        (clinicalContext.trim() ? ` Clinical Note: ${clinicalContext.trim()}.` : '') +
        (annotations.length > 0 ? ` Marked ROI areas: ${markedText}.` : '');
      setEditableSummary(initialDraft);
      setIsEditingSummary(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Comparison failed';
      setErrorMsg(`AI Progression evaluation could not complete: ${msg}`);
    } finally {
      setIsComparing(false);
    }
  };

  const handleInsertPointer = (textToInsert: string) => {
    setEditableSummary(prev => {
      const clean = prev.trim();
      if (!clean) return textToInsert;
      return `${clean}${/[.!?]$/.test(clean) ? '' : '.'} ${textToInsert}`;
    });
    setIsEditingSummary(true);
  };

  const handleCopy = () => {
    if (!result) return;
    const text = [
      `CLINICAL VISIT & LESION PROGRESSION SUMMARY`,
      `Patient: ${patient.fullName} (${patient.patientCode})`,
      `Comparison: ${imageA ? new Date(imageA.createdAt).toLocaleDateString() : 'Visit 1'} -> ${imageB ? new Date(imageB.createdAt).toLocaleDateString() : 'Visit 2'}`,
      `Severity Status: ${severityStatus} (${result.overallProgression})`,
      '',
      `DOCTOR'S SUMMARY:`,
      editableSummary || result.treatmentResponseSummary,
      '',
      `MORPHOLOGICAL OBSERVATIONS:`,
      ...result.visualComparisonObservations.map(o => `• ${o}`),
      '',
      `RECOMMENDED ADJUSTMENTS:`,
      ...result.recommendedAdjustments.map(r => `• ${r}`)
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const derivedRedFlags =
    severityStatus === 'Severity Increased'
      ? [
          'Severity increased between visits — rule out secondary bacterial superinfection or contact sensitization.',
          'Evaluate peripheral border expansion with polarized dermoscopy.'
        ]
      : [
          'Monitor for rebound erythema upon stepping down topical corticosteroid potency.',
          'Watch for secondary impetiginization or barrier breakdown if pruritus recurs.'
        ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Visit Image Comparison &amp; Progression Model
              </h2>
              <p className="text-[11px] text-slate-400">
                Full-screen side-by-side zoom &amp; area marking, voice notes, and editable visit summary for <strong>{patient.fullName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {images.length >= 2 && (
              <button
                type="button"
                onClick={() => setShowFullScreenSideBySide(true)}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Screen Side-by-Side (Zoom &amp; Mark)</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {images.length < 2 ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-2">
              <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
              <h4 className="text-xs font-bold text-slate-700">Need At Least Two Clinical Photos</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Chronological comparison requires at least one baseline photo and one follow-up photo in the patient&apos;s record.
              </p>
            </div>
          ) : (
            <>
              {/* 1. First Images from Each Visit Side-by-Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Photo 1: Visit A */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Visit 1 · First / Baseline Image
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
                    {sortedImages.map((img, i) => (
                      <option key={img.id} value={img.id}>
                        Visit Image #{i + 1} ({new Date(img.createdAt).toLocaleDateString()}) — {img.caption || img.filename}
                      </option>
                    ))}
                  </select>

                  {imageA && (
                    <div
                      onClick={() => setShowFullScreenSideBySide(true)}
                      className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group cursor-pointer"
                    >
                      <img
                        src={imageA.url}
                        alt="Baseline clinical photo"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setShowFullScreenSideBySide(true);
                        }}
                        className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-900/90 hover:bg-black text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/15"
                      >
                        <Maximize2 className="w-3 h-3 text-teal-300" />
                        <span>Full Screen Zoom &amp; Mark</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Photo 2: Visit B */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Visit 2 · Follow-Up Image
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
                    {sortedImages.map((img, i) => (
                      <option key={img.id} value={img.id}>
                        Visit Image #{i + 1} ({new Date(img.createdAt).toLocaleDateString()}) — {img.caption || img.filename}
                      </option>
                    ))}
                  </select>

                  {imageB && (
                    <div
                      onClick={() => setShowFullScreenSideBySide(true)}
                      className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group cursor-pointer"
                    >
                      <img
                        src={imageB.url}
                        alt="Follow-up clinical photo"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setShowFullScreenSideBySide(true);
                        }}
                        className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-900/90 hover:bg-black text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/15"
                      >
                        <Maximize2 className="w-3 h-3 text-teal-300" />
                        <span>Full Screen Zoom &amp; Mark</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Marked Areas Badge Row */}
              {annotations.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                      Marked Areas ({annotations.length}):
                    </span>
                    {annotations.map((m, idx) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px]"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                        <span>
                          #{idx + 1} [Visit {m.side}] {m.label}
                        </span>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullScreenSideBySide(true)}
                    className="text-[11px] font-semibold text-teal-300 hover:underline"
                  >
                    Adjust Markings →
                  </button>
                </div>
              )}

              {/* 3. Clinical Notes with Mic Dictation Option */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800">
                    Clinical Comparison Notes (with Voice Dictation / Mic)
                  </label>
                  <VoiceDictationButton
                    value={clinicalContext}
                    onChange={setClinicalContext}
                    variant="prominent"
                    label="Dictate Note (Mic)"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Type or click 'Dictate Note (Mic)' to speak clinical notes for this visit comparison..."
                  value={clinicalContext}
                  onChange={e => setClinicalContext(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* 4. Generate Summary Button */}
              <button
                type="button"
                onClick={handleCompare}
                disabled={isComparing || !imageA || !imageB}
                className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
              >
                {isComparing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-teal-200" />
                    <span>Generating Visit Comparison Summary...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-teal-200" />
                    <span>Generate Visit Summary &amp; Minor AI Suggestions</span>
                  </>
                )}
              </button>

              {/* Results Display with Minor AI Suggestions & Editable Summary */}
              {result && (
                <div className="p-5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(
                        [
                          'Severity Increased',
                          'Severity Stable',
                          'Severity Decreased (Improving)'
                        ] as const
                      ).map(sev => {
                        const active = severityStatus === sev;
                        const isInc = sev === 'Severity Increased';
                        const isDec = sev === 'Severity Decreased (Improving)';
                        return (
                          <button
                            key={sev}
                            type="button"
                            onClick={() => {
                              setSeverityStatus(sev);
                              handleInsertPointer(`[${sev}]`);
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 transition ${
                              active
                                ? isInc
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : isDec
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {isInc ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : isDec ? (
                              <TrendingDown className="w-3.5 h-3.5" />
                            ) : null}
                            <span>{sev}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowWhatsApp(true)}
                        className="px-2.5 py-1 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition"
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

                  {/* Minor AI Suggestions: Red Flags & Quick Pointers */}
                  <div className="p-3 bg-white rounded-xl border border-teal-100 space-y-2.5 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Minor AI Red Flag &amp; Clinical Pointers (Click to insert into summary):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {derivedRedFlags.map((rf, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleInsertPointer(`Red Flag: ${rf}`)}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] text-rose-900 flex items-center gap-1.5 transition"
                        >
                          <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{rf}</span>
                          <span className="font-bold text-rose-700 ml-1">+ Add</span>
                        </button>
                      ))}
                      {result.recommendedAdjustments.map((adj, i) => (
                        <button
                          key={`adj_${i}`}
                          type="button"
                          onClick={() => handleInsertPointer(adj)}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-[11px] text-teal-950 flex items-center gap-1.5 transition"
                        >
                          <ChevronRight className="w-3 h-3 text-teal-700 shrink-0" />
                          <span>{adj}</span>
                          <span className="font-bold text-teal-800 ml-1">+ Add</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Doctor Editable Summary */}
                  <div className="p-3.5 bg-white rounded-xl border border-teal-200 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-teal-950 flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-teal-700" />
                        <span>Doctor&apos;s Editable Visit Summary</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <VoiceDictationButton
                          value={editableSummary}
                          onChange={setEditableSummary}
                          variant="button"
                          label="Mic Edit"
                        />
                        <button
                          type="button"
                          onClick={() => setIsEditingSummary(!isEditingSummary)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                        >
                          {isEditingSummary ? 'Preview' : 'Edit Summary'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditableSummary(result.treatmentResponseSummary)}
                          className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500"
                          title="Reset to generated summary"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingSummary ? (
                      <textarea
                        rows={4}
                        value={editableSummary}
                        onChange={e => setEditableSummary(e.target.value)}
                        className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-teal-600 focus:bg-white leading-relaxed"
                      />
                    ) : (
                      <p
                        onClick={() => setIsEditingSummary(true)}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed cursor-text"
                      >
                        {editableSummary}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Full Screen Side-by-Side Zoom & Mark Modal */}
      <FullScreenSideBySideModal
        isOpen={showFullScreenSideBySide}
        onClose={() => setShowFullScreenSideBySide(false)}
        imageA={imageA || null}
        imageB={imageB || null}
        visitALabel="Visit 1 · Baseline Image"
        visitBLabel="Visit 2 · Follow-Up Image"
        visitADate={imageA ? new Date(imageA.createdAt).toLocaleDateString() : 'N/A'}
        visitBDate={imageB ? new Date(imageB.createdAt).toLocaleDateString() : 'N/A'}
        annotations={annotations}
        onChangeAnnotations={setAnnotations}
        clinicalNotes={clinicalContext}
        onChangeClinicalNotes={setClinicalContext}
        onGenerateSummaryFromModal={handleCompare}
      />

      {showWhatsApp && result && (
        <WhatsAppShareModal
          isOpen={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          patient={patient}
          doctor={doctor}
          reportType="progression_report"
          data={{
            progression: {
              ...result,
              treatmentResponseSummary: editableSummary || result.treatmentResponseSummary
            }
          }}
        />
      )}
    </div>
  );
};
