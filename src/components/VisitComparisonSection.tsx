import React, { useState, useEffect } from 'react';
import { Patient, Consultation, ClinicalImage, VisitComparisonResult, ProgressionAnalysisResult } from '../types';
import { api } from '../lib/api';
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
  Plus,
  Stethoscope,
  TrendingUp,
  TrendingDown,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  Download,
  Share2,
  RefreshCw,
  Clock,
  Layers,
  ZoomIn
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
  onRefreshData,
  onOpenWhatsApp
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
      // Pick first and latest if not already set or invalid
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

  const visitA = sortedConsultations.find(c => c.id === visitAId) || sortedConsultations[0];
  const visitB = sortedConsultations.find(c => c.id === visitBId) || sortedConsultations[sortedConsultations.length - 1];

  // Helper to get all clinical images associated with a visit
  const getVisitImages = (consultation?: Consultation): ClinicalImage[] => {
    if (!consultation) return [];
    const directImages = consultation.images || [];

    // Also match any patient clinical images uploaded on the same calendar day
    const visitDateStr = consultation.consultationDate.split('T')[0];
    const matchingGlobalImages = images.filter(img => {
      const imgDateStr = img.createdAt.split('T')[0];
      return imgDateStr === visitDateStr && !directImages.some(di => di.id === img.id);
    });

    return [...directImages, ...matchingGlobalImages];
  };

  const imagesA = getVisitImages(visitA);
  const imagesB = getVisitImages(visitB);

  // Sync selected images when visits change
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

    // Reset AI outputs when visit pair changes
    setProgressionResult(null);
    setComparisonResult(null);
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
        clinicalContext: `Comparing lesion progression between visit on ${formatDate(visitA.consultationDate)} and ${formatDate(visitB.consultationDate)}. Diagnoses: ${visitB.diagnoses.join(', ') || visitA.diagnoses.join(', ')}`
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
      const res = await api.ai.compareVisits({
        visitAId: visitA.id,
        visitBId: visitB.id,
        patientId: patient.id
      });
      setComparisonResult(res.comparison);
      setActiveTab('ai_summary');
    } catch (err) {
      console.error('Visit AI comparison error:', err);
    } finally {
      setIsGeneratingAIReport(false);
    }
  };

  const handleCopyReport = () => {
    if (!visitA || !visitB) return;
    const interval = getIntervalDays();
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

${comparisonResult ? `\nAI LONGITUDINAL SYNTHESIS:
Status: ${comparisonResult.overallStatus}
${comparisonResult.summaryText}

Recommendations:
${comparisonResult.recommendations.map(r => `• ${r}`).join('\n')}` : ''}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateDemoFollowUp = async () => {
    setIsCreatingDemoVisit(true);
    try {
      // Create a realistic follow-up visit for immediate comparison demonstration
      const res = await api.consultations.create({
        patientId: patient.id,
        symptoms: ['Mild residual redness', 'Significant reduction in pruritus / itching']
      });

      // Update with clinical notes, diagnoses, tests, and prescriptions
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
                <span>Visit & Clinical Report Comparison</span>
                <span className="text-[10px] normal-case font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {sortedConsultations.length} visit recorded
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Compare reports, clinical findings, investigations, and lesion photographs between two visits
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
                Longitudinal visit comparison allows doctors to inspect side-by-side diagnostic reports, lab investigations, medication titration, and lesion photography changes over time.
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

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xs transition-all duration-200 ${
      isFullScreen ? 'fixed inset-4 z-50 overflow-y-auto p-6 bg-white shadow-2xl border-slate-300' : 'p-6 space-y-5'
    }`}>
      {/* Header with Title, Mode Switcher, and Fullscreen toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 flex items-center justify-center shrink-0">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Visit & Clinical Report Comparison
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100/70 text-teal-900 border border-teal-200/50">
                Longitudinal Tracking
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side analysis of clinical photographs, diagnostic reports, examinations, and prescriptions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleGenerateAIReport}
            disabled={isGeneratingAIReport}
            className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100/80 border border-teal-200 text-teal-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Generate AI Longitudinal Synthesis"
          >
            {isGeneratingAIReport ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-700" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            )}
            <span>AI Interval Summary</span>
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
            title={isFullScreen ? 'Exit Full Screen' : 'Expand Full Screen'}
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
          <span>Clinical Images ({imagesA.length} vs {imagesB.length})</span>
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
          <span>Reports & Investigations ({visitA?.tests?.length || 0} vs {visitB?.tests?.length || 0})</span>
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
          <span>Diagnoses & Notes</span>
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
            } else {
              setActiveTab('ai_summary');
            }
          }}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition shrink-0 ${
            activeTab === 'ai_summary'
              ? 'bg-teal-800 text-white shadow-2xs'
              : 'text-teal-800 hover:bg-teal-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>AI Interval Report</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: CLINICAL IMAGES COMPARISON */}
      {/* ======================================================== */}
      {activeTab === 'images' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Comparing photographic findings across a <strong>{getIntervalDays()} day</strong> interval.
            </span>
            {selectedImgA && selectedImgB && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImageSlider(!showImageSlider)}
                  className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 transition ${
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
                  className="px-2.5 py-1 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-medium flex items-center gap-1 shadow-2xs transition"
                >
                  {isComparingProgression ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>AI Lesion Diff</span>
                </button>
              </div>
            )}
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
                {/* Image A (underneath) */}
                <img
                  src={selectedImgA.url}
                  alt="Visit A"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                {/* Image B (clipped on top) */}
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
            /* Side-by-Side Dual Card View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Visit A Image Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Visit A Photo ({formatDate(visitA?.consultationDate)})
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
                    <div className="relative h-64 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group">
                      <img
                        src={selectedImgA?.url || imagesA[0].url}
                        alt="Visit A lesion"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImage(selectedImgA || imagesA[0])}
                        className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black text-white rounded-lg text-xs opacity-0 group-hover:opacity-100 transition"
                        title="Zoom full image"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Image Selector Strip if multiple */}
                    {imagesA.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto py-1">
                        {imagesA.map(img => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setSelectedImgA(img)}
                            className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition ${
                              selectedImgA?.id === img.id ? 'border-blue-500 shadow-xs' : 'border-slate-200 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={img.url} alt="thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">
                        {selectedImgA?.caption || 'Baseline clinical photograph'}
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
                  </div>
                )}
              </div>

              {/* Visit B Image Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Visit B Photo ({formatDate(visitB?.consultationDate)})
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
                    <div className="relative h-64 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center group">
                      <img
                        src={selectedImgB?.url || imagesB[0].url}
                        alt="Visit B lesion"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImage(selectedImgB || imagesB[0])}
                        className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black text-white rounded-lg text-xs opacity-0 group-hover:opacity-100 transition"
                        title="Zoom full image"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Image Selector Strip if multiple */}
                    {imagesB.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto py-1">
                        {imagesB.map(img => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setSelectedImgB(img)}
                            className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition ${
                              selectedImgB?.id === img.id ? 'border-emerald-500 shadow-xs' : 'border-slate-200 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={img.url} alt="thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">
                        {selectedImgB?.caption || 'Follow-up clinical photograph'}
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
                  </div>
                )}
              </div>
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
                  <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                    progressionResult.progressionScore >= 30
                      ? 'bg-emerald-100 text-emerald-800'
                      : progressionResult.progressionScore <= -15
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {progressionResult.overallProgression} ({progressionResult.progressionScore > 0 ? `+${progressionResult.progressionScore}` : progressionResult.progressionScore})
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {progressionResult.treatmentResponseSummary}
              </p>

              {progressionResult.visualComparisonObservations && progressionResult.visualComparisonObservations.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-teal-900 block">Morphological Observations:</span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                    {progressionResult.visualComparisonObservations.map((obs, i) => (
                      <li key={i} className="flex items-start gap-1.5 bg-white/70 p-2 rounded-lg border border-teal-100">
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
            {/* Visit A Reports & Tests */}
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

              {/* Tests Advised */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Diagnostic Tests Ordered:
                </span>
                {!visitA?.tests || visitA.tests.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No specific lab tests recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {visitA.tests.map(t => (
                      <span key={t} className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Investigations Advised Notes */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Investigation & Lab Notes:
                </span>
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 leading-relaxed min-h-[60px]">
                  {visitA?.clinicalNotes?.investigationsAdvised || 'No detailed lab notes recorded during this encounter.'}
                </div>
              </div>

              {/* Procedures Conducted */}
              {visitA?.procedures && visitA.procedures.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Clinical Procedures Conducted:
                  </span>
                  <div className="space-y-1">
                    {visitA.procedures.map(proc => (
                      <div key={proc.id} className="p-2 bg-white rounded-lg border border-slate-200 text-xs flex justify-between">
                        <span className="font-semibold text-slate-800">{proc.name}</span>
                        <span className="text-slate-500">₹{proc.cost}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Visit B Reports & Tests */}
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

              {/* Tests Advised */}
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
                          {isNew && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1 rounded">NEW</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Investigations Advised Notes */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Investigation & Lab Notes:
                </span>
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 leading-relaxed min-h-[60px]">
                  {visitB?.clinicalNotes?.investigationsAdvised || 'No detailed lab notes recorded during this encounter.'}
                </div>
              </div>

              {/* Procedures Conducted */}
              {visitB?.procedures && visitB.procedures.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Clinical Procedures Conducted:
                  </span>
                  <div className="space-y-1">
                    {visitB.procedures.map(proc => (
                      <div key={proc.id} className="p-2 bg-white rounded-lg border border-slate-200 text-xs flex justify-between">
                        <span className="font-semibold text-slate-800">{proc.name}</span>
                        <span className="text-slate-500">₹{proc.cost}</span>
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
            {/* Visit A Examination */}
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
                      <span key={d} className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
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
                      <span key={s} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-xs">
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

            {/* Visit B Examination */}
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
                          {isNew && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">NEW</span>}
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
            {/* Visit A Prescriptions */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Visit A ({formatDate(visitA?.consultationDate)})</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {visitA?.prescriptions?.length || 0} items
                </span>
              </span>

              <div className="space-y-1.5">
                {!visitA?.prescriptions || visitA.prescriptions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 text-center">No medications prescribed in Visit A</p>
                ) : (
                  visitA.prescriptions.map(rx => (
                    <div key={rx.id} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs space-y-0.5">
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

            {/* Visit B Prescriptions */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Visit B ({formatDate(visitB?.consultationDate)})</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  {visitB?.prescriptions?.length || 0} items
                </span>
              </span>

              <div className="space-y-1.5">
                {!visitB?.prescriptions || visitB.prescriptions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 text-center">No medications prescribed in Visit B</p>
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
      {/* TAB 5: AI LONGITUDINAL SUMMARY */}
      {/* ======================================================== */}
      {activeTab === 'ai_summary' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {!comparisonResult ? (
            <div className="p-8 text-center text-slate-500 space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
              <Sparkles className="w-8 h-8 text-teal-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-800">
                Generate an AI longitudinal comparative synthesis between these two encounters
              </p>
              <button
                type="button"
                onClick={handleGenerateAIReport}
                disabled={isGeneratingAIReport}
                className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-2xs transition inline-flex items-center gap-1.5"
              >
                {isGeneratingAIReport ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing Clinical Records...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Interval Comparison Report</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-950">
                    AI Clinical Interval Synthesis ({comparisonResult.intervalDays} Days)
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-teal-100 text-teal-900 border border-teal-200">
                  {comparisonResult.overallStatus}
                </span>
              </div>

              <p className="text-xs text-slate-800 leading-relaxed font-medium bg-white/70 p-3.5 rounded-xl border border-teal-100">
                {comparisonResult.summaryText}
              </p>

              {/* Symptom remissions & evolution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {comparisonResult.resolvedSymptoms && comparisonResult.resolvedSymptoms.length > 0 && (
                  <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">
                      Remitted / Resolved Symptoms:
                    </span>
                    <ul className="space-y-1 text-slate-700">
                      {comparisonResult.resolvedSymptoms.map(s => (
                        <li key={s} className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {comparisonResult.persistentSymptoms && comparisonResult.persistentSymptoms.length > 0 && (
                  <div className="p-3 bg-white/80 rounded-xl border border-blue-100">
                    <span className="text-[10px] uppercase font-bold text-blue-700 block mb-1">
                      Ongoing / Persistent Complaints:
                    </span>
                    <ul className="space-y-1 text-slate-700">
                      {comparisonResult.persistentSymptoms.map(s => (
                        <li key={s} className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Actionable recommendations */}
              {comparisonResult.recommendations && comparisonResult.recommendations.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">
                    Recommended Follow-up & Management Adjustments:
                  </span>
                  <div className="space-y-1 text-xs text-slate-700">
                    {comparisonResult.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 bg-white/80 p-2.5 rounded-xl border border-teal-100">
                        <ChevronRight className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-teal-100">
                <span>Evaluated across {comparisonResult.intervalDays} days of longitudinal care.</span>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy Interval Summary'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setZoomImage(null)}
        >
          <div className="max-w-3xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <img src={zoomImage.url} alt="Zoomed view" className="w-full max-h-[80vh] object-contain" />
            <div className="p-3 bg-slate-800 text-white text-xs flex justify-between items-center">
              <span>{zoomImage.caption || 'Clinical Photograph'} · {formatDate(zoomImage.createdAt)}</span>
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
