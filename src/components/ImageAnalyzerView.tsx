import React, { useState, useEffect, useRef } from 'react';
import { Patient, Consultation, AIImageAnalysisResult } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
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
  BookmarkCheck
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

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AIImageAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSavingToGallery, setIsSavingToGallery] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);

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

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setImageSrc(dataUrl);
      setMimeType('image/jpeg');
    }
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 12 MB limit.');
      return;
    }

    setErrorMsg(null);
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Preset sample images for instant doctor demonstration
  const loadSampleCase = (type: 'eczema' | 'tinea' | 'acne') => {
    setErrorMsg(null);
    // Draw a clinical illustration canvas for instant testing
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (type === 'eczema') {
      // Skin tone background with erythematous patch
      ctx.fillStyle = '#e8beac';
      ctx.fillRect(0, 0, 600, 450);
      // Erythema
      const grad = ctx.createRadialGradient(300, 225, 40, 300, 225, 180);
      grad.addColorStop(0, '#d15353');
      grad.addColorStop(0.5, '#dd7777');
      grad.addColorStop(1, '#e8beac');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(300, 225, 180, 0, Math.PI * 2);
      ctx.fill();
      // Excoriations / scaling
      ctx.strokeStyle = '#8b2e2e';
      ctx.lineWidth = 2;
      for (let i = 0; i < 25; i++) {
        ctx.beginPath();
        const rx = 200 + Math.random() * 200;
        const ry = 150 + Math.random() * 150;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.random() * 20 - 10, ry + Math.random() * 20 - 10);
        ctx.stroke();
      }
      setClinicalNotes('Pruritic erythematous plaques on antecubital fossa for 2 weeks, exacerbated after soap exposure.');
      setAnatomicalSite('Right antecubital fossa');
    } else if (type === 'tinea') {
      ctx.fillStyle = '#f0c7b2';
      ctx.fillRect(0, 0, 600, 450);
      // Ringworm annular ring
      ctx.strokeStyle = '#c94444';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(300, 225, 110, 0, Math.PI * 2);
      ctx.stroke();
      // Clearing center
      ctx.fillStyle = '#f2cebb';
      ctx.beginPath();
      ctx.arc(300, 225, 95, 0, Math.PI * 2);
      ctx.fill();
      // Leading scale dots
      ctx.fillStyle = '#8f2525';
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 105 + Math.random() * 15;
        ctx.beginPath();
        ctx.arc(300 + Math.cos(angle) * r, 225 + Math.sin(angle) * r, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      setClinicalNotes('Annular expanding lesion with raised active border and central clearing on trunk. Mild pruritus.');
      setAnatomicalSite('Left lateral flank');
    } else {
      ctx.fillStyle = '#e5b8a3';
      ctx.fillRect(0, 0, 600, 450);
      // Facial acneiform papules and pustules
      for (let i = 0; i < 35; i++) {
        const px = 180 + Math.random() * 240;
        const py = 120 + Math.random() * 200;
        ctx.fillStyle = '#c73e3e';
        ctx.beginPath();
        ctx.arc(px, py, 6 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
        if (i % 3 === 0) {
          ctx.fillStyle = '#fff4cc';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      setClinicalNotes('Facial inflammatory papules and comedones persisting for 1 month, tender to palpation.');
      setAnatomicalSite('Malar cheeks and chin');
    }

    setImageSrc(canvas.toDataURL('image/jpeg', 0.85));
    setMimeType('image/jpeg');
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

      const res = await api.ai.analyzeImage({
        imageBase64: imageSrc,
        mimeType,
        patientId: selectedPatientId || undefined,
        clinicalNotes: fullQuery || undefined
      });

      setAnalysisResult(res.analysis);
      if (res.patient && !selectedPatient) {
        setSelectedPatient(res.patient);
      }
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
      `AI CLINICAL IMAGE EVALUATION REPORT`,
      `Date: ${new Date().toLocaleDateString()}`,
      selectedPatient ? `Patient: ${selectedPatient.fullName} (${selectedPatient.patientCode}, ${selectedPatient.age}y ${selectedPatient.gender})` : 'Patient: Unlinked Presentation',
      anatomicalSite ? `Site: ${anatomicalSite}` : '',
      `Primary Impression: ${analysisResult.primaryImpression}`,
      '',
      `DIFFERENTIAL DIAGNOSES:`,
      ...analysisResult.differentials.map(d => `• ${d.condition} [${d.confidence} confidence${d.icdCode ? ` · ICD: ${d.icdCode}` : ''}] — ${d.rationale}`),
      '',
      `VISUAL MORPHOLOGICAL FINDINGS:`,
      ...analysisResult.visualFindings.map(v => `• ${v}`),
      '',
      `TIMELINE CORRELATION:`,
      analysisResult.timelineCorrelation,
      '',
      `RECOMMENDED INVESTIGATIONS:`,
      ...analysisResult.recommendedInvestigations.map(r => `• ${r}`),
      '',
      `SUGGESTED MANAGEMENT:`,
      analysisResult.suggestedManagementPlan,
      '',
      `Disclaimer: ${analysisResult.disclaimer}`
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

        {/* Quick Sample Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block w-full md:w-auto">
            Try Sample:
          </span>
          <button
            type="button"
            onClick={() => loadSampleCase('eczema')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 text-slate-700 transition"
          >
            Eczema Flare
          </button>
          <button
            type="button"
            onClick={() => loadSampleCase('tinea')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 text-slate-700 transition"
          >
            Annular Lesion
          </button>
          <button
            type="button"
            onClick={() => loadSampleCase('acne')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 text-slate-700 transition"
          >
            Acneiform
          </button>
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
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                >
                  Clear Image
                </button>
              )}
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
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                <img
                  src={imageSrc}
                  alt="Clinical specimen"
                  className="w-full max-h-72 object-contain mx-auto bg-slate-900/5"
                />
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono">
                    Ready
                  </span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-teal-500 hover:bg-teal-50/20 rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center"
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

            {cameraError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {cameraError}
              </p>
            )}

            {/* Anatomical Site & Doctor Notes */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Anatomical Site / Location (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Left volar forearm, malar cheek, dorsal foot"
                  value={anatomicalSite}
                  onChange={e => setAnatomicalSite(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500 bg-slate-50/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Doctor's Observation / Query (Optional)
                </label>
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
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Primary Impression Header Card */}
              <div className="bg-gradient-to-r from-teal-900 to-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-200 border border-teal-400/30">
                      Primary Clinical Impression
                    </span>
                    {analysisResult.isAiPowered ? (
                      <span className="text-[10px] text-teal-300 font-mono">
                        Multimodal Gemini Powered
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 font-mono">
                        Clinical Heuristics Synthesized
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedPatient && (
                      <button
                        type="button"
                        onClick={handleSaveToGallery}
                        disabled={isSavingToGallery || savedToGallery}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-60"
                      >
                        {savedToGallery ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Saved to Record</span>
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
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>

                    {selectedPatient && onStartConsultationForPatient && (
                      <button
                        type="button"
                        onClick={() => {
                          onStartConsultationForPatient(selectedPatient, {
                            diagnosis: analysisResult.primaryImpression,
                            notes: `AI Clinical Image Findings: ${analysisResult.visualFindings.join('; ')}. Suggested Plan: ${analysisResult.suggestedManagementPlan}`
                          });
                        }}
                        className="px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Stethoscope className="w-3.5 h-3.5" />
                        <span>Start Consultation</span>
                      </button>
                    )}
                  </div>
                </div>

                <h2 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1">
                  {analysisResult.primaryImpression}
                </h2>

                {selectedPatient && (
                  <p className="text-xs text-teal-200/80 mt-1">
                    Evaluated for <strong>{selectedPatient.fullName}</strong> ({selectedPatient.patientCode}) · Timeline correlated
                  </p>
                )}
              </div>

              {/* Differential Diagnoses Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-700" />
                  Differential Diagnoses & Likelihood
                </h3>

                <div className="space-y-3">
                  {analysisResult.differentials.map((diff, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {diff.condition}
                          </span>
                          {diff.icdCode && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-mono font-semibold">
                              {diff.icdCode}
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            diff.confidence === 'High'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : diff.confidence === 'Moderate'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {diff.confidence} Confidence
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {diff.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline Correlation Card (The core feature requested by user!) */}
              <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-5 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-900 mb-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-teal-700" />
                  Longitudinal Timeline & History Correlation
                </h3>
                <p className="text-xs text-teal-950 font-normal leading-relaxed">
                  {analysisResult.timelineCorrelation}
                </p>
              </div>

              {/* Morphological Visual Findings */}
              {analysisResult.visualFindings.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-teal-700" />
                    Observed Visual Morphological Features
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {analysisResult.visualFindings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0 mt-1.5" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Red Flags & Safety Alerts */}
              {analysisResult.redFlags.length > 0 && (
                <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900 mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    Clinical Red Flags / Signs to Exclude
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

              {/* Recommended Workup & Suggested Management */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-teal-700" />
                    Recommended Workup
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {analysisResult.recommendedInvestigations.map((inv, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                        <span>{inv}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <Stethoscope className="w-4 h-4 text-teal-700" />
                    Suggested Management Plan
                  </h3>
                  <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                    {analysisResult.suggestedManagementPlan}
                  </div>
                </div>
              </div>

              {/* Medical Disclaimer Footer */}
              <div className="p-3.5 rounded-xl bg-slate-100/80 border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Clinical Decision Support Disclaimer:</strong> {analysisResult.disclaimer}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
