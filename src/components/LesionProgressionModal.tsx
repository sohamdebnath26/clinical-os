import React, { useState, useRef, useEffect } from 'react';
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
  ChevronRight,
  Upload,
  ArrowLeftRight
} from 'lucide-react';

interface LesionProgressionModalProps {
  patient: Patient;
  images: ClinicalImage[];
  initialPreviousImageId?: string;
  currentImageOverride?: ClinicalImage | null;
  onImagesUpdated?: (images: ClinicalImage[]) => void;
  onClose: () => void;
}

export const LesionProgressionModal: React.FC<LesionProgressionModalProps> = ({
  patient,
  images: initialImages,
  initialPreviousImageId,
  currentImageOverride,
  onImagesUpdated,
  onClose
}) => {
  const { doctor } = useAuth();
  const [localImages, setLocalImages] = useState<ClinicalImage[]>(() => {
    const base = [...initialImages];
    if (currentImageOverride && !base.some(i => i.id === currentImageOverride.id)) {
      base.push(currentImageOverride);
    }
    return base;
  });

  useEffect(() => {
    setLocalImages(prev => {
      const merged = [...initialImages];
      prev.forEach(p => {
        if (!merged.some(m => m.id === p.id)) {
          merged.push(p);
        }
      });
      if (currentImageOverride && !merged.some(m => m.id === currentImageOverride.id)) {
        merged.push(currentImageOverride);
      }
      return merged;
    });
  }, [initialImages, currentImageOverride]);

  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showFullScreenSideBySide, setShowFullScreenSideBySide] = useState(false);
  const [isUploadingSlot, setIsUploadingSlot] = useState<'A' | 'B' | null>(null);

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Sort images chronologically (oldest first -> newest last)
  const sortedImages = [...localImages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Previous Image (Slot A) defaults to initialPreviousImageId or second-latest/earliest image; Current Image (Slot B) defaults to latest/current image
  const [imageAId, setImageAId] = useState<string>(() => {
    if (initialPreviousImageId) return initialPreviousImageId;
    if (sortedImages.length >= 2) {
      return sortedImages[sortedImages.length - 2]?.id || sortedImages[0]?.id || '';
    }
    return sortedImages[0]?.id || '';
  });

  const [imageBId, setImageBId] = useState<string>(() => {
    if (currentImageOverride) return currentImageOverride.id;
    if (sortedImages.length >= 2) {
      return sortedImages[sortedImages.length - 1]?.id || '';
    }
    return '';
  });

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

  const imageA = localImages.find(img => img.id === imageAId) || null;
  const imageB = localImages.find(img => img.id === imageBId) || null;

  const handleUploadImageForSlot = (slot: 'A' | 'B', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please select a JPG, PNG, or WebP clinical photo.');
      return;
    }

    setErrorMsg(null);
    setIsUploadingSlot(slot);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const captionLabel =
        slot === 'A'
          ? `Previous Visit Baseline (${new Date().toLocaleDateString()})`
          : `Current Visit Follow-Up (${new Date().toLocaleDateString()})`;
      try {
        const res = await api.images.upload({
          patientId: patient.id,
          url: dataUrl,
          filename: file.name,
          mimeType: file.type,
          caption: captionLabel
        });
        const uploadedImg = res.image;
        const nextList = [...localImages, uploadedImg];
        setLocalImages(nextList);
        if (onImagesUpdated) {
          onImagesUpdated(nextList);
        }
        if (slot === 'A') {
          setImageAId(uploadedImg.id);
        } else {
          setImageBId(uploadedImg.id);
        }
      } catch {
        // Fallback local image object if offline
        const fallbackImg: ClinicalImage = {
          id: `local_${slot}_${Date.now()}`,
          patientId: patient.id,
          url: dataUrl,
          filename: file.name,
          mimeType: file.type,
          caption: captionLabel,
          createdAt: new Date().toISOString()
        };
        const nextList = [...localImages, fallbackImg];
        setLocalImages(nextList);
        if (onImagesUpdated) {
          onImagesUpdated(nextList);
        }
        if (slot === 'A') {
          setImageAId(fallbackImg.id);
        } else {
          setImageBId(fallbackImg.id);
        }
      } finally {
        setIsUploadingSlot(null);
        if (fileInputARef.current) fileInputARef.current.value = '';
        if (fileInputBRef.current) fileInputBRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSwapImages = () => {
    const temp = imageAId;
    setImageAId(imageBId);
    setImageBId(temp);
  };

  const handleCompare = async () => {
    if (!imageA || !imageB) {
      setErrorMsg('Please select or upload both a Previous Image and a Current Image to compare.');
      return;
    }

    if (imageA.id === imageB.id) {
      setErrorMsg('Please select two distinct photographs (Previous Image vs. Current Image).');
      return;
    }

    setIsComparing(true);
    setErrorMsg(null);

    try {
      const markedText = annotations
        .map((a, i) => `#${i + 1} [${a.side === 'A' ? 'Previous Image' : 'Current Image'}] ${a.label}`)
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
          label: imageA.caption || 'Previous Image (Baseline)',
          date: new Date(imageA.createdAt).toLocaleDateString()
        },
        imageB: {
          base64: imageB.url,
          mimeType: imageB.mimeType,
          label: imageB.caption || 'Current Image (Latest)',
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
      `CLINICAL PREVIOUS vs. CURRENT IMAGE COMPARISON SUMMARY`,
      `Patient: ${patient.fullName} (${patient.patientCode})`,
      `Comparison: ${imageA ? new Date(imageA.createdAt).toLocaleDateString() : 'Previous Image'} -> ${imageB ? new Date(imageB.createdAt).toLocaleDateString() : 'Current Image'}`,
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
        {/* Hidden File Inputs for uploading Previous or Current image directly */}
        <input
          ref={fileInputARef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={e => handleUploadImageForSlot('A', e)}
          className="hidden"
        />
        <input
          ref={fileInputBRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={e => handleUploadImageForSlot('B', e)}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Compare Previous Image vs. Current Image
              </h2>
              <p className="text-[11px] text-slate-400">
                Side-by-side full-screen zoom &amp; area marking, voice notes, and editable visit summary for <strong>{patient.fullName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(imageA || imageB) && (
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
          {/* Quick Instruction Bar + Swap Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-bold text-slate-800">How to compare:</span>
              <span>
                Select or upload the <strong>Previous Image</strong> on the left and the <strong>Current Image</strong> on the right, then click <strong>Full Screen Zoom &amp; Mark</strong> or <strong>Generate Visit Summary</strong>.
              </span>
            </div>
            {imageA && imageB && (
              <button
                type="button"
                onClick={handleSwapImages}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center gap-1 transition shrink-0"
              >
                <ArrowLeftRight className="w-3 h-3 text-teal-700" />
                <span>Swap Previous ⇄ Current</span>
              </button>
            )}
          </div>

          {/* 1. Previous Image (Left) vs. Current Image (Right) Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Slot A: Previous Image */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  1. Previous Image (Earlier Visit / Baseline)
                </span>
                <button
                  type="button"
                  onClick={() => fileInputARef.current?.click()}
                  disabled={isUploadingSlot === 'A'}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-blue-800 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition"
                >
                  <Upload className="w-3 h-3" />
                  <span>{isUploadingSlot === 'A' ? 'Uploading...' : '+ Upload Previous'}</span>
                </button>
              </div>

              {sortedImages.length > 0 && (
                <select
                  value={imageAId}
                  onChange={e => setImageAId(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                >
                  <option value="">-- Select Previous Image --</option>
                  {sortedImages.map((img, i) => (
                    <option key={img.id} value={img.id}>
                      Photo #{i + 1} ({new Date(img.createdAt).toLocaleDateString()}) — {img.caption || img.filename}
                    </option>
                  ))}
                </select>
              )}

              {imageA ? (
                <div
                  onClick={() => setShowFullScreenSideBySide(true)}
                  className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group cursor-pointer"
                >
                  <img
                    src={imageA.url}
                    alt="Previous clinical photo"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-900/85 text-blue-100 rounded text-[10px] font-bold">
                    Previous · {new Date(imageA.createdAt).toLocaleDateString()}
                  </div>
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
              ) : (
                <div
                  onClick={() => fileInputARef.current?.click()}
                  className="aspect-4/3 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white flex flex-col items-center justify-center p-6 text-center cursor-pointer transition space-y-2"
                >
                  <Upload className="w-7 h-7 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700">Upload Previous Visit Image</p>
                  <p className="text-[11px] text-slate-400">
                    Click to select the earlier/baseline clinical photo from your device
                  </p>
                </div>
              )}
            </div>

            {/* Slot B: Current Image */}
            <div className="bg-teal-50/40 border border-teal-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  2. Current Image (Today / Latest Visit)
                </span>
                <button
                  type="button"
                  onClick={() => fileInputBRef.current?.click()}
                  disabled={isUploadingSlot === 'B'}
                  className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition"
                >
                  <Upload className="w-3 h-3" />
                  <span>{isUploadingSlot === 'B' ? 'Uploading...' : '+ Upload Current Image'}</span>
                </button>
              </div>

              {sortedImages.length > 0 && (
                <select
                  value={imageBId}
                  onChange={e => setImageBId(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-600"
                >
                  <option value="">-- Select or Upload Current Image --</option>
                  {sortedImages.map((img, i) => (
                    <option key={img.id} value={img.id}>
                      Photo #{i + 1} ({new Date(img.createdAt).toLocaleDateString()}) — {img.caption || img.filename}
                    </option>
                  ))}
                </select>
              )}

              {imageB ? (
                <div
                  onClick={() => setShowFullScreenSideBySide(true)}
                  className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-teal-300 flex items-center justify-center group cursor-pointer"
                >
                  <img
                    src={imageB.url}
                    alt="Current clinical photo"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-900/90 text-emerald-100 rounded text-[10px] font-bold">
                    Current · {new Date(imageB.createdAt).toLocaleDateString()}
                  </div>
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
              ) : (
                <div
                  onClick={() => fileInputBRef.current?.click()}
                  className="aspect-4/3 rounded-lg border-2 border-dashed border-teal-300 hover:border-teal-600 bg-white flex flex-col items-center justify-center p-6 text-center cursor-pointer transition space-y-2"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-teal-900">
                    Click to Upload Current Image to Compare
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    Upload today&apos;s clinical photo to compare it side-by-side with the patient&apos;s previous image.
                  </p>
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
                      #{idx + 1} [{m.side === 'A' ? 'Previous' : 'Current'}] {m.label}
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
              placeholder="Type or click 'Dictate Note (Mic)' to speak clinical notes comparing the previous image with the current image..."
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
                <span>Comparing Previous vs. Current Image...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-teal-200" />
                <span>Compare Previous vs. Current Image &amp; Generate Summary</span>
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
        </div>
      </div>

      {/* Full Screen Side-by-Side Zoom & Mark Modal */}
      <FullScreenSideBySideModal
        isOpen={showFullScreenSideBySide}
        onClose={() => setShowFullScreenSideBySide(false)}
        imageA={imageA}
        imageB={imageB}
        visitALabel="Previous Image (Earlier Visit)"
        visitBLabel="Current Image (Latest / Today)"
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
