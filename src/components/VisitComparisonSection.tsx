import React, { useState, useEffect } from 'react';
import { Patient, Consultation, ClinicalImage, VisitComparisonResult, ProgressionAnalysisResult } from '../types';
import { api } from '../lib/api';
import { VoiceDictationButton } from './VoiceDictationButton';
import { FullScreenSideBySideModal, ImageAreaAnnotation } from './FullScreenSideBySideModal';
import {
  ArrowLeftRight,
  GitCompare,
  Calendar,
  Image as ImageIcon,
  FileText,
  Pill,
  Sparkles,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  Stethoscope,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  ChevronRight,
  RefreshCw,
  Clock,
  ZoomIn,
  Pencil,
  Save,
  RotateCcw
} from 'lucide-react';

interface VisitComparisonSectionProps {
  patient: Patient;
  consultations: Consultation[];
  images: ClinicalImage[];
  onStartConsultation: (patient: Patient) => void;
  onRefreshData?: () => void;
  onOpenWhatsApp?: (data: { consultation: Consultation }) => void;
}

export const VisitComparisonSection: React.FC<VisitComparisonSectionProps> = ({
  patient,
  consultations,
  images,
  onStartConsultation,
  onRefreshData
}) => {
  // Sort consultations chronologically (oldest to newest for intuitive timeline progression)
  const sortedConsultations = [...consultations].sort(
    (a, b) => new Date(a.consultationDate).getTime() - new Date(b.consultationDate).getTime()
  );

  // Default selection: Visit A = earlier visit, Visit B = latest visit
  const [visitAId, setVisitAId] = useState<string>('');
  const [visitBId, setVisitBId] = useState<string>('');

  useEffect(() => {
    if (sortedConsultations.length >= 2) {
      if (!visitAId || !sortedConsultations.some(c => c.id === visitAId)) {
        setVisitAId(sortedConsultations[0].id);
      }
      if (!visitBId || !sortedConsultations.some(c => c.id === visitBId)) {
        setVisitBId(sortedConsultations[sortedConsultations.length - 1].id);
      }
    } else if (sortedConsultations.length === 1) {
      setVisitAId(sortedConsultations[0].id);
    }
  }, [consultations.length]);

  const [activeTab, setActiveTab] = useState<'images' | 'reports' | 'examinations' | 'prescriptions' | 'ai_summary'>('images');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showSideBySideFullScreenModal, setShowSideBySideFullScreenModal] = useState(false);
  const [selectedImgA, setSelectedImgA] = useState<ClinicalImage | null>(null);
  const [selectedImgB, setSelectedImgB] = useState<ClinicalImage | null>(null);
  const [isComparingProgression, setIsComparingProgression] = useState(false);
  const [progressionResult, setProgressionResult] = useState<ProgressionAnalysisResult | null>(null);
  const [isGeneratingAIReport, setIsGeneratingAIReport] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<VisitComparisonResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageSliderPos, setImageSliderPos] = useState<number>(50);
  const [showImageSlider, setShowImageSlider] = useState(false);
  const [isCreatingDemoVisit, setIsCreatingDemoVisit] = useState(false);
  const [zoomImage, setZoomImage] = useState<ClinicalImage | null>(null);

  // New Comparison Model states:
  // 1) Full-screen side-by-side area markings
  const [annotations, setAnnotations] = useState<ImageAreaAnnotation[]>([]);
  // 2) Doctor's Clinical Comparison Notes (with Mic voice dictation)
  const [comparisonClinicalNotes, setComparisonClinicalNotes] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [savedNotesSuccess, setSavedNotesSuccess] = useState(false);
  // 3) Editable Visit Summary + Minor AI Suggestions (Red Flags, Severity Increased/Decreased)
  const [editableSummaryText, setEditableSummaryText] = useState<string>('');
  const [isEditingSummary, setIsEditingSummary] = useState<boolean>(true);
  const [severityOverride, setSeverityOverride] = useState<
    'Severity Increased' | 'Severity Decreased (Improving)' | 'Severity Stable' | null
  >(null);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [savedSummarySuccess, setSavedSummarySuccess] = useState(false);

  const visitA = sortedConsultations.find(c => c.id === visitAId) || sortedConsultations[0];
  const visitB = sortedConsultations.find(c => c.id === visitBId) || sortedConsultations[sortedConsultations.length - 1];

  // Helper to get all clinical images associated with a visit (with smart fallback to chronological patient images so first image from each visit is always available)
  const getVisitImages = (consultation?: Consultation, isBaselineVisit?: boolean): ClinicalImage[] => {
    if (!consultation) return [];
    const directImages = consultation.images || [];
    const byConsultationId = images.filter(
      img => img.consultationId === consultation.id && !directImages.some(di => di.id === img.id)
    );

    const visitDateStr = consultation.consultationDate.split('T')[0];
    const matchingGlobalImages = images.filter(img => {
      const imgDateStr = img.createdAt.split('T')[0];
      return (
        imgDateStr === visitDateStr &&
        !directImages.some(di => di.id === img.id) &&
        !byConsultationId.some(ci => ci.id === img.id)
      );
    });

    const combined = [...directImages, ...byConsultationId, ...matchingGlobalImages];
    if (combined.length > 0) return combined;

    // Fallback: if patient has global clinical images not explicitly linked by date, provide first/latest image for comparison
    if (images.length > 0) {
      const chronologicalImgs = [...images].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      if (isBaselineVisit) {
        return [chronologicalImgs[0]];
      }
      return [chronologicalImgs[chronologicalImgs.length - 1]];
    }

    return [];
  };

  const imagesA = getVisitImages(visitA, true);
  const imagesB = getVisitImages(visitB, false);

  // Sync first image from each visit when visits change
  useEffect(() => {
    if (imagesA.length > 0 && (!selectedImgA || !imagesA.some(img => img.id === selectedImgA.id))) {
      setSelectedImgA(imagesA[0]);
    } else if (imagesA.length === 0) {
      setSelectedImgA(null);
    }

    if (imagesB.length > 0 && (!selectedImgB || !imagesB.some(img => img.id === selectedImgB.id))) {
      setSelectedImgB(imagesB[0]);
    } else if (imagesB.length === 0) {
      setSelectedImgB(null);
    }

    setProgressionResult(null);
    setComparisonResult(null);
    setEditableSummaryText('');
    setSeverityOverride(null);
  }, [visitAId, visitBId, images.length]);

  // Interval calculation
  const getIntervalDays = () => {
    if (!visitA || !visitB) return 0;
    const tA = new Date(visitA.consultationDate).getTime();
    const tB = new Date(visitB.consultationDate).getTime();
    return Math.max(0, Math.round(Math.abs(tB - tA) / (1000 * 60 * 60 * 24)));
  };

  const handleSwapVisits = () => {
    const temp = visitAId;
    setVisitAId(visitBId);
    setVisitBId(temp);
  };

  const handleCompareImagesWithAI = async () => {
    if (!selectedImgA || !selectedImgB) return;
    setIsComparingProgression(true);
    try {
      const markedLabels = annotations.map(a => `Visit ${a.side}: ${a.label}`).join('; ');
      const res = await api.ai.compareProgression({
        imageA: {
          base64: selectedImgA.url,
          mimeType: selectedImgA.mimeType,
          label: selectedImgA.caption || `Visit ${formatDate(visitA.consultationDate)}`,
          date: formatDate(visitA.consultationDate)
        },
        imageB: {
          base64: selectedImgB.url,
          mimeType: selectedImgB.mimeType,
          label: selectedImgB.caption || `Visit ${formatDate(visitB.consultationDate)}`,
          date: formatDate(visitB.consultationDate)
        },
        patientId: patient.id,
        clinicalContext: `Comparing lesion progression between visit on ${formatDate(visitA.consultationDate)} and ${formatDate(visitB.consultationDate)}. Diagnoses: ${visitB.diagnoses.join(', ') || visitA.diagnoses.join(', ')}. ${comparisonClinicalNotes ? `Doctor Notes: ${comparisonClinicalNotes}.` : ''} ${markedLabels ? `Marked Areas: ${markedLabels}` : ''}`
      });
      setProgressionResult(res.progression);
    } catch (err) {
      console.error('Image progression comparison error:', err);
    } finally {
      setIsComparingProgression(false);
    }
  };

  const handleGenerateAIReport = async () => {
    if (!visitA || !visitB) return;
    setIsGeneratingAIReport(true);
    try {
      const markedAreasList = annotations.map(
        (a, idx) => `#${idx + 1} [Visit ${a.side}] ${a.label}`
      );
      const res = await api.ai.compareVisits({
        visitAId: visitA.id,
        visitBId: visitB.id,
        patientId: patient.id,
        doctorNotes: comparisonClinicalNotes.trim() || undefined,
        markedAreas: markedAreasList.length > 0 ? markedAreasList : undefined
      });
      setComparisonResult(res.comparison);
      setEditableSummaryText(res.comparison.summaryText);
      setSeverityOverride(res.comparison.severityChange || null);
      setIsEditingSummary(true);
    } catch (err) {
      console.error('Visit AI comparison error:', err);
    } finally {
      setIsGeneratingAIReport(false);
    }
  };

  const handleSaveNotesToVisit = async () => {
    if (!visitB || !comparisonClinicalNotes.trim()) return;
    setIsSavingNotes(true);
    setSavedNotesSuccess(false);
    try {
      const existingExam = visitB.clinicalNotes?.examination || '';
      const updatedExam = existingExam
        ? `${existingExam}\n[Comparison Note]: ${comparisonClinicalNotes.trim()}`
        : comparisonClinicalNotes.trim();
      await api.consultations.sign(visitB.id, {
        ...visitB,
        clinicalNotes: {
          ...visitB.clinicalNotes,
          examination: updatedExam
        }
      });
      setSavedNotesSuccess(true);
      setTimeout(() => setSavedNotesSuccess(false), 2500);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error('Failed to save clinical notes to visit:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveSummaryToVisit = async () => {
    if (!visitB || !editableSummaryText.trim()) return;
    setIsSavingSummary(true);
    setSavedSummarySuccess(false);
    try {
      await api.consultations.sign(visitB.id, {
        ...visitB,
        aiSummary: editableSummaryText.trim()
      });
      setSavedSummarySuccess(true);
      setTimeout(() => setSavedSummarySuccess(false), 2500);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error('Failed to save edited comparison summary:', err);
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleInsertSuggestionIntoSummary = (suggestion: string) => {
    const clean = suggestion.trim();
    if (!clean) return;
    setEditableSummaryText(prev => {
      const base = prev.trim();
      if (!base) return clean;
      const endsWithPunct = /[.!?]$/.test(base);
      return `${base}${endsWithPunct ? '' : '.'} ${clean}`;
    });
    setIsEditingSummary(true);
  };

  const handleCopyReport = () => {
    if (!visitA || !visitB) return;
    const interval = getIntervalDays();
    const activeSeverity =
      severityOverride || comparisonResult?.severityChange || comparisonResult?.overallStatus || 'Evaluated';
    const summaryBody = editableSummaryText || comparisonResult?.summaryText || '';
    const text = `CLINICAL VISIT COMPARISON REPORT · ${patient.fullName} (${patient.patientCode})
Interval: ${interval} days (${formatDate(visitA.consultationDate)} ➔ ${formatDate(visitB.consultationDate)})

VISIT 1 (${formatDate(visitA.consultationDate)} · Dr. ${visitA.doctorName}):
- Diagnoses: ${visitA.diagnoses.join(', ') || 'None recorded'}
- Symptoms: ${visitA.symptoms.join(', ') || 'None recorded'}
- Investigations: ${visitA.tests?.join(', ') || 'None'}
- Prescriptions: ${visitA.prescriptions.map(p => `${p.medicineName} (${p.dosage}, ${p.frequency})`).join('; ') || 'None'}

VISIT 2 (${formatDate(visitB.consultationDate)} · Dr. ${visitB.doctorName}):
- Diagnoses: ${visitB.diagnoses.join(', ') || 'None recorded'}
- Symptoms: ${visitB.symptoms.join(', ') || 'None recorded'}
- Investigations: ${visitB.tests?.join(', ') || 'None'}
- Prescriptions: ${visitB.prescriptions.map(p => `${p.medicineName} (${p.dosage}, ${p.frequency})`).join('; ') || 'None'}
${comparisonClinicalNotes.trim() ? `\nDOCTOR COMPARISON NOTES:\n${comparisonClinicalNotes.trim()}\n` : ''}${annotations.length > 0 ? `\nMARKED IMAGE AREAS (${annotations.length}):\n${annotations.map((a, i) => `${i + 1}. [Visit ${a.side}] ${a.label}`).join('\n')}\n` : ''}${summaryBody ? `\nVISIT COMPARISON SUMMARY (${activeSeverity}):\n${summaryBody}` : ''}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateDemoFollowUp = async () => {
    setIsCreatingDemoVisit(true);
    try {
      const res = await api.consultations.create({
        patientId: patient.id,
        symptoms: ['Mild residual redness', 'Significant reduction in pruritus / itching']
      });

      await api.consultations.sign(res.consultation.id, {
        status: 'signed',
        diagnoses: [
          patient.primaryDiagnosis ? `${patient.primaryDiagnosis} (Subacute / Resolving)` : 'Eczematous Dermatitis (Resolving phase)',
          'Post-inflammatory Hyperpigmentation'
        ],
        tests: ['Skin Scraping / KOH follow-up', 'Serum Total IgE Review'],
        clinicalNotes: {
          examination: 'Marked flattening of erythematous plaques with re-epithelialization. Minimal xerosis remaining. No weeping or excoriations.',
          investigationsAdvised: 'Repeat KOH mount to verify clearance. Continue baseline hydration.',
          plan: 'Step down high-potency steroid to twice weekly maintenance. Continue ceramide barrier cream.'
        },
        prescriptions: [
          {
            id: `rx_${Date.now()}_1`,
            patientId: patient.id,
            medicineName: 'Tacrolimus 0.03% Ointment',
            dosage: 'Apply thin layer',
            frequency: 'Once daily at night',
            duration: '14 days',
            instructions: 'Apply to affected areas after moisturizing',
            date: new Date().toISOString(),
            createdAt: new Date().toISOString()
          },
          {
            id: `rx_${Date.now()}_2`,
            patientId: patient.id,
            medicineName: 'Ceramide Barrier Restoring Cream',
            dosage: 'Generous application',
            frequency: 'Twice daily',
            duration: '30 days',
            instructions: 'Apply immediately after bathing',
            date: new Date().toISOString(),
            createdAt: new Date().toISOString()
          }
        ],
        fee: 500,
        aiSummary: 'Follow-up encounter showing ~65% resolution of inflammatory skin lesions with step-down therapy advised.'
      });

      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Failed to create demo follow-up visit:', err);
    } finally {
      setIsCreatingDemoVisit(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  // Render SVG markings overlay on the preview cards as well
  const renderCardAnnotationPreview = (side: 'A' | 'B') => {
    const marks = annotations.filter(a => a.side === side);
    if (marks.length === 0) return null;
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      >
        {marks.map((mark, idx) => {
          if (mark.tool === 'circle') {
            return (
              <g key={mark.id}>
                <ellipse
                  cx={mark.x}
                  cy={mark.y}
                  rx={mark.radiusX || 7}
                  ry={mark.radiusY || 7}
                  fill={`${mark.color}25`}
                  stroke={mark.color}
                  strokeWidth="0.9"
                  strokeDasharray="1.5,1"
                />
                <text
                  x={Math.max(2, mark.x - (mark.radiusX || 7))}
                  y={Math.max(5, mark.y - (mark.radiusY || 7) - 1.5)}
                  fill="#ffffff"
                  fontSize="3.2"
                  fontWeight="bold"
                >
                  #{idx + 1}
                </text>
              </g>
            );
          }
          if (mark.tool === 'freehand' && mark.points && mark.points.length > 1) {
            return (
              <path
                key={mark.id}
                d={mark.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                fill={`${mark.color}20`}
                stroke={mark.color}
                strokeWidth="0.9"
              />
            );
          }
          return (
            <circle
              key={mark.id}
              cx={mark.x}
              cy={mark.y}
              r="2.5"
              fill={mark.color}
              stroke="#ffffff"
              strokeWidth="0.6"
            />
          );
        })}
      </svg>
    );
  };

  // If patient has 0 or 1 visit, render a guided prompt with single-visit overview & instant follow-up creation
  if (sortedConsultations.length < 2) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center font-bold">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <span>Visit &amp; Clinical Report Comparison</span>
                <span className="text-[10px] normal-case font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {sortedConsultations.length} visit recorded
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Compare first images from each visit side-by-side in full screen (zoom &amp; mark areas), dictate clinical notes, and generate an editable visit summary
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 mt-0.5">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">
                {sortedConsultations.length === 0
                  ? 'No consultation visits recorded yet for this patient.'
                  : `Currently 1 visit on record (${formatDate(sortedConsultations[0].consultationDate)}).`}
              </p>
              <p className="text-slate-500 leading-relaxed">
                Longitudinal visit comparison allows doctors to inspect the first clinical image from each visit side-by-side in full screen, zoom and mark areas, dictate clinical notes with the microphone, and generate an editable AI visit summary with red-flag &amp; severity indicators.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onStartConsultation(patient)}
              className="px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record New Consultation Visit</span>
            </button>
            <button
              type="button"
              disabled={isCreatingDemoVisit}
              onClick={handleCreateDemoFollowUp}
              className="px-3.5 py-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-teal-800 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
            >
              {isCreatingDemoVisit ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-700" />
                  <span>Generating Follow-up Visit...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Generate Sample Follow-up for Comparison</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeSeverity =
    severityOverride || comparisonResult?.severityChange || 'Severity Decreased (Improving)';

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-2xs transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-4 z-50 overflow-y-auto p-6 bg-white shadow-2xl border-slate-300 space-y-5'
          : 'p-6 space-y-5'
      }`}
    >
      {/* Header with Title, Full-Screen Side-by-Side Image Trigger, and Summary Generator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 flex items-center justify-center shrink-0">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Visit &amp; Clinical Report Comparison Model
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100/70 text-teal-900 border border-teal-200/50">
                Side-by-Side Zoom &amp; Mark
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare first images from each visit in full screen, zoom &amp; mark areas, dictate clinical notes, and generate an editable summary
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setShowSideBySideFullScreenModal(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
            title="Open Full Screen Side-by-Side Image Viewer with Zoom & Area Marking"
          >
            <Maximize2 className="w-3.5 h-3.5 text-teal-300" />
            <span>Full Screen Side-by-Side (Zoom &amp; Mark)</span>
          </button>

          <button
            type="button"
            onClick={handleGenerateAIReport}
            disabled={isGeneratingAIReport}
            className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100/80 border border-teal-200 text-teal-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Generate Visit Summary with Minor AI Suggestions"
          >
            {isGeneratingAIReport ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-700" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            )}
            <span>Generate Visit Summary</span>
          </button>

          <button
            type="button"
            onClick={handleCopyReport}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs transition"
            title="Copy comparison summary to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs transition"
            title={isFullScreen ? 'Exit Expanded Panel' : 'Expand Comparison Panel'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Dual Visit Selection Bar */}
      <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
        {/* Visit A Selector */}
        <div className="md:col-span-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Visit A · Baseline / Prior
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {formatDate(visitA?.consultationDate)}
            </span>
          </div>
          <select
            value={visitAId}
            onChange={e => setVisitAId(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-500 font-medium"
          >
            {sortedConsultations.map((c, idx) => (
              <option key={c.id} value={c.id} disabled={c.id === visitBId}>
                #{idx + 1} — {formatDate(c.consultationDate)} · {c.diagnoses.join(', ') || 'General review'} ({c.doctorName})
              </option>
            ))}
          </select>
        </div>

        {/* Swap & Interval Column */}
        <div className="md:col-span-1 flex flex-col items-center justify-center py-1">
          <button
            type="button"
            onClick={handleSwapVisits}
            className="p-2 rounded-xl bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-slate-600 hover:text-teal-800 shadow-2xs transition"
            title="Swap Visit A and Visit B"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-slate-400 mt-1">
            {getIntervalDays()}d
          </span>
        </div>

        {/* Visit B Selector */}
        <div className="md:col-span-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Visit B · Follow-up / Recent
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {formatDate(visitB?.consultationDate)}
            </span>
          </div>
          <select
            value={visitBId}
            onChange={e => setVisitBId(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-500 font-medium"
          >
            {sortedConsultations.map((c, idx) => (
              <option key={c.id} value={c.id} disabled={c.id === visitAId}>
                #{idx + 1} — {formatDate(c.consultationDate)} · {c.diagnoses.join(', ') || 'General review'} ({c.doctorName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison View Sub-Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-100 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('images')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeTab === 'images'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>1. Visit Images &amp; Full-Screen Mark ({imagesA.length} vs {imagesB.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeTab === 'reports'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Reports &amp; Investigations ({visitA?.tests?.length || 0} vs {visitB?.tests?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('examinations')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeTab === 'examinations'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          <span>Diagnoses &amp; Notes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('prescriptions')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeTab === 'prescriptions'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Pill className="w-3.5 h-3.5" />
          <span>Prescriptions Diff</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!comparisonResult) {
              handleGenerateAIReport();
            }
            setActiveTab('ai_summary');
          }}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeTab === 'ai_summary'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'text-teal-800 hover:bg-teal-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>Visit Summary &amp; AI Pointers</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: FIRST IMAGES FROM EACH VISIT + FULL SCREEN SIDE-BY-SIDE */}
      {/* ======================================================== */}
      {activeTab === 'images' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Showing the <strong>first clinical image from each visit</strong> across a <strong>{getIntervalDays()} day</strong> interval.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSideBySideFullScreenModal(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-2xs transition"
              >
                <Maximize2 className="w-3.5 h-3.5 text-teal-300" />
                <span>View Full Screen Side-by-Side (Zoom &amp; Mark Areas)</span>
              </button>

              {selectedImgA && selectedImgB && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowImageSlider(!showImageSlider)}
                    className={`px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1 transition ${
                      showImageSlider ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>{showImageSlider ? 'Dual Screen Mode' : 'Overlay Slider Mode'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCompareImagesWithAI}
                    disabled={isComparingProgression}
                    className="px-2.5 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-medium flex items-center gap-1 shadow-2xs transition"
                  >
                    {isComparingProgression ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>AI Lesion Diff</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Interactive Overlay Slider Mode */}
          {showImageSlider && selectedImgA && selectedImgB ? (
            <div className="space-y-2 bg-slate-900 p-4 rounded-2xl text-white">
              <div className="flex items-center justify-between text-xs text-slate-300 pb-2">
                <span>◀ Visit A ({formatDate(visitA?.consultationDate)})</span>
                <span className="font-mono text-teal-300 font-bold">{imageSliderPos}% Blend</span>
                <span>Visit B ({formatDate(visitB?.consultationDate)}) ▶</span>
              </div>
              <div className="relative h-80 w-full overflow-hidden rounded-xl bg-black flex items-center justify-center">
                <img
                  src={selectedImgA.url}
                  alt="Visit A"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${imageSliderPos}%`, borderRight: '2px solid #2dd4bf' }}
                >
                  <img
                    src={selectedImgB.url}
                    alt="Visit B"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ width: '100%', maxWidth: 'none' }}
                  />
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSliderPos}
                onChange={e => setImageSliderPos(Number(e.target.value))}
                className="w-full accent-teal-400 cursor-pointer"
              />
            </div>
          ) : (
            /* Side-by-Side Dual Card View (First Image from Visit A & First Image from Visit B) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Visit A Image Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Visit A · First Image ({formatDate(visitA?.consultationDate)})
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {imagesA.length} photo(s)
                  </span>
                </div>

                {imagesA.length === 0 ? (
                  <div className="h-60 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-xs p-4 text-center">
                    <ImageIcon className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No clinical image attached in Visit A</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Photos can be taken or attached during consultations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      onClick={() => setShowSideBySideFullScreenModal(true)}
                      className="relative h-64 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group cursor-pointer"
                      title="Click to open Full Screen Side-by-Side Zoom & Area Marking"
                    >
                      <img
                        src={selectedImgA?.url || imagesA[0].url}
                        alt="Visit A lesion"
                        className="w-full h-full object-contain"
                      />
                      {renderCardAnnotationPreview('A')}
                      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-95 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setShowSideBySideFullScreenModal(true);
                          }}
                          className="px-2.5 py-1 bg-slate-900/90 hover:bg-black text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/15 shadow-sm"
                        >
                          <Maximize2 className="w-3 h-3 text-teal-300" />
                          <span>Full Screen &amp; Mark</span>
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setZoomImage(selectedImgA || imagesA[0]);
                          }}
                          className="p-1.5 bg-black/60 hover:bg-black text-white rounded-lg text-xs"
                          title="Quick Zoom"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Image Selector Strip if multiple */}
                    {imagesA.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto py-1">
                        {imagesA.map((img, idx) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setSelectedImgA(img)}
                            className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition relative ${
                              selectedImgA?.id === img.id ? 'border-blue-500 shadow-xs' : 'border-slate-200 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={img.url} alt="thumbnail" className="w-full h-full object-cover" />
                            {idx === 0 && (
                              <span className="absolute bottom-0 inset-x-0 bg-blue-600/90 text-white text-[8px] font-bold text-center">
                                1st
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-xs text-slate-600 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">
                          {selectedImgA?.caption || 'First clinical photograph (Visit A)'}
                        </div>
                        {selectedImgA?.tags && selectedImgA.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedImgA.tags.map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {annotations.filter(a => a.side === 'A').length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          {annotations.filter(a => a.side === 'A').length} marked area(s)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Visit B Image Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Visit B · First Image ({formatDate(visitB?.consultationDate)})
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {imagesB.length} photo(s)
                  </span>
                </div>

                {imagesB.length === 0 ? (
                  <div className="h-60 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-xs p-4 text-center">
                    <ImageIcon className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No clinical image attached in Visit B</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Photos can be taken or attached during consultations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      onClick={() => setShowSideBySideFullScreenModal(true)}
                      className="relative h-64 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group cursor-pointer"
                      title="Click to open Full Screen Side-by-Side Zoom & Area Marking"
                    >
                      <img
                        src={selectedImgB?.url || imagesB[0].url}
                        alt="Visit B lesion"
                        className="w-full h-full object-contain"
                      />
                      {renderCardAnnotationPreview('B')}
                      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-95 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setShowSideBySideFullScreenModal(true);
                          }}
                          className="px-2.5 py-1 bg-slate-900/90 hover:bg-black text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/15 shadow-sm"
                        >
                          <Maximize2 className="w-3 h-3 text-teal-300" />
                          <span>Full Screen &amp; Mark</span>
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setZoomImage(selectedImgB || imagesB[0]);
                          }}
                          className="p-1.5 bg-black/60 hover:bg-black text-white rounded-lg text-xs"
                          title="Quick Zoom"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Image Selector Strip if multiple */}
                    {imagesB.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto py-1">
                        {imagesB.map((img, idx) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setSelectedImgB(img)}
                            className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition relative ${
                              selectedImgB?.id === img.id ? 'border-emerald-500 shadow-xs' : 'border-slate-200 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={img.url} alt="thumbnail" className="w-full h-full object-cover" />
                            {idx === 0 && (
                              <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[8px] font-bold text-center">
                                1st
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-xs text-slate-600 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">
                          {selectedImgB?.caption || 'First clinical photograph (Visit B)'}
                        </div>
                        {selectedImgB?.tags && selectedImgB.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedImgB.tags.map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {annotations.filter(a => a.side === 'B').length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          {annotations.filter(a => a.side === 'B').length} marked area(s)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Marked Areas Summary Bar (if doctor marked areas in Full Screen) */}
          {annotations.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                  Marked ROI Areas ({annotations.length}):
                </span>
                {annotations.map((mark, idx) => (
                  <span
                    key={mark.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px]"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mark.color }} />
                    <span>
                      #{idx + 1} [Visit {mark.side}] {mark.label}
                    </span>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowSideBySideFullScreenModal(true)}
                className="text-[11px] font-semibold text-teal-300 hover:underline"
              >
                Edit Marks in Full Screen →
              </button>
            </div>
          )}

          {/* AI Lesion Progression Insights Panel (if run) */}
          {progressionResult && (
            <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-bold text-teal-950 uppercase tracking-wider">
                    AI Multimodal Lesion Differential
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                      progressionResult.progressionScore >= 30
                        ? 'bg-emerald-100 text-emerald-800'
                        : progressionResult.progressionScore <= -15
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {progressionResult.overallProgression} (
                    {progressionResult.progressionScore > 0
                      ? `+${progressionResult.progressionScore}`
                      : progressionResult.progressionScore}
                    )
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {progressionResult.treatmentResponseSummary}
              </p>

              {progressionResult.visualComparisonObservations &&
                progressionResult.visualComparisonObservations.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-teal-900 block">
                      Morphological Observations:
                    </span>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                      {progressionResult.visualComparisonObservations.map((obs, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-teal-100"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: REPORTS & INVESTIGATIONS */}
      {/* ======================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Visit A Reports ({formatDate(visitA?.consultationDate)})
                </span>
                <span className="text-[11px] text-slate-500">
                  {visitA?.tests?.length || 0} test(s) advised
                </span>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Diagnostic Tests Ordered:
                </span>
                {!visitA?.tests || visitA.tests.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No specific lab tests recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {visitA.tests.map(t => (
                      <span
                        key={t}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Investigation &amp; Lab Notes:
                </span>
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 leading-relaxed min-h-[60px]">
                  {visitA?.clinicalNotes?.investigationsAdvised ||
                    'No detailed lab notes recorded during this encounter.'}
                </div>
              </div>

              {visitA?.procedures && visitA.procedures.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Clinical Procedures Conducted:
                  </span>
                  <div className="space-y-1">
                    {visitA.procedures.map(proc => (
                      <div
                        key={proc.id}
                        className="p-2 bg-white rounded-lg border border-slate-200 text-xs flex justify-between"
                      >
                        <span className="font-semibold text-slate-800">{proc.name}</span>
                        <span className="text-slate-500">
                          ₹{Number(proc.cost || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Visit B Reports ({formatDate(visitB?.consultationDate)})
                </span>
                <span className="text-[11px] text-slate-500">
                  {visitB?.tests?.length || 0} test(s) advised
                </span>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Diagnostic Tests Ordered:
                </span>
                {!visitB?.tests || visitB.tests.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No specific lab tests recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {visitB.tests.map(t => {
                      const isNew = !visitA?.tests?.some(ta => ta.toLowerCase() === t.toLowerCase());
                      return (
                        <span
                          key={t}
                          className={`px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 ${
                            isNew
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {t}
                          {isNew && (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1 rounded">
                              NEW
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Investigation &amp; Lab Notes:
                </span>
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 leading-relaxed min-h-[60px]">
                  {visitB?.clinicalNotes?.investigationsAdvised ||
                    'No detailed lab notes recorded during this encounter.'}
                </div>
              </div>

              {visitB?.procedures && visitB.procedures.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Clinical Procedures Conducted:
                  </span>
                  <div className="space-y-1">
                    {visitB.procedures.map(proc => (
                      <div
                        key={proc.id}
                        className="p-2 bg-white rounded-lg border border-slate-200 text-xs flex justify-between"
                      >
                        <span className="font-semibold text-slate-800">{proc.name}</span>
                        <span className="text-slate-500">
                          ₹{Number(proc.cost || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: EXAMINATIONS & DIAGNOSES */}
      {/* ======================================================== */}
      {activeTab === 'examinations' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Visit A Findings ({formatDate(visitA?.consultationDate)})
              </span>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Documented Diagnoses:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {visitA?.diagnoses.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">None recorded</span>
                  ) : (
                    visitA?.diagnoses.map(d => (
                      <span
                        key={d}
                        className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold"
                      >
                        {d}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Chief Complaints / Symptoms:
                </span>
                <div className="flex flex-wrap gap-1">
                  {visitA?.symptoms.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">None recorded</span>
                  ) : (
                    visitA?.symptoms.map(s => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-xs"
                      >
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Physical Examination Notes:
                </span>
                <p className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {visitA?.clinicalNotes?.examination || 'No physical examination narrative documented.'}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Management Plan:
                </span>
                <p className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {visitA?.clinicalNotes?.plan || 'No management plan recorded.'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Visit B Findings ({formatDate(visitB?.consultationDate)})
              </span>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Documented Diagnoses:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {visitB?.diagnoses.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">None recorded</span>
                  ) : (
                    visitB?.diagnoses.map(d => {
                      const isNew = !visitA?.diagnoses.some(da => da.toLowerCase() === d.toLowerCase());
                      return (
                        <span
                          key={d}
                          className={`px-2 py-0.5 rounded-md border text-xs font-semibold flex items-center gap-1 ${
                            isNew
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-teal-50 border-teal-200 text-teal-900'
                          }`}
                        >
                          {d}
                          {isNew && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">
                              NEW
                            </span>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Chief Complaints / Symptoms:
                </span>
                <div className="flex flex-wrap gap-1">
                  {visitB?.symptoms.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">None recorded</span>
                  ) : (
                    visitB?.symptoms.map(s => {
                      const isNew = !visitA?.symptoms.some(sa => sa.toLowerCase() === s.toLowerCase());
                      return (
                        <span
                          key={s}
                          className={`px-2 py-0.5 rounded text-xs ${
                            isNew
                              ? 'bg-amber-50 border border-amber-200 text-amber-900 font-medium'
                              : 'bg-white border border-slate-200 text-slate-700'
                          }`}
                        >
                          {s}
                          {isNew && ' (New)'}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Physical Examination Notes:
                </span>
                <p className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {visitB?.clinicalNotes?.examination || 'No physical examination narrative documented.'}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Management Plan:
                </span>
                <p className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {visitB?.clinicalNotes?.plan || 'No management plan recorded.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: PRESCRIPTION DIFF */}
      {/* ======================================================== */}
      {activeTab === 'prescriptions' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Visit A ({formatDate(visitA?.consultationDate)})</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {visitA?.prescriptions?.length || 0} items
                </span>
              </span>

              <div className="space-y-1.5">
                {!visitA?.prescriptions || visitA.prescriptions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 text-center">
                    No medications prescribed in Visit A
                  </p>
                ) : (
                  visitA.prescriptions.map(rx => (
                    <div
                      key={rx.id}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs space-y-0.5"
                    >
                      <div className="font-semibold text-slate-900">{rx.medicineName}</div>
                      <div className="text-[11px] text-slate-600">
                        {rx.dosage} · {rx.frequency} · {rx.duration}
                      </div>
                      {rx.instructions && (
                        <div className="text-[10px] text-slate-400">{rx.instructions}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Visit B ({formatDate(visitB?.consultationDate)})</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {visitB?.prescriptions?.length || 0} items
                </span>
              </span>

              <div className="space-y-1.5">
                {!visitB?.prescriptions || visitB.prescriptions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 text-center">
                    No medications prescribed in Visit B
                  </p>
                ) : (
                  visitB.prescriptions.map(rx => {
                    const isNew = !visitA?.prescriptions?.some(
                      rxa => rxa.medicineName.toLowerCase() === rx.medicineName.toLowerCase()
                    );
                    return (
                      <div
                        key={rx.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${
                          isNew ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{rx.medicineName}</span>
                          {isNew && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              NEW REGIMEN
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {rx.dosage} · {rx.frequency} · {rx.duration}
                        </div>
                        {rx.instructions && (
                          <div className="text-[10px] text-slate-400">{rx.instructions}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CLINICAL NOTES WITH MIC OPTION + GENERATE EDITABLE VISIT SUMMARY */}
      {/* (Always visible in comparison model & in AI Summary tab) */}
      {/* ======================================================== */}
      <div className="pt-2 border-t border-slate-100 space-y-4">
        {/* 3. Clinical Notes Option with Mic Dictation */}
        <div className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-teal-700" />
                <span>Clinical Comparison Notes (with Voice Dictation / Mic)</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Type or use the microphone to dictate clinical notes while comparing visits
              </p>
            </div>
            <div className="flex items-center gap-2">
              <VoiceDictationButton
                value={comparisonClinicalNotes}
                onChange={setComparisonClinicalNotes}
                variant="prominent"
                label="Dictate Note (Mic)"
              />
              {comparisonClinicalNotes.trim() && (
                <button
                  type="button"
                  onClick={handleSaveNotesToVisit}
                  disabled={isSavingNotes}
                  className="px-3 py-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-teal-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
                >
                  {savedNotesSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Saved to Visit</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 text-teal-700" />
                      <span>{isSavingNotes ? 'Saving...' : 'Save Note'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={2}
            value={comparisonClinicalNotes}
            onChange={e => setComparisonClinicalNotes(e.target.value)}
            placeholder="Record comparative clinical observations (e.g., erythema reduced by 50%, peripheral border stable, or severity increased) — tap 'Dictate Note (Mic)' to speak..."
            className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 leading-relaxed"
          />

          {/* Quick Clinical Note Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Quick Insert:
            </span>
            {[
              'Lesion erythema and scaling reduced significantly.',
              'Severity increased at peripheral border — rule out secondary infection.',
              'No new red flags observed; patient tolerating topical regimen well.',
              'Step down topical steroid to maintenance barrier therapy.'
            ].map(chip => (
              <button
                key={chip}
                type="button"
                onClick={() =>
                  setComparisonClinicalNotes(prev =>
                    prev.trim() ? `${prev.trim()} ${chip}` : chip
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-[11px] text-slate-600 hover:text-teal-900 transition"
              >
                + {chip}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Generate Visit Summary with Minor AI Suggestions (Red Flags, Severity Increased) & Doctor Edit Mode */}
        <div className="bg-teal-50/50 p-4 rounded-2xl border border-teal-200/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-700" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-950">
                  Visit Comparison Summary &amp; Minor AI Suggestions
                </h4>
                <p className="text-[11px] text-slate-600">
                  Generates a visit summary with minor AI suggestions (Red Flags, Severity status) that the doctor can freely edit
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateAIReport}
              disabled={isGeneratingAIReport}
              className="px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
            >
              {isGeneratingAIReport ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Summary...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{comparisonResult ? 'Regenerate Visit Summary' : 'Generate Summary'}</span>
                </>
              )}
            </button>
          </div>

          {comparisonResult && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Minor AI Suggestions: Severity Status + Red Flags + Quick Clinical Pointers */}
              <div className="p-3.5 rounded-xl bg-white border border-teal-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    Minor AI Clinical Suggestions (Click any chip to insert into summary)
                  </span>

                  {/* Severity Status Pill Selector */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Severity:</span>
                    {(
                      [
                        'Severity Increased',
                        'Severity Stable',
                        'Severity Decreased (Improving)'
                      ] as const
                    ).map(sev => {
                      const isSelected = activeSeverity === sev;
                      const isIncreased = sev === 'Severity Increased';
                      const isDecreased = sev === 'Severity Decreased (Improving)';
                      return (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => {
                            setSeverityOverride(sev);
                            handleInsertSuggestionIntoSummary(`[Status: ${sev}]`);
                          }}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 transition ${
                            isSelected
                              ? isIncreased
                                ? 'bg-rose-100 border-rose-300 text-rose-800'
                                : isDecreased
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                : 'bg-amber-100 border-amber-300 text-amber-800'
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {isIncreased ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : isDecreased ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : null}
                          <span>{sev}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Red Flags (Minor AI Suggestions) */}
                {comparisonResult.redFlags && comparisonResult.redFlags.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      Red Flags / Watch Pointers:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {comparisonResult.redFlags.map((rf, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleInsertSuggestionIntoSummary(`Red Flag Note: ${rf}`)}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-rose-50/80 hover:bg-rose-100 border border-rose-200 text-[11px] text-rose-900 flex items-center gap-1.5 transition"
                          title="Click to append this red flag note into the editable summary"
                        >
                          <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{rf}</span>
                          <span className="text-[10px] font-bold text-rose-700 ml-1 shrink-0">+ Add</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Minor AI Clinical Suggestions */}
                {comparisonResult.minorSuggestions && comparisonResult.minorSuggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 block">
                      Minor AI Suggestions:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {comparisonResult.minorSuggestions.map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleInsertSuggestionIntoSummary(sug)}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-teal-50/70 hover:bg-teal-100 border border-teal-200 text-[11px] text-teal-950 flex items-center gap-1.5 transition"
                          title="Click to insert into editable summary"
                        >
                          <ChevronRight className="w-3 h-3 text-teal-700 shrink-0" />
                          <span>{sug}</span>
                          <span className="text-[10px] font-bold text-teal-800 ml-1 shrink-0">+ Add</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Doctor Editable Summary Box */}
              <div className="bg-white p-3.5 rounded-xl border border-teal-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Pencil className="w-3.5 h-3.5 text-teal-700" />
                      <span>Doctor&apos;s Editable Visit Comparison Summary</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                      {isEditingSummary ? 'Editing Enabled' : 'Read-Only Preview'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <VoiceDictationButton
                      value={editableSummaryText}
                      onChange={setEditableSummaryText}
                      variant="button"
                      label="Mic Edit"
                    />
                    <button
                      type="button"
                      onClick={() => setIsEditingSummary(!isEditingSummary)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{isEditingSummary ? 'Preview' : 'Edit Summary'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditableSummaryText(comparisonResult.summaryText)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500"
                      title="Reset to initial generated summary"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSummaryToVisit}
                      disabled={isSavingSummary}
                      className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs transition"
                    >
                      {savedSummarySuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Saved!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSavingSummary ? 'Saving...' : 'Save Summary'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {isEditingSummary ? (
                  <textarea
                    rows={4}
                    value={editableSummaryText}
                    onChange={e => setEditableSummaryText(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-teal-600 focus:bg-white leading-relaxed font-medium"
                    placeholder="Edit the generated visit comparison summary here..."
                  />
                ) : (
                  <p
                    onClick={() => setIsEditingSummary(true)}
                    className="text-xs text-slate-800 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-xl border border-slate-200 cursor-text"
                    title="Click to edit summary"
                  >
                    {editableSummaryText}
                  </p>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>
                    Evaluated across {comparisonResult.intervalDays} days • Doctor can freely edit or dictate changes before saving.
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Full Comparison'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Side-by-Side Image Zoom & Area Marking Modal */}
      <FullScreenSideBySideModal
        isOpen={showSideBySideFullScreenModal}
        onClose={() => setShowSideBySideFullScreenModal(false)}
        imageA={selectedImgA || imagesA[0] || null}
        imageB={selectedImgB || imagesB[0] || null}
        visitALabel="Visit A · First Image"
        visitBLabel="Visit B · First Image"
        visitADate={formatDate(visitA?.consultationDate)}
        visitBDate={formatDate(visitB?.consultationDate)}
        annotations={annotations}
        onChangeAnnotations={setAnnotations}
        clinicalNotes={comparisonClinicalNotes}
        onChangeClinicalNotes={setComparisonClinicalNotes}
        onGenerateSummaryFromModal={handleGenerateAIReport}
      />

      {/* Single Image Quick Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setZoomImage(null)}
        >
          <div
            className="max-w-3xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <img src={zoomImage.url} alt="Zoomed view" className="w-full max-h-[80vh] object-contain" />
            <div className="p-3 bg-slate-800 text-white text-xs flex justify-between items-center">
              <span>
                {zoomImage.caption || 'Clinical Photograph'} · {formatDate(zoomImage.createdAt)}
              </span>
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
