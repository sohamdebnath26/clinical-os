import React, { useState, useRef, useEffect } from 'react';
import {
  Patient,
  ClinicalImage,
  ProgressionAnalysisResult,
  MedicalImageModality,
  VisualMorphologyMetrics
} from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { analyzeImageVisualFeatures, compareImagePairVisuals } from '../utils/visualImageAnalyzer';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { VoiceDictationButton } from './VoiceDictationButton';
import { FullScreenSideBySideModal, ImageAreaAnnotation } from './FullScreenSideBySideModal';
import { MobileQrUploadModal } from './MobileQrUploadModal';
import {
  X,
  QrCode,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Check,
  Copy,
  AlertCircle,
  AlertTriangle,
  Maximize2,
  Pencil,
  RotateCcw,
  ChevronRight,
  Upload,
  ArrowLeftRight,
  Calendar,
  FileSearch,
  Database,
  Clock,
  Stethoscope,
  CheckCircle2,
  SlidersHorizontal,
  Layers
} from 'lucide-react';

const MEDICAL_MODALITIES: MedicalImageModality[] = [
  'Clinical Photo',
  'Dermoscopy',
  "Wood's Lamp",
  'X-Ray / Radiograph',
  'CT / MRI Scan',
  'Ultrasound',
  'Histopathology / Slide',
  'Other Medical Image'
];

interface SampleProgressionPair {
  id: string;
  title: string;
  subtitle: string;
  clinicalContext: string;
  pastImage: Omit<ClinicalImage, 'patientId'>;
  currentImage: Omit<ClinicalImage, 'patientId'>;
}

function makeSampleSvgDataUrl(svgString: string): string {
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
}

const SAMPLE_PROGRESSION_PAIRS: SampleProgressionPair[] = [
  {
    id: 'sample_acne_improvement',
    title: 'Acne Vulgaris (Baseline Flare → Day 21 Post-Regimen)',
    subtitle: 'Tests Marked Improvement (+68% recovery)',
    clinicalContext:
      'Patient on topical Adapalene 0.1% + Clindamycin 1% gel nightly and barrier-restoring moisturizer for 21 days.',
    pastImage: {
      id: 'sample_past_acne_baseline',
      url: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f7e2d5"/><circle cx="145" cy="110" r="24" fill="#d9383a" opacity="0.82"/><circle cx="145" cy="110" r="7" fill="#fef08a"/><circle cx="205" cy="130" r="28" fill="#c81e32" opacity="0.85"/><circle cx="205" cy="130" r="8" fill="#fde047"/><circle cx="172" cy="152" r="19" fill="#e11d48" opacity="0.78"/></svg>`
      ),
      dataUrl: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f7e2d5"/><circle cx="145" cy="110" r="24" fill="#d9383a" opacity="0.82"/><circle cx="145" cy="110" r="7" fill="#fef08a"/><circle cx="205" cy="130" r="28" fill="#c81e32" opacity="0.85"/><circle cx="205" cy="130" r="8" fill="#fde047"/><circle cx="172" cy="152" r="19" fill="#e11d48" opacity="0.78"/></svg>`
      ),
      filename: 'acne_baseline_day1.svg',
      mimeType: 'image/svg+xml',
      caption: 'Day 1 Baseline — Papulopustular Acne Flare (Right Cheek)',
      bodyArea: 'Right Malar Cheek',
      modality: 'Clinical Photo',
      imageRole: 'past',
      examDate: '2025-04-01',
      extractedFindings:
        'Clustered erythematous papules and central pustules with pronounced perilesional erythema (Erythema 74/100, Diameter 10.5mm).',
      createdAt: '2025-04-01T09:00:00.000Z'
    },
    currentImage: {
      id: 'sample_curr_acne_day21',
      url: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f7e2d5"/><circle cx="145" cy="110" r="9" fill="#e6a296" opacity="0.45"/><circle cx="205" cy="130" r="11" fill="#e29b8f" opacity="0.48"/><circle cx="172" cy="152" r="7" fill="#ebb0a5" opacity="0.4"/></svg>`
      ),
      dataUrl: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f7e2d5"/><circle cx="145" cy="110" r="9" fill="#e6a296" opacity="0.45"/><circle cx="205" cy="130" r="11" fill="#e29b8f" opacity="0.48"/><circle cx="172" cy="152" r="7" fill="#ebb0a5" opacity="0.4"/></svg>`
      ),
      filename: 'acne_followup_day21.svg',
      mimeType: 'image/svg+xml',
      caption: 'Day 21 Follow-up — Post-Regimen Clearance (Right Cheek)',
      bodyArea: 'Right Malar Cheek',
      modality: 'Clinical Photo',
      imageRole: 'current',
      examDate: '2025-04-22',
      extractedFindings:
        'Complete resolution of pustules with >65% reduction in erythema and lesion diameter; faint residual post-inflammatory macules.',
      createdAt: '2025-04-22T09:00:00.000Z'
    }
  },
  {
    id: 'sample_eczema_ flare',
    title: 'Eczematous Dermatitis (Prior Mild Plaque → Acute Flare)',
    subtitle: 'Tests Worsening / Active Flare Detection',
    clinicalContext:
      'Patient discontinued topical corticosteroid early and used harsh fragranced soap; reports increased pruritus.',
    pastImage: {
      id: 'sample_past_eczema_mild',
      url: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f5dec9"/><ellipse cx="180" cy="120" rx="28" ry="20" fill="#e09889" opacity="0.55"/></svg>`
      ),
      dataUrl: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f5dec9"/><ellipse cx="180" cy="120" rx="28" ry="20" fill="#e09889" opacity="0.55"/></svg>`
      ),
      filename: 'eczema_prior_mild.svg',
      mimeType: 'image/svg+xml',
      caption: 'Prior Visit — Mild Subacute Eczematous Patch (Flexural Forearm)',
      bodyArea: 'Left Volar Forearm',
      modality: 'Clinical Photo',
      imageRole: 'past',
      examDate: '2025-04-05',
      extractedFindings:
        'Small, faintly erythematous patch with minimal scaling on the left volar forearm.',
      createdAt: '2025-04-05T10:00:00.000Z'
    },
    currentImage: {
      id: 'sample_curr_eczema_flare',
      url: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f5dec9"/><ellipse cx="180" cy="120" rx="74" ry="52" fill="#c81e32" opacity="0.82" stroke="#881337" stroke-width="3" stroke-dasharray="6,3"/><circle cx="155" cy="108" r="14" fill="#9f1239" opacity="0.7"/><circle cx="205" cy="132" r="16" fill="#9f1239" opacity="0.7"/></svg>`
      ),
      dataUrl: makeSampleSvgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f5dec9"/><ellipse cx="180" cy="120" rx="74" ry="52" fill="#c81e32" opacity="0.82" stroke="#881337" stroke-width="3" stroke-dasharray="6,3"/><circle cx="155" cy="108" r="14" fill="#9f1239" opacity="0.7"/><circle cx="205" cy="132" r="16" fill="#9f1239" opacity="0.7"/></svg>`
      ),
      filename: 'eczema_acute_flare.svg',
      mimeType: 'image/svg+xml',
      caption: 'Current Visit — Acute Erythematous Flare & Border Expansion',
      bodyArea: 'Left Volar Forearm',
      modality: 'Clinical Photo',
      imageRole: 'current',
      examDate: '2025-04-24',
      extractedFindings:
        'Expanded, intensely erythematous plaque with irregular scalloped borders and excoriated papules.',
      createdAt: '2025-04-24T10:00:00.000Z'
    }
  }
];

interface LesionProgressionModalProps {
  patient: Patient;
  images: ClinicalImage[];
  initialPreviousImageId?: string;
  currentImageOverride?: ClinicalImage | null;
  onImagesUpdated?: (images: ClinicalImage[]) => void;
  onClose: () => void;
}

function getEffectiveImageDate(img: ClinicalImage): string {
  return img.examDate || (img.createdAt ? img.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
}

function formatImageDisplayDate(img: ClinicalImage): string {
  const raw = img.examDate || img.createdAt;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString();
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
  const [mobileQrSlot, setMobileQrSlot] = useState<'A' | 'B' | null>(null);

  const handleQrImageUploaded = (newImg: ClinicalImage) => {
    setLocalImages(prev => {
      const exists = prev.some(i => i.id === newImg.id);
      const updated = exists ? prev.map(i => (i.id === newImg.id ? newImg : i)) : [...prev, newImg];
      onImagesUpdated?.(updated);
      return updated;
    });

    if (mobileQrSlot === 'A') {
      setImageAId(newImg.id);
    } else if (mobileQrSlot === 'B') {
      setImageBId(newImg.id);
    }
  };

  // Metadata for storing a Past Medical Image (Slot A) or Current Medical Image (Slot B)
  const defaultPastDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  })();
  const todayDate = new Date().toISOString().split('T')[0];

  const [pastExamDate, setPastExamDate] = useState<string>(defaultPastDate);
  const [pastModality, setPastModality] = useState<MedicalImageModality>('Clinical Photo');
  const [pastBodyArea, setPastBodyArea] = useState<string>('');

  const [currentExamDate, setCurrentExamDate] = useState<string>(todayDate);
  const [currentModality, setCurrentModality] = useState<MedicalImageModality>('Clinical Photo');
  const [currentBodyArea, setCurrentBodyArea] = useState<string>('');

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Sort images chronologically by examDate || createdAt (oldest first -> newest last)
  const sortedImages = [...localImages].sort(
    (a, b) =>
      new Date(getEffectiveImageDate(a)).getTime() - new Date(getEffectiveImageDate(b)).getTime()
  );

  // Past Image (Slot A) defaults to initialPreviousImageId, or oldest/past stored image
  const [imageAId, setImageAId] = useState<string>(() => {
    if (initialPreviousImageId) return initialPreviousImageId;
    const explicitPast = sortedImages.find(i => i.imageRole === 'past');
    if (explicitPast) return explicitPast.id;
    if (sortedImages.length >= 2) {
      return sortedImages[0]?.id || '';
    }
    return sortedImages[0]?.id || '';
  });

  // Current Image (Slot B) defaults to currentImageOverride or latest image
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
  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider' | 'heatmap'>('side-by-side');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [editableSummary, setEditableSummary] = useState<string>('');
  const [isEditingSummary, setIsEditingSummary] = useState<boolean>(true);
  const [severityStatus, setSeverityStatus] = useState<
    'Severity Increased' | 'Severity Decreased (Improving)' | 'Severity Stable'
  >('Severity Decreased (Improving)');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const imageA = localImages.find(img => img.id === imageAId) || null;
  const imageB = localImages.find(img => img.id === imageBId) || null;

  const handleLoadSamplePair = (sample: SampleProgressionPair) => {
    const pastImg: ClinicalImage = { ...sample.pastImage, patientId: patient.id };
    const currImg: ClinicalImage = { ...sample.currentImage, patientId: patient.id };
    setLocalImages(prev => {
      const filtered = prev.filter(i => i.id !== pastImg.id && i.id !== currImg.id);
      return [...filtered, pastImg, currImg];
    });
    setImageAId(pastImg.id);
    setImageBId(currImg.id);
    setClinicalContext(sample.clinicalContext);
    setErrorMsg(null);
    setResult(null);
  };

  const handleUploadImageForSlot = (slot: 'A' | 'B', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please select a JPG, PNG, or WebP medical image.');
      return;
    }

    setErrorMsg(null);
    setIsUploadingSlot(slot);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const isPast = slot === 'A';
      const chosenDate = isPast ? pastExamDate : currentExamDate;
      const chosenModality = isPast ? pastModality : currentModality;
      const chosenSite = (isPast ? pastBodyArea : currentBodyArea).trim() || 'Target Clinical Site';
      const captionLabel = isPast
        ? `Past ${chosenModality} — ${chosenSite} (${chosenDate})`
        : `Current ${chosenModality} — ${chosenSite} (${chosenDate})`;

      let extractedMetrics: VisualMorphologyMetrics | undefined = undefined;
      try {
        extractedMetrics = await analyzeImageVisualFeatures(dataUrl);
      } catch {
        // server will compute buffer metrics as fallback
      }

      const extractedFindingsText = extractedMetrics
        ? `${isPast ? 'Past baseline' : 'Current'} ${chosenModality.toLowerCase()} (${chosenSite}) captured on ${chosenDate}: Erythema index ${extractedMetrics.erythemaIndex}/100, pigmentation index ${extractedMetrics.pigmentationIndex}/100, border irregularity ${extractedMetrics.borderIrregularity}/100, estimated diameter ~${extractedMetrics.estimatedDiameterMm} mm.`
        : `${isPast ? 'Past baseline' : 'Current'} ${chosenModality.toLowerCase()} (${chosenSite}) stored on ${chosenDate}.`;

      try {
        const res = await api.images.upload({
          patientId: patient.id,
          dataUrl,
          url: dataUrl,
          filename: file.name,
          mimeType: file.type,
          caption: captionLabel,
          bodyArea: chosenSite,
          modality: chosenModality,
          imageRole: isPast ? 'past' : 'current',
          examDate: chosenDate,
          extractedFindings: extractedFindingsText,
          visualMetrics: extractedMetrics,
          tags: [isPast ? 'past' : 'current', chosenModality]
        });
        const uploadedImg = res.image;
        const nextList = [...localImages.filter(i => i.id !== uploadedImg.id), uploadedImg];
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
          dataUrl,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: dataUrl.length,
          caption: captionLabel,
          bodyArea: chosenSite,
          modality: chosenModality,
          imageRole: isPast ? 'past' : 'current',
          examDate: chosenDate,
          extractedFindings: extractedFindingsText,
          visualMetrics: extractedMetrics,
          createdAt: new Date(chosenDate).toISOString()
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
      setErrorMsg('Please select or upload both a Past Medical Image and a Current Medical Image to compare.');
      return;
    }

    if (imageA.id === imageB.id) {
      setErrorMsg('Please select two distinct medical images (Past Image vs. Current Image).');
      return;
    }

    setIsComparing(true);
    setErrorMsg(null);

    try {
      const srcA = imageA.dataUrl || imageA.url;
      const srcB = imageB.dataUrl || imageB.url;

      let pairVisuals: Awaited<ReturnType<typeof compareImagePairVisuals>> | null = null;
      if (srcA && srcB) {
        try {
          pairVisuals = await compareImagePairVisuals(srcA, srcB, annotations);
        } catch {
          // Fallback to individual extraction below
        }
      }

      // Ensure client-side pixel extraction runs on both Past Image and Current Image if not already cached
      let metricsA = imageA.visualMetrics || pairVisuals?.metricsA;
      if (!metricsA && srcA) {
        try {
          metricsA = await analyzeImageVisualFeatures(srcA);
        } catch {
          // Server will compute fallback metrics
        }
      }

      let metricsB = imageB.visualMetrics || pairVisuals?.metricsB;
      if (!metricsB && srcB) {
        try {
          metricsB = await analyzeImageVisualFeatures(srcB);
        } catch {
          // Server will compute fallback metrics
        }
      }

      const markedText = annotations
        .map((a, i) => `#${i + 1} [${a.side === 'A' ? 'Past Image' : 'Current Image'}] ${a.label}`)
        .join('; ');
      const combinedContext = [
        clinicalContext.trim(),
        markedText ? `Doctor Marked Areas: ${markedText}` : ''
      ]
        .filter(Boolean)
        .join('. ');

      const res = await api.ai.compareProgression({
        imageA: {
          id: imageA.id,
          base64: srcA,
          mimeType: imageA.mimeType,
          label: imageA.caption || 'Past Medical Image (Baseline)',
          date: formatImageDisplayDate(imageA),
          modality: imageA.modality || 'Clinical Photo',
          bodyArea: imageA.bodyArea || imageA.caption,
          extractedFindings: imageA.extractedFindings,
          visualMetrics: metricsA
        },
        imageB: {
          id: imageB.id,
          base64: srcB,
          mimeType: imageB.mimeType,
          label: imageB.caption || 'Current Uploaded Image (Follow-up)',
          date: formatImageDisplayDate(imageB),
          modality: imageB.modality || 'Clinical Photo',
          bodyArea: imageB.bodyArea || imageB.caption,
          extractedFindings: imageB.extractedFindings,
          visualMetrics: metricsB
        },
        patientId: patient.id,
        clinicalContext: combinedContext
      });

      const enrichedProgression: ProgressionAnalysisResult = {
        ...res.progression,
        diffHeatmapDataUrl: pairVisuals?.diffHeatmapDataUrl || res.progression.diffHeatmapDataUrl,
        roiComparisons:
          pairVisuals?.roiComparisons && pairVisuals.roiComparisons.length > 0
            ? pairVisuals.roiComparisons
            : res.progression.roiComparisons
      };

      setResult(enrichedProgression);
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

      const pastExtractedNote = res.progression.pastImageExtraction?.extractedSummary
        ? `Past Image (${res.progression.pastImageExtraction.date}): ${res.progression.pastImageExtraction.extractedSummary}`
        : '';
      const currentExtractedNote = res.progression.currentImageExtraction?.extractedSummary
        ? `Current Image (${res.progression.currentImageExtraction.date}): ${res.progression.currentImageExtraction.extractedSummary}`
        : '';

      const improvementNote = res.progression.conditionImprovementSummary
        ? `Condition Improvement Over Time: ${res.progression.conditionImprovementSummary}`
        : res.progression.treatmentResponseSummary;
      const topSuggestionNote =
        res.progression.doctorMedicalSuggestions && res.progression.doctorMedicalSuggestions.length > 0
          ? `Suggested Action: ${res.progression.doctorMedicalSuggestions
              .slice(0, 2)
              .map(s => `${s.title} (${s.suggestion})`)
              .join(' ')}`
          : '';

      const initialDraft = [
        improvementNote,
        pastExtractedNote,
        currentExtractedNote,
        topSuggestionNote,
        clinicalContext.trim() ? `Doctor Note: ${clinicalContext.trim()}.` : '',
        annotations.length > 0 ? `Marked ROI areas: ${markedText}.` : ''
      ]
        .filter(Boolean)
        .join(' ');

      setEditableSummary(initialDraft);
      setIsEditingSummary(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Comparison failed';
      setErrorMsg(`Medical image comparison could not complete: ${msg}`);
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
      `CLINICAL PAST vs. CURRENT MEDICAL IMAGE COMPARISON REPORT`,
      `Patient: ${patient.fullName} (${patient.patientCode})`,
      `Time Interval: ${result.timePeriodLabel || `${imageA ? formatImageDisplayDate(imageA) : 'Past Image'} -> ${imageB ? formatImageDisplayDate(imageB) : 'Current Image'}`}`,
      `Severity & Trajectory: ${severityStatus} — ${result.overallProgression} (${result.progressionScore > 0 ? `+${result.progressionScore}%` : `${result.progressionScore}%`})`,
      '',
      result.conditionImprovementSummary
        ? `HOW THE MEDICAL CONDITION HAS IMPROVED OVER TIME:\n${result.conditionImprovementSummary}`
        : '',
      result.improvementMetrics && result.improvementMetrics.length > 0
        ? `QUANTIFIED PARAMETER CHANGES (PAST vs. CURRENT):\n${result.improvementMetrics
            .map(m => `• ${m.parameter}: ${m.pastValue} -> ${m.currentValue} [${m.deltaLabel}] — ${m.clinicalInterpretation}`)
            .join('\n')}`
        : '',
      '',
      result.pastImageExtraction
        ? `EXTRACTED PAST IMAGE (${result.pastImageExtraction.date} · ${result.pastImageExtraction.modality}):\n${result.pastImageExtraction.extractedSummary}`
        : '',
      result.currentImageExtraction
        ? `EXTRACTED CURRENT IMAGE (${result.currentImageExtraction.date} · ${result.currentImageExtraction.modality}):\n${result.currentImageExtraction.extractedSummary}`
        : '',
      '',
      result.doctorMedicalSuggestions && result.doctorMedicalSuggestions.length > 0
        ? `MEDICAL SUGGESTIONS TO ASSIST THE DOCTOR:\n${result.doctorMedicalSuggestions
            .map(s => `• [${s.category} · ${s.priority}] ${s.title}: ${s.suggestion} (Rationale: ${s.clinicalRationale})`)
            .join('\n')}`
        : '',
      '',
      `DOCTOR'S SUMMARY:`,
      editableSummary || result.treatmentResponseSummary,
      '',
      `MORPHOLOGICAL OBSERVATIONS:`,
      ...result.visualComparisonObservations.map(o => `• ${o}`),
      '',
      `RECOMMENDED ADJUSTMENTS:`,
      ...result.recommendedAdjustments.map(r => `• ${r}`)
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const derivedRedFlags =
    severityStatus === 'Severity Increased'
      ? [
          'Severity increased between past and current images — rule out secondary bacterial superinfection or contact sensitization.',
          'Evaluate peripheral border expansion with polarized dermoscopy or repeat imaging.'
        ]
      : [
          'Monitor for rebound erythema upon stepping down topical corticosteroid potency.',
          'Watch for secondary impetiginization or barrier breakdown if pruritus recurs.'
        ];

  return (
    <>
      <div
        onClick={() => {
          if (showFullScreenSideBySide || mobileQrSlot) return;
          onClose();
        }}
        className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs"
      >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150"
      >
        {/* Hidden File Inputs for uploading Past or Current medical image directly */}
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
                Compare Stored Past Medical Image vs. Current Uploaded Image
              </h2>
              <p className="text-[11px] text-slate-400">
                Extracts features from both past stored medical images &amp; current uploaded images for{' '}
                <strong>{patient.fullName}</strong> ({sortedImages.length} stored in archive)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(imageA || imageB) && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowFullScreenSideBySide(true);
                }}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Screen Side-by-Side (Zoom &amp; Mark)</span>
              </button>
            )}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Quick Instruction Bar + 1-Click Test Pairs + Swap Button */}
          <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Database className="w-4 h-4 text-teal-700 shrink-0" />
                <span>
                  <strong>Medical Image Archive &amp; Dual CIE-LAB Extraction:</strong> Select a stored{' '}
                  <strong>Past Medical Image</strong> on the left and a <strong>Current Image</strong> on the right, or click a sample pair below to test Old vs. New progression.
                </span>
              </div>
              {imageA && imageB && (
                <button
                  type="button"
                  onClick={handleSwapImages}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center gap-1 transition shrink-0"
                >
                  <ArrowLeftRight className="w-3 h-3 text-teal-700" />
                  <span>Swap Past ⇄ Current</span>
                </button>
              )}
            </div>

            {/* 1-Click Sample Old vs. New Progression Pairs + View Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                  Quick Test Pairs:
                </span>
                {SAMPLE_PROGRESSION_PAIRS.map(pair => (
                  <button
                    key={pair.id}
                    type="button"
                    onClick={() => handleLoadSamplePair(pair)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-[11px] font-semibold text-slate-700 hover:text-teal-900 transition flex items-center gap-1"
                    title={pair.subtitle}
                  >
                    <Sparkles className="w-3 h-3 text-teal-600" />
                    <span>{pair.title}</span>
                  </button>
                ))}
              </div>

              {imageA && imageB && (
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewMode('side-by-side')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                      viewMode === 'side-by-side'
                        ? 'bg-teal-800 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Side-by-Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('slider')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                      viewMode === 'slider'
                        ? 'bg-teal-800 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Overlay Slider</span>
                  </button>
                  {result?.diffHeatmapDataUrl && (
                    <button
                      type="button"
                      onClick={() => setViewMode('heatmap')}
                      className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                        viewMode === 'heatmap'
                          ? 'bg-emerald-700 text-white'
                          : 'text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>Pixel Diff Heatmap</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Overlay Slider or CIE-LAB Pixel Difference Heatmap */}
          {viewMode === 'slider' && imageA && imageB && (
            <div className="bg-slate-900 p-4 rounded-xl text-white space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>◀ Past ({formatImageDisplayDate(imageA)})</span>
                <span className="font-mono font-bold text-teal-300">{sliderPos}% Blend</span>
                <span>Current ({formatImageDisplayDate(imageB)}) ▶</span>
              </div>
              <div className="relative h-72 w-full rounded-lg overflow-hidden bg-black flex items-center justify-center border border-slate-700">
                <img
                  src={imageA.dataUrl || imageA.url}
                  alt="Past baseline"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${sliderPos}%`, borderRight: '2px solid #2dd4bf' }}
                >
                  <img
                    src={imageB.dataUrl || imageB.url}
                    alt="Current follow-up"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ width: '100%', maxWidth: 'none' }}
                  />
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={e => setSliderPos(Number(e.target.value))}
                className="w-full accent-teal-400 cursor-pointer"
              />
            </div>
          )}

          {viewMode === 'heatmap' && result?.diffHeatmapDataUrl && (
            <div className="bg-slate-900 p-4 rounded-xl text-white space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-teal-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  CIE-LAB Colorimetric Difference Heatmap (Past Image → Current Image)
                </span>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                    Cleared / Reduced Erythema &amp; Pigment
                  </span>
                  <span className="flex items-center gap-1 text-rose-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    Active Flare / Increased Erythema
                  </span>
                </div>
              </div>
              <div className="relative h-72 w-full rounded-lg overflow-hidden bg-black flex items-center justify-center border border-slate-700">
                <img
                  src={result.diffHeatmapDataUrl}
                  alt="CIE-LAB Pixel Difference Heatmap"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* 1. Past Medical Image (Left) vs. Current Medical Image (Right) Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Slot A: Past Medical Image */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  1. Past Medical Image (Stored Archive / Historical)
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setMobileQrSlot('A')}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                    title="Upload past image by scanning QR code from phone"
                  >
                    <QrCode className="w-3 h-3 text-blue-600" />
                    <span>Scan QR from Mobile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputARef.current?.click()}
                    disabled={isUploadingSlot === 'A'}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{isUploadingSlot === 'A' ? 'Storing Past Image...' : '+ Upload Past Image'}</span>
                  </button>
                </div>
              </div>

              {/* Metadata controls when uploading a new Past Medical Image */}
              <div className="grid grid-cols-3 gap-1.5 bg-white p-2 rounded-lg border border-slate-200 text-[11px]">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Past Exam Date
                  </label>
                  <input
                    type="date"
                    value={pastExamDate}
                    max={todayDate}
                    onChange={e => setPastExamDate(e.target.value)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Modality
                  </label>
                  <select
                    value={pastModality}
                    onChange={e => setPastModality(e.target.value as MedicalImageModality)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:border-blue-500"
                  >
                    {MEDICAL_MODALITIES.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Body Site / Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Left forearm"
                    value={pastBodyArea}
                    onChange={e => setPastBodyArea(e.target.value)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {sortedImages.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Select Stored Past Medical Image ({sortedImages.length} stored for {patient.fullName}):
                  </label>
                  <select
                    value={imageAId}
                    onChange={e => setImageAId(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">-- Select Stored Past Medical Image --</option>
                    {sortedImages.map((img, i) => (
                      <option key={img.id} value={img.id}>
                        [{img.imageRole === 'past' ? 'PAST' : 'STORED'} · {formatImageDisplayDate(img)}] {img.modality || 'Clinical Photo'} — {img.caption || img.bodyArea || `Image #${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {imageA ? (
                <div className="space-y-2">
                  <div
                    onClick={() => setShowFullScreenSideBySide(true)}
                    className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group cursor-pointer"
                  >
                    <img
                      src={imageA.dataUrl || imageA.url}
                      alt="Past medical image"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-900/90 text-blue-100 rounded text-[10px] font-bold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Past · {formatImageDisplayDate(imageA)} · {imageA.modality || 'Clinical Photo'}
                      </span>
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

                  {/* Stored Past Image Pre-Extracted Metadata Badge */}
                  <div className="p-2.5 rounded-lg bg-white border border-blue-200 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold text-blue-950">
                      <span className="flex items-center gap-1">
                        <FileSearch className="w-3.5 h-3.5 text-blue-600" />
                        Stored Past Image Findings
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {imageA.bodyArea || imageA.caption || 'Baseline'}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-snug">
                      {imageA.extractedFindings ||
                        `Stored ${imageA.modality || 'Clinical Photo'} from ${formatImageDisplayDate(imageA)}. Click "Compare Past vs. Current Image" below for full pixel & AI morphological extraction.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="aspect-4/3 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white flex flex-col items-center justify-center p-6 text-center transition space-y-2.5">
                  <Upload className="w-6 h-6 text-blue-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      Store &amp; Upload Past Medical Image
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Set the historical date &amp; modality above, then select or snap from mobile phone
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMobileQrSlot('A')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Scan QR from Mobile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputARef.current?.click()}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Choose File</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Slot B: Current Medical Image */}
            <div className="bg-teal-50/40 border border-teal-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  2. Current Medical Image (Today / Latest Upload)
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setMobileQrSlot('B')}
                    className="px-2.5 py-1 bg-teal-100 hover:bg-teal-200 border border-teal-300 text-teal-900 rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                    title="Upload current image by scanning QR code from phone camera"
                  >
                    <QrCode className="w-3 h-3 text-teal-700" />
                    <span>Scan QR from Mobile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputBRef.current?.click()}
                    disabled={isUploadingSlot === 'B'}
                    className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{isUploadingSlot === 'B' ? 'Uploading Current...' : '+ Upload Current Image'}</span>
                  </button>
                </div>
              </div>

              {/* Metadata controls when uploading a Current Medical Image */}
              <div className="grid grid-cols-3 gap-1.5 bg-white p-2 rounded-lg border border-teal-200/80 text-[11px]">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Current Exam Date
                  </label>
                  <input
                    type="date"
                    value={currentExamDate}
                    onChange={e => setCurrentExamDate(e.target.value)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Modality
                  </label>
                  <select
                    value={currentModality}
                    onChange={e => setCurrentModality(e.target.value as MedicalImageModality)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:border-teal-600"
                  >
                    {MEDICAL_MODALITIES.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Body Site / Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Left forearm"
                    value={currentBodyArea}
                    onChange={e => setCurrentBodyArea(e.target.value)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              {sortedImages.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-800 mb-1">
                    Select Current / Follow-up Image or Upload New Above:
                  </label>
                  <select
                    value={imageBId}
                    onChange={e => setImageBId(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-600 font-medium"
                  >
                    <option value="">-- Select or Upload Current Medical Image --</option>
                    {sortedImages.map((img, i) => (
                      <option key={img.id} value={img.id}>
                        [{img.imageRole === 'past' ? 'PAST' : 'CURRENT'} · {formatImageDisplayDate(img)}] {img.modality || 'Clinical Photo'} — {img.caption || img.bodyArea || `Image #${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {imageB ? (
                <div className="space-y-2">
                  <div
                    onClick={() => setShowFullScreenSideBySide(true)}
                    className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-teal-300 flex items-center justify-center group cursor-pointer"
                  >
                    <img
                      src={imageB.dataUrl || imageB.url}
                      alt="Current medical image"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-900/90 text-emerald-100 rounded text-[10px] font-bold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Current · {formatImageDisplayDate(imageB)} · {imageB.modality || 'Clinical Photo'}
                      </span>
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

                  {/* Current Uploaded Image Pre-Extracted Metadata Badge */}
                  <div className="p-2.5 rounded-lg bg-white border border-teal-200 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold text-teal-950">
                      <span className="flex items-center gap-1">
                        <FileSearch className="w-3.5 h-3.5 text-teal-600" />
                        Current Uploaded Image Findings
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                        {imageB.bodyArea || imageB.caption || 'Current Follow-up'}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-snug">
                      {imageB.extractedFindings ||
                        `Uploaded ${imageB.modality || 'Clinical Photo'} from ${formatImageDisplayDate(imageB)}. Click "Compare Past vs. Current Image" below to extract and compare against the past image.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="aspect-4/3 rounded-lg border-2 border-dashed border-teal-300 hover:border-teal-600 bg-white flex flex-col items-center justify-center p-6 text-center transition space-y-2.5">
                  <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-teal-900">
                      Upload Current Medical Image for Comparison
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                      Upload today&apos;s clinical or diagnostic image to extract its findings and compare it against the patient&apos;s stored past image.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMobileQrSlot('B')}
                      className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Scan QR from Mobile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputBRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Choose File</span>
                    </button>
                  </div>
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
                      #{idx + 1} [{m.side === 'A' ? 'Past' : 'Current'}] {m.label}
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
              placeholder="Type or click 'Dictate Note (Mic)' to speak clinical notes comparing the past medical image with the current image..."
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

          {/* 4. Extract Both Images & Generate Summary Button */}
          <button
            type="button"
            onClick={handleCompare}
            disabled={isComparing || !imageA || !imageB}
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
          >
            {isComparing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-teal-200" />
                <span>Extracting Past &amp; Current Medical Images &amp; Comparing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-teal-200" />
                <span>Extract Past &amp; Current Medical Images &amp; Generate Progression Summary</span>
              </>
            )}
          </button>

          {/* Results Display with Dual Image Extractions, Minor AI Suggestions & Editable Summary */}
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

              {/* ==================================================================== */}
              {/* SECTION A: HOW THE MEDICAL CONDITION HAS IMPROVED OVER TIME          */}
              {/* ==================================================================== */}
              <div className="p-4 bg-white rounded-xl border border-emerald-200 space-y-3.5 text-xs shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <span>How the Medical Condition Has Improved Over Time</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            result.progressionScore >= 15
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : result.progressionScore <= -10
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {result.overallProgression} (
                          {result.progressionScore > 0
                            ? `+${result.progressionScore}%`
                            : `${result.progressionScore}%`}
                          )
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-teal-600" />
                        <span>
                          Evaluated Time Interval:{' '}
                          <strong className="text-slate-700">
                            {result.timePeriodLabel ||
                              `${imageA ? formatImageDisplayDate(imageA) : 'Past Visit'} → ${
                                imageB ? formatImageDisplayDate(imageB) : 'Current Visit'
                              }`}
                          </strong>
                        </span>
                      </p>
                    </div>
                  </div>

                  {result.conditionImprovementSummary && (
                    <button
                      type="button"
                      onClick={() => handleInsertPointer(result.conditionImprovementSummary!)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-semibold transition"
                    >
                      + Insert Improvement Narrative
                    </button>
                  )}
                </div>

                {/* Longitudinal Improvement Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">
                      Longitudinal Recovery &amp; Healing Trajectory
                    </span>
                    <span
                      className={`font-bold ${
                        result.progressionScore >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {result.progressionScore >= 0
                        ? `${result.progressionScore}% Positive Recovery Index`
                        : `${Math.abs(result.progressionScore)}% Flare / Worsening Index`}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className={`h-full transition-all duration-500 ${
                        result.progressionScore >= 15
                          ? 'bg-emerald-500'
                          : result.progressionScore <= -10
                          ? 'bg-rose-500'
                          : 'bg-amber-500'
                      }`}
                      style={{
                        width: `${Math.max(12, Math.min(100, Math.round((result.progressionScore + 100) / 2)))}%`
                      }}
                    />
                  </div>
                </div>

                {/* Narrative Summary of How the Condition Improved Over Time */}
                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 text-slate-800 leading-relaxed text-xs">
                  {result.conditionImprovementSummary || result.treatmentResponseSummary}
                </div>

                {/* Parameter-by-Parameter Past vs Current Comparison Cards */}
                {result.improvementMetrics && result.improvementMetrics.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Quantified Parameter Progression (Past Image vs. Current Image):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {result.improvementMetrics.map((metric, idx) => {
                        const isImp = metric.status === 'improved';
                        const isWorse = metric.status === 'worsened';
                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border space-y-1.5 ${
                              isImp
                                ? 'bg-emerald-50/30 border-emerald-200'
                                : isWorse
                                ? 'bg-rose-50/30 border-rose-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-slate-800 text-[11px]">
                                {metric.parameter}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  isImp
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : isWorse
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : 'bg-slate-200 text-slate-700 border-slate-300'
                                }`}
                              >
                                {metric.deltaLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                                Past: <strong>{metric.pastValue}</strong>
                              </span>
                              <span className="text-slate-400 font-bold">→</span>
                              <span className="px-2 py-0.5 rounded bg-white border border-teal-200 text-teal-900">
                                Current: <strong>{metric.currentValue}</strong>
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              {metric.clinicalInterpretation}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Doctor Marked ROI Colorimetric Comparison Cards */}
                {result.roiComparisons && result.roiComparisons.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-teal-900">
                      Marked Region-of-Interest (ROI) Colorimetric Deltas:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {result.roiComparisons.map(roi => (
                        <div
                          key={roi.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-teal-200 text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{roi.label}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                roi.status === 'improved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : roi.status === 'worsened'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {roi.deltaSummary}
                            </span>
                          </div>
                          <div className="text-slate-600">
                            Erythema: <strong>{roi.pastErythema}/100</strong> → <strong>{roi.currentErythema}/100</strong> · Pigment: <strong>{roi.pastPigmentation}/100</strong> → <strong>{roi.currentPigmentation}/100</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Healing / Clinical Milestones Achieved Over the Time Interval */}
                {result.healingMilestones && result.healingMilestones.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-900 block">
                      Key Clinical Milestones Observed Over This Time Period:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {result.healingMilestones.map((milestone, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-2 text-[11px] text-slate-700"
                        >
                          <div className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{milestone}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInsertPointer(milestone)}
                            className="text-[10px] font-bold text-teal-700 hover:underline shrink-0"
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ==================================================================== */}
              {/* SECTION B: SIDE-BY-SIDE EXTRACTED FINDINGS (PAST vs CURRENT IMAGE)   */}
              {/* ==================================================================== */}
              {(result.pastImageExtraction || result.currentImageExtraction) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Past Image Extraction Card */}
                  {result.pastImageExtraction && (
                    <div className="p-3.5 bg-white rounded-xl border border-blue-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-blue-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-600" />
                          Extracted Past Image ({result.pastImageExtraction.date})
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold text-[10px] border border-blue-200">
                          {result.pastImageExtraction.modality}
                        </span>
                      </div>
                      <p className="text-slate-700 text-[11px] leading-relaxed bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                        {result.pastImageExtraction.extractedSummary}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Erythema</div>
                          <div className="font-bold text-slate-800">{result.pastImageExtraction.erythemaIndex}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Pigment</div>
                          <div className="font-bold text-slate-800">{result.pastImageExtraction.pigmentationIndex}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Border</div>
                          <div className="font-bold text-slate-800">{result.pastImageExtraction.borderIrregularity}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Diameter</div>
                          <div className="font-bold text-slate-800">{result.pastImageExtraction.estimatedDiameterMm} mm</div>
                        </div>
                      </div>
                      <ul className="space-y-1 text-[11px] text-slate-600 pt-1">
                        {(
                          result.pastImageExtraction.morphologicalFindings ||
                          result.pastImageExtraction.keyFindings ||
                          []
                        ).map((f, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-blue-600 font-bold">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPointer(
                            `Past Image (${result.pastImageExtraction!.date}): ${result.pastImageExtraction!.extractedSummary}`
                          )
                        }
                        className="text-[11px] font-semibold text-blue-700 hover:underline pt-1 inline-flex items-center gap-1"
                      >
                        + Insert Past Image Findings into Summary
                      </button>
                    </div>
                  )}

                  {/* Current Uploaded Image Extraction Card */}
                  {result.currentImageExtraction && (
                    <div className="p-3.5 bg-white rounded-xl border border-teal-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-teal-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-600" />
                          Extracted Current Image ({result.currentImageExtraction.date})
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold text-[10px] border border-emerald-200">
                          {result.currentImageExtraction.modality}
                        </span>
                      </div>
                      <p className="text-slate-700 text-[11px] leading-relaxed bg-teal-50/50 p-2 rounded-lg border border-teal-100">
                        {result.currentImageExtraction.extractedSummary}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Erythema</div>
                          <div className="font-bold text-slate-800">{result.currentImageExtraction.erythemaIndex}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Pigment</div>
                          <div className="font-bold text-slate-800">{result.currentImageExtraction.pigmentationIndex}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Border</div>
                          <div className="font-bold text-slate-800">{result.currentImageExtraction.borderIrregularity}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase">Diameter</div>
                          <div className="font-bold text-slate-800">{result.currentImageExtraction.estimatedDiameterMm} mm</div>
                        </div>
                      </div>
                      <ul className="space-y-1 text-[11px] text-slate-600 pt-1">
                        {(
                          result.currentImageExtraction.morphologicalFindings ||
                          result.currentImageExtraction.keyFindings ||
                          []
                        ).map((f, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPointer(
                            `Current Image (${result.currentImageExtraction!.date}): ${result.currentImageExtraction!.extractedSummary}`
                          )
                        }
                        className="text-[11px] font-semibold text-teal-800 hover:underline pt-1 inline-flex items-center gap-1"
                      >
                        + Insert Current Image Findings into Summary
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ==================================================================== */}
              {/* SECTION C: MEDICAL SUGGESTIONS TO ASSIST THE DOCTOR                  */}
              {/* ==================================================================== */}
              {result.doctorMedicalSuggestions && result.doctorMedicalSuggestions.length > 0 && (
                <div className="p-4 bg-white rounded-xl border border-teal-200 space-y-3 text-xs shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                        <Stethoscope className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">
                          Medical Suggestions to Assist the Doctor
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Evidence-based clinical decision support tailored to the patient&apos;s longitudinal progression
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const allText = result
                          .doctorMedicalSuggestions!.map(
                            s => `[${s.category}] ${s.title}: ${s.suggestion}`
                          )
                          .join(' ');
                        handleInsertPointer(`Medical Suggestions: ${allText}`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-[11px] font-semibold transition"
                    >
                      + Insert All Medical Suggestions into Summary
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {result.doctorMedicalSuggestions.map((item, idx) => {
                      const isHigh = item.priority === 'High Priority';
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border space-y-1.5 flex flex-col justify-between ${
                            isHigh
                              ? 'bg-amber-50/40 border-amber-200'
                              : 'bg-slate-50/80 border-slate-200'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                {item.category}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isHigh
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {item.priority}
                              </span>
                            </div>
                            <div className="font-bold text-slate-900 text-xs pt-0.5">
                              {item.title}
                            </div>
                            <p className="text-[11px] text-slate-700 leading-relaxed">
                              {item.suggestion}
                            </p>
                            <p className="text-[10px] text-slate-500 italic">
                              Rationale: {item.clinicalRationale}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/70">
                            <button
                              type="button"
                              onClick={() =>
                                handleInsertPointer(`${item.title}: ${item.suggestion}`)
                              }
                              className="text-[11px] font-bold text-teal-800 hover:underline inline-flex items-center gap-1"
                            >
                              <span>+ Add to Doctor&apos;s Summary</span>
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() =>
                                setClinicalContext(prev =>
                                  prev.trim()
                                    ? `${prev.trim()} ${item.suggestion}`
                                    : item.suggestion
                                )
                              }
                              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                            >
                              + Add to Clinical Notes
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Minor AI Suggestions: Red Flags & Quick Pointers */}
              <div className="p-3 bg-white rounded-xl border border-teal-100 space-y-2.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Red Flags &amp; Quick Clinical Pointers (Click to insert into summary):
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
    </div>

      {/* Full Screen Side-by-Side Zoom & Mark Modal */}
      <FullScreenSideBySideModal
        isOpen={showFullScreenSideBySide}
        onClose={() => setShowFullScreenSideBySide(false)}
        imageA={imageA}
        imageB={imageB}
        visitALabel="Past Medical Image (Baseline / Archive)"
        visitBLabel="Current Medical Image (Latest / Today)"
        visitADate={imageA ? formatImageDisplayDate(imageA) : 'N/A'}
        visitBDate={imageB ? formatImageDisplayDate(imageB) : 'N/A'}
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

      {/* Mobile QR Code Upload Modal for Comparison Feature */}
      <MobileQrUploadModal
        isOpen={mobileQrSlot !== null}
        onClose={() => setMobileQrSlot(null)}
        patientId={patient.id}
        patientName={patient.fullName}
        title={
          mobileQrSlot === 'A'
            ? 'Scan QR to Upload Past Medical Image'
            : 'Scan QR to Upload Current Medical Image'
        }
        subtitle="Direct Mobile-to-Comparison Sync"
        slotLabel={
          mobileQrSlot === 'A'
            ? 'Past Medical Image (Slot A)'
            : 'Current Medical Image (Slot B)'
        }
        onImageUploaded={handleQrImageUploaded}
      />
    </>
  );
};
