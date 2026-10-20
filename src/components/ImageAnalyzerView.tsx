import React, { useState, useEffect, useRef } from 'react';
import { Patient, Consultation, AIImageAnalysisResult, ABCDEScoreResult, BodyMarker, VisualMorphologyMetrics } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { analyzeImageVisualFeatures } from '../utils/visualImageAnalyzer';
import { CLINICAL_SAMPLE_CASES, ClinicalPresetCase } from '../utils/clinicalSampleCases';
import { ClinicalImageReportModal } from './ClinicalImageReportModal';
import { DermoscopicToolModal } from './DermoscopicToolModal';
import { PinToBodyMapModal } from './PinToBodyMapModal';
import { WhatsAppShareModal, WhatsAppIcon } from './WhatsAppShareModal';
import { VoiceDictationButton } from './VoiceDictationButton';
import {
  Camera,
  Upload,
  Sparkles,
  AlertTriangle,
  FileText,
  Clock,
  User,
  CheckCircle2,
  Stethoscope,
  ChevronRight,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  Eye,
  ShieldAlert,
  HelpCircle,
  X,
  Plus,
  BookmarkPlus,
  BookmarkCheck,
  Printer,
  Ruler,
  MapPin,
  Pill
} from 'lucide-react';

interface ImageAnalyzerViewProps {
  initialPatientId?: string | null;
  onSelectPatient?: (patientId: string) => void;
  onStartConsultationForPatient?: (patient: Patient, prefill?: { diagnosis: string; notes: string }) => void;
}

export const ImageAnalyzerView: React.FC<ImageAnalyzerViewProps> = ({
  initialPatientId,
  onSelectPatient,
  onStartConsultationForPatient
}) => {
  const { doctor } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<Consultation[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  // Image input state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [anatomicalSite, setAnatomicalSite] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AIImageAnalysisResult | null>(null);
  const [visualMetrics, setVisualMetrics] = useState<VisualMorphologyMetrics | null>(null);
  const [isExtractingFeatures, setIsExtractingFeatures] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSavingToGallery, setIsSavingToGallery] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);

  // Step 4: Modals & Tool state
  const [showReportModal, setShowReportModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showDermoscopicModal, setShowDermoscopicModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [abcdeResult, setAbcdeResult] = useState<ABCDEScoreResult | null>(null);
  const [pinnedSuccess, setPinnedSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load patients on mount
  useEffect(() => {
    api.patients.list()
      .then(res => setPatients(res.patients || []))
      .catch(err => console.warn('Failed to load patients:', err));
  }, []);

  // When selectedPatientId changes, fetch details & timeline
  useEffect(() => {
    if (selectedPatientId) {
      api.patients.get(selectedPatientId)
        .then(res => {
          setSelectedPatient(res.patient);
          return api.patients.getConsultations(selectedPatientId);
        })
        .then(consultRes => {
          setPatientHistory(consultRes.consultations || []);
        })
        .catch(err => {
          console.warn('Failed to fetch patient history:', err);
        });
    } else {
      setSelectedPatient(null);
      setPatientHistory([]);
    }
  }, [selectedPatientId]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: unknown) {
      console.error('Camera error:', err);
      setCameraError('Unable to access camera. Please check permissions or upload a file.');
      setIsCameraActive(false);
    }
  };

  const resetImageState = () => {
    setImageSrc(null);
    setAnalysisResult(null);
    setVisualMetrics(null);
    setErrorMsg(null);
    setCopied(false);
    setSavedToGallery(false);
    setAbcdeResult(null);
    setPinnedSuccess(null);
    setAnalysisStep('');
    setActivePresetId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processImageFile = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 12 MB limit.');
      return;
    }

    // Immediately clear ALL previous analysis, ABCDE scores, metrics, feedback, and notes
    setErrorMsg(null);
    setAnalysisResult(null);
    setVisualMetrics(null);
    setAbcdeResult(null);
    setPinnedSuccess(null);
    setSavedToGallery(false);
    setCopied(false);
    setActivePresetId(null);
    setClinicalNotes('');
    setAnatomicalSite('');
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageSrc(dataUrl);
      setIsExtractingFeatures(true);
      analyzeImageVisualFeatures(dataUrl)
        .then(metrics => setVisualMetrics(metrics))
        .finally(() => setIsExtractingFeatures(false));
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleSelectPreset = (preset: ClinicalPresetCase) => {
    setErrorMsg(null);
    setAnalysisResult(null);
    setVisualMetrics(null);
    setAbcdeResult(null);
    setPinnedSuccess(null);
    setSavedToGallery(false);
    setCopied(false);
    setActivePresetId(preset.id);
    setImageSrc(preset.dataUrl);
    setMimeType('image/svg+xml');
    setAnatomicalSite(preset.anatomicalSite);
    setClinicalNotes(preset.clinicalNote);
    setIsExtractingFeatures(true);
    analyzeImageVisualFeatures(preset.dataUrl)
      .then(metrics => setVisualMetrics(metrics))
      .finally(() => setIsExtractingFeatures(false));
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setErrorMsg(null);
      setAnalysisResult(null); // Clear previous result
      setVisualMetrics(null);
      setAbcdeResult(null);
      setPinnedSuccess(null);
      setSavedToGallery(false);
      setCopied(false);
      setActivePresetId(null);
      setClinicalNotes('');
      setAnatomicalSite('');
      setImageSrc(dataUrl);
      setMimeType('image/jpeg');
      setIsExtractingFeatures(true);
      analyzeImageVisualFeatures(dataUrl)
        .then(metrics => setVisualMetrics(metrics))
        .finally(() => setIsExtractingFeatures(false));
    }
    stopCamera();
  };

  const handleAnalyze = async () => {
    if (!imageSrc) {
      setErrorMsg('Please upload or capture a clinical image first.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setAnalysisStep('Preprocessing visual image morphology...');

    const timer1 = setTimeout(() => {
      setAnalysisStep('Correlating patient longitudinal timeline & prescriptions...');
    }, 900);

    const timer2 = setTimeout(() => {
      setAnalysisStep('Synthesizing evidence-based differential diagnosis...');
    }, 1800);

    try {
      const fullQuery = [
        anatomicalSite ? `Anatomical site: ${anatomicalSite}.` : '',
        clinicalNotes ? `Doctor observation: ${clinicalNotes}` : ''
      ].filter(Boolean).join(' ');

      let metricsToSend = visualMetrics;
      if (!metricsToSend && imageSrc) {
        metricsToSend = await analyzeImageVisualFeatures(imageSrc);
        setVisualMetrics(metricsToSend);
      }

      const res = await api.ai.analyzeImage({
        imageBase64: imageSrc,
        mimeType,
        patientId: selectedPatientId || undefined,
        clinicalNotes: fullQuery || undefined,
        visualMetrics: metricsToSend || undefined
      });

      setAnalysisResult(res.analysis);
      if (res.analysis.visualMetrics) {
        setVisualMetrics(res.analysis.visualMetrics);
      }
      if (res.patient && !selectedPatient) {
        setSelectedPatient(res.patient);
      }

      // Automatically advance view to results section
      setTimeout(() => {
        document.getElementById('analysis-results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setErrorMsg(`AI analysis could not complete: ${msg}`);
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleCopyReport = () => {
    if (!analysisResult) return;
    const lines = [
      `CLINICAL IMAGE DIAGNOSTIC REPORT`,
      `Date: ${new Date().toLocaleDateString()}`,
      selectedPatient ? `Patient: ${selectedPatient.fullName} (${selectedPatient.patientCode}, ${selectedPatient.age}y/${selectedPatient.gender})` : 'Patient: Unlinked Presentation',
      anatomicalSite ? `Anatomical Site: ${anatomicalSite}` : '',
      '',
      `PRIMARY DIAGNOSIS / IMPRESSION:`,
      `${analysisResult.primaryImpression}`,
      '',
      `01. DIFFERENTIAL DIAGNOSIS:`,
      ...analysisResult.differentials.map((d, i) => `${i + 1}. ${d.condition} (${d.confidence} Likelihood${d.icdCode ? ` · ICD-10: ${d.icdCode}` : ''})\n   ${d.rationale}`),
      '',
      `02. KEY VISUAL FINDINGS & PATIENT CONTEXT:`,
      ...analysisResult.visualFindings.map(v => `• ${v}`),
      `History Correlation: ${analysisResult.timelineCorrelation}`,
      '',
      `03. RECOMMENDED TESTS & TREATMENT PLAN:`,
      `Tests / Workup:`,
      ...analysisResult.recommendedInvestigations.map(r => `• ${r}`),
      `Treatment Plan:`,
      analysisResult.suggestedManagementPlan,
      '',
      `04. RED FLAGS TO WATCH:`,
      ...analysisResult.redFlags.map(f => `• ${f}`),
      '',
      `Note: ${analysisResult.disclaimer}`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSaveToGallery = async () => {
    if (!selectedPatient || !imageSrc) return;
    setIsSavingToGallery(true);
    try {
      await api.images.upload({
        patientId: selectedPatient.id,
        dataUrl: imageSrc,
        filename: `ai_eval_${Date.now()}.jpg`,
        caption: analysisResult ? `${analysisResult.primaryImpression} (AI Evaluated)` : 'Clinical Image',
        tags: analysisResult?.differentials.map(d => d.condition) || ['AI Analyzed']
      });
      setSavedToGallery(true);
      setTimeout(() => setSavedToGallery(false), 3000);
    } catch (err) {
      console.warn('Failed to save to gallery:', err);
    } finally {
      setIsSavingToGallery(false);
    }
  };


  const filteredPatients = patients.filter(p =>
    p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patientCode.toLowerCase().includes(patientSearch.toLowerCase()) ||
    (p.mobile && p.mobile.includes(patientSearch))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              Multimodal Vision AI
            </span>
            <span className="text-xs font-medium text-slate-500">
              Grounded in Patient Timeline
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            AI Clinical Image Analyzer
          </h1>
          <p className="text-sm text-slate-600 mt-0.5 max-w-2xl">
            Upload lesion, rash, dermoscopic, or clinical photographs. The model cross-references visual morphology with the patient's longitudinal history, medications, and previous visits to suggest targeted differential diagnoses.
          </p>
        </div>
      </div>

      {/* Main Grid: Left = Input & Timeline, Right = Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Patient Context & Upload (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Patient Selector Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-700" />
                Linked Patient Profile
              </label>
              {selectedPatient && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatientId('');
                    setSelectedPatient(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Unlink
                </button>
              )}
            </div>

            {/* Custom Searchable Dropdown */}
            <div className="relative">
              <div
                onClick={() => setShowPatientDropdown(!showPatientDropdown)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition text-sm"
              >
                {selectedPatient ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-900 truncate">
                      {selectedPatient.fullName}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-medium shrink-0">
                      {selectedPatient.patientCode}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      ({selectedPatient.age}y, {selectedPatient.gender})
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400">
                    Select a patient (or analyze unlinked)...
                  </span>
                )}
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showPatientDropdown ? 'rotate-90' : ''}`} />
              </div>

              {showPatientDropdown && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search patient name, code, phone..."
                      value={patientSearch}
                      onChange={e => setPatientSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-teal-500"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatientId('');
                      setSelectedPatient(null);
                      setShowPatientDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                  >
                    • No patient linked (Evaluate as isolated presentation)
                  </button>

                  {filteredPatients.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No matching patients found
                    </div>
                  ) : (
                    filteredPatients.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedPatientId(p.id);
                          setShowPatientDropdown(false);
                        }}
                        className={`px-3 py-2 rounded-lg cursor-pointer text-xs flex items-center justify-between transition ${
                          selectedPatientId === p.id ? 'bg-teal-50 text-teal-900 font-semibold' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-900">{p.fullName}</div>
                          <div className="text-[11px] text-slate-500">{p.patientCode} · {p.age}y, {p.gender}</div>
                        </div>
                        {p.primaryDiagnosis && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 max-w-[120px] truncate">
                            {p.primaryDiagnosis}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected Patient Highlights & Timeline Brief */}
            {selectedPatient && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-2">
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Allergies</span>
                    <span className={`font-semibold ${selectedPatient.allergies ? 'text-rose-600' : 'text-slate-700'}`}>
                      {selectedPatient.allergies || 'NKDA (None documented)'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Past Visits</span>
                    <span className="font-semibold text-slate-700">
                      {patientHistory.length} consultation(s)
                    </span>
                  </div>
                </div>

                {selectedPatient.currentMedications && (
                  <div className="bg-slate-50 p-2 rounded-lg text-slate-600">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Medications</span>
                    <span className="text-slate-800 font-medium">
                      {selectedPatient.currentMedications}
                    </span>
                  </div>
                )}

                {/* Timeline History Pill Drawer */}
                {patientHistory.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Timeline History Ingested by AI:
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {patientHistory.slice(0, 3).map((c, i) => (
                        <div key={c.id} className="p-2 rounded-lg bg-teal-50/50 border border-teal-100 text-[11px] text-slate-700">
                          <div className="flex items-center justify-between font-semibold text-teal-900">
                            <span>Visit on {c.consultationDate.split('T')[0]}</span>
                            {c.fee > 0 && <span className="text-[10px] text-teal-700">Signed</span>}
                          </div>
                          {c.diagnoses.length > 0 && (
                            <div className="text-slate-800 font-medium mt-0.5">
                              Diagnosis: {c.diagnoses.join(', ')}
                            </div>
                          )}
                          {c.prescriptions.length > 0 && (
                            <div className="text-slate-500 text-[10px] mt-0.5 truncate">
                              Rx: {c.prescriptions.map(p => p.medicineName).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Image Capture / Upload Area */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-teal-700" />
                Clinical Image Input
              </label>
              {imageSrc && (
                <button
                  type="button"
                  onClick={() => {
                    setImageSrc(null);
                    setAnalysisResult(null);
                    setVisualMetrics(null);
                    setErrorMsg(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                >
                  Clear Image
                </button>
              )}
            </div>

            {/* Quick Clinical Presets for instant testing of diverse dermatological conditions */}
            <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-teal-600" />
                  Quick Specimen Presets
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Click any to test diagnosis</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {CLINICAL_SAMPLE_CASES.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`text-left p-1.5 rounded-lg border transition flex items-center gap-2 ${
                        isActive
                          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/20 shadow-2xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={preset.dataUrl}
                        alt={preset.name}
                        className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-slate-800 truncate">
                          {preset.shortName}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate">
                          {preset.anatomicalSite}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Camera Viewport or Upload Dropzone */}
            {isCameraActive ? (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 flex flex-col items-center justify-center">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-2 bg-slate-800/80 hover:bg-slate-900 text-white text-xs rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : imageSrc ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative rounded-xl overflow-hidden border transition bg-slate-100 ${
                  isDragging ? 'border-teal-500 ring-2 ring-teal-400 bg-teal-50/30' : 'border-slate-200'
                }`}
              >
                <img
                  src={imageSrc}
                  alt="Clinical specimen"
                  className="w-full max-h-72 object-contain mx-auto bg-slate-900/5 p-2"
                />
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowDermoscopicModal(true)}
                    className="px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-teal-300 text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs transition shadow-xs"
                    title="Open Dermoscopy Magnifier & Caliper"
                  >
                    <Ruler className="w-3 h-3 text-teal-400" />
                    <span>Dermoscopy & Caliper</span>
                  </button>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    analysisResult ? 'bg-teal-700 text-white' : 'bg-black/60 text-white'
                  }`}>
                    {analysisResult ? 'Analyzed' : 'Ready to Analyze'}
                  </span>
                </div>

                {/* Convenient quick action bar beneath loaded image */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1 shadow-2xs"
                    >
                      <Upload className="w-3 h-3 text-teal-600" />
                      Upload Different Image
                    </button>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1 shadow-2xs"
                    >
                      <Camera className="w-3 h-3 text-teal-600" />
                      Take Photo
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={resetImageState}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-medium px-2 py-1"
                  >
                    Clear Specimen
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                  isDragging
                    ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-400'
                    : 'border-slate-200 hover:border-teal-500 hover:bg-teal-50/20'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Click to upload or drag & drop photograph
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  JPG, PNG, or WebP up to 12 MB
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      startCamera();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                  >
                    <Camera className="w-3.5 h-3.5 text-teal-700" />
                    Use Camera
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Live Visual Feature Telemetry Card */}
            {isExtractingFeatures && (
              <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-800 flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                <span>Extracting specimen color palette, asymmetry & erythema telemetry...</span>
              </div>
            )}

            {visualMetrics && !isExtractingFeatures && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Image Pre-Scan Summary
                  </span>
                  <span className="text-slate-500 font-medium capitalize">
                    {visualMetrics.morphologyCategory.replace(/_/g, ' ')}
                    {visualMetrics.fitzpatrickType ? ` · Fitzpatrick ${visualMetrics.fitzpatrickType}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center bg-white rounded-lg p-2 border border-slate-200/80 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Redness</div>
                    <div className="font-bold text-rose-600 font-mono">{visualMetrics.erythemaIndex}/100</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Pigment</div>
                    <div className="font-bold text-amber-700 font-mono">{visualMetrics.pigmentationIndex}/100</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Border</div>
                    <div className="font-bold text-slate-800 font-mono">{visualMetrics.borderIrregularity}/100</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Est. Size</div>
                    <div className="font-bold text-slate-800 font-mono">~{visualMetrics.estimatedDiameterMm || 5.0}mm</div>
                  </div>
                </div>
              </div>
            )}

            {cameraError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {cameraError}
              </p>
            )}

            {/* Anatomical Site & Doctor Notes */}
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Anatomical Site / Location (Optional)
                  </label>
                  <VoiceDictationButton
                    value={anatomicalSite}
                    onChange={setAnatomicalSite}
                    variant="badge"
                    title="Dictate anatomical site with mic"
                  />
                </div>
                <input
                  type="text"
                  placeholder="e.g. Left volar forearm, malar cheek, dorsal foot"
                  value={anatomicalSite}
                  onChange={e => setAnatomicalSite(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500 bg-slate-50/50"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Doctor&apos;s Observation / Query (Optional)
                  </label>
                  <VoiceDictationButton
                    value={clinicalNotes}
                    onChange={setClinicalNotes}
                    variant="button"
                    label="Dictate Observation"
                    title="Dictate clinical observations or query for AI analysis"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. Erythematous papules appearing 2 weeks ago, itching at night, no response to mild hydrocortisone."
                  value={clinicalNotes}
                  onChange={e => setClinicalNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500 bg-slate-50/50 resize-none"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Primary Analyze Action Button */}
            <button
              type="button"
              disabled={!imageSrc || isAnalyzing}
              onClick={handleAnalyze}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-sm transition ${
                !imageSrc || isAnalyzing
                  ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                  : 'bg-teal-800 hover:bg-teal-900 active:scale-[0.99]'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-200" />
                  <span>Analyzing Clinical Image...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-teal-200" />
                  <span>Analyze Clinical Image with AI</span>
                </>
              )}
            </button>

            {isAnalyzing && analysisStep && (
              <p className="text-center text-xs text-teal-700 font-medium animate-pulse">
                {analysisStep}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Diagnostic Results Card (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {!analysisResult ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 mx-auto flex items-center justify-center mb-4">
                <Eye className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Awaiting Clinical Photograph
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
                Upload or capture an image of the patient's lesion, rash, or anatomical manifestation, then click <strong className="text-slate-700">"Analyze Clinical Image with AI"</strong>. The neural vision engine will generate an evidence-based differential diagnosis integrated with the patient's timeline history.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
                <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">✓ Differential Diagnoses</span>
                <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">✓ Timeline History Correlation</span>
                <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">✓ Red Flag Alerts</span>
                <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">✓ Recommended Workup</span>
              </div>
            </div>
          ) : (
            <div id="analysis-results-section" className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in duration-300">
              {/* TOP BANNER: Primary Diagnosis & Action Bar */}
              <div className="bg-slate-900 text-white p-6 border-b border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-teal-300 font-medium mb-1">
                      <span>Primary Clinical Impression</span>
                      {selectedPatient && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300">{selectedPatient.fullName} ({selectedPatient.patientCode})</span>
                        </>
                      )}
                      {anatomicalSite && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300">{anatomicalSite}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                      {analysisResult.primaryImpression}
                    </h2>
                  </div>

                  {selectedPatient && onStartConsultationForPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        onStartConsultationForPatient(selectedPatient, {
                          diagnosis: analysisResult.primaryImpression,
                          notes: `Visual Findings: ${analysisResult.visualFindings.join('; ')}. Suggested Plan: ${analysisResult.suggestedManagementPlan}`
                        });
                      }}
                      className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs transition shrink-0 self-start"
                    >
                      <Stethoscope className="w-4 h-4" />
                      <span>Use in Consultation</span>
                    </button>
                  )}
                </div>

                {/* Action Toolbar */}
                <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
                  >
                    <Printer className="w-3.5 h-3.5 text-teal-300" />
                    <span>Print / PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowWhatsAppModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDermoscopicModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
                  >
                    <Ruler className="w-3.5 h-3.5 text-teal-300" />
                    <span>ABCDE Caliper</span>
                  </button>

                  {selectedPatient && (
                    <button
                      type="button"
                      onClick={() => setShowPinModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
                    >
                      <MapPin className="w-3.5 h-3.5 text-teal-300" />
                      <span>Pin to Body Map</span>
                    </button>
                  )}

                  {selectedPatient && (
                    <button
                      type="button"
                      onClick={handleSaveToGallery}
                      disabled={isSavingToGallery || savedToGallery}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition border border-slate-700 disabled:opacity-60"
                    >
                      {savedToGallery ? (
                        <>
                          <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Saved</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3.5 h-3.5 text-teal-300" />
                          <span>{isSavingToGallery ? 'Saving...' : 'Save to Record'}</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition border border-slate-700 ml-auto"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Optional ABCDE or Body Map notification strip */}
                {abcdeResult && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-slate-800/90 border border-slate-700 text-xs flex items-center justify-between">
                    <span>
                      <strong className="text-teal-300">ABCDE Score: {abcdeResult.totalScore}/9</strong> · {abcdeResult.riskLevel} · Diameter: {abcdeResult.diameterMm.toFixed(1)} mm
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDermoscopicModal(true)}
                      className="text-teal-300 underline hover:text-white"
                    >
                      Edit
                    </button>
                  </div>
                )}

                {pinnedSuccess && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-950/90 border border-emerald-700/60 text-xs text-emerald-200 flex items-center justify-between">
                    <span>{pinnedSuccess}</span>
                    {selectedPatient && onSelectPatient && (
                      <button
                        type="button"
                        onClick={() => onSelectPatient(selectedPatient.id)}
                        className="text-emerald-300 underline font-semibold"
                      >
                        Open Body Map →
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* STRUCTURED REPORT BODY (SECTIONS 01 - 04) */}
              <div className="divide-y divide-slate-200">
                {/* SECTION 01: Differential Diagnoses */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      01. Differential Diagnosis
                    </h3>
                    <span className="text-xs text-slate-500">
                      Ranked by clinical likelihood
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {analysisResult.differentials.map((diff, idx) => (
                      <div key={idx} className="p-3.5 bg-white hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-slate-400">
                              #{idx + 1}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {diff.condition}
                            </span>
                            {diff.icdCode && (
                              <span className="text-xs font-mono text-slate-500">
                                · ICD-10: {diff.icdCode}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {diff.rationale}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-semibold shrink-0 ${
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

                {/* SECTION 02: Key Visual Findings & Patient Context */}
                <div className="p-6 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">
                    02. Key Visual Findings & Patient History
                  </h3>

                  {/* Compact Metrics Bar */}
                  {analysisResult.visualMetrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Pattern</span>
                        <strong className="text-slate-900 capitalize">
                          {analysisResult.visualMetrics.morphologyCategory.replace(/_/g, ' ')}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Skin Phototype</span>
                        <strong className="text-slate-900">
                          Fitzpatrick {analysisResult.visualMetrics.fitzpatrickType || 'Type IV'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Redness (Erythema)</span>
                        <strong className="text-rose-600 font-mono">
                          {analysisResult.visualMetrics.erythemaIndex}/100
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Pigmentation</span>
                        <strong className="text-amber-700 font-mono">
                          {analysisResult.visualMetrics.pigmentationIndex}/100
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Asymmetry / Border</span>
                        <strong className="text-slate-900 font-mono">
                          {analysisResult.visualMetrics.asymmetryScore} / {analysisResult.visualMetrics.borderIrregularity}
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Visual Observations
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-700">
                        {analysisResult.visualFindings.map((finding, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0 mt-1.5" />
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Patient History & Lab Correlation
                      </h4>
                      <p className="text-xs text-slate-700 leading-relaxed bg-teal-50/50 border border-teal-100 rounded-xl p-3.5">
                        {analysisResult.timelineCorrelation}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 03: Action Plan (Tests & Treatment) */}
                <div className="p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-3">
                    03. Recommended Workup & Treatment Plan
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-teal-700" />
                        <span>Recommended Tests / Workup</span>
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-700">
                        {analysisResult.recommendedInvestigations.map((inv, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="font-mono text-slate-400 font-semibold">{idx + 1}.</span>
                            <span>{inv}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-teal-700" />
                        <span>Suggested Treatment Regimen</span>
                      </h4>
                      <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                        {analysisResult.suggestedManagementPlan}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 04: Red Flags & Disclaimer */}
                {analysisResult.redFlags.length > 0 && (
                  <div className="p-6 bg-rose-50/40">
                    <h3 className="text-sm font-bold text-rose-900 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>04. Red Flags to Watch / Rule Out</span>
                    </h3>
                    <ul className="space-y-1 text-xs text-rose-800">
                      {analysisResult.redFlags.map((flag, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="px-6 py-3 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between gap-2">
                  <span>
                    <strong>Clinical Decision Support:</strong> {analysisResult.disclaimer}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 4: Modals */}
      {showReportModal && analysisResult && (
        <ClinicalImageReportModal
          patient={selectedPatient}
          analysis={analysisResult}
          imageSrc={imageSrc}
          anatomicalSite={anatomicalSite}
          doctor={doctor}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {showWhatsAppModal && analysisResult && (
        <WhatsAppShareModal
          isOpen={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          patient={selectedPatient}
          doctor={doctor}
          reportType="clinical_image_report"
          data={{
            analysis: analysisResult,
            anatomicalSite
          }}
        />
      )}

      {showDermoscopicModal && imageSrc && (
        <DermoscopicToolModal
          imageSrc={imageSrc}
          patient={selectedPatient}
          onClose={() => setShowDermoscopicModal(false)}
          onApplyScore={(score: ABCDEScoreResult) => {
            setAbcdeResult(score);
            setShowDermoscopicModal(false);
          }}
        />
      )}

      {showPinModal && selectedPatient && (
        <PinToBodyMapModal
          patient={selectedPatient}
          analysis={analysisResult}
          anatomicalSite={anatomicalSite}
          onClose={() => setShowPinModal(false)}
          onSuccess={(marker: BodyMarker) => {
            setShowPinModal(false);
            setPinnedSuccess(
              `Successfully pinned ${marker.type.toUpperCase()} lesion at (${marker.x}%, ${marker.y}%) to ${marker.view.toUpperCase()} body map`
            );
            setTimeout(() => setPinnedSuccess(null), 5000);
          }}
        />
      )}
    </div>
  );
};
