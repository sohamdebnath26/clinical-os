import React, { useState, useEffect } from 'react';
import { Consultation, Patient, ProcedureItem, BodyMarker, ClinicalImage, PrescriptionItem } from '../types';
import { PREDEFINED_DIAGNOSES, PREDEFINED_TESTS, PREDEFINED_PROCEDURES, COMMON_MEDICATIONS } from '../data/clinicalCatalogues';
import { BodyMap } from './BodyMap';
import { ClinicalImageUploader } from './ClinicalImageUploader';
import { api } from '../lib/api';
import confetti from 'canvas-confetti';
import {
  X,
  Stethoscope,
  FlaskConical,
  Scissors,
  FileText,
  User,
  Image as ImageIcon,
  Calendar,
  Sparkles,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Pill,
  ChevronDown
} from 'lucide-react';

interface ConsultationModalProps {
  consultation: Consultation;
  patient: Patient;
  onClose: () => void;
  onSuccess: (updatedConsultation: Consultation) => void;
}

type TabType =
  | 'diagnosis'
  | 'tests'
  | 'procedure'
  | 'notes'
  | 'bodymap'
  | 'images'
  | 'followup'
  | 'aisummary';

export const ConsultationModal: React.FC<ConsultationModalProps> = ({
  consultation,
  patient,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('diagnosis');
  const [fee, setFee] = useState<number>(consultation.fee || 500);

  // Clinical data state
  const [symptoms, setSymptoms] = useState<string[]>(consultation.symptoms || []);
  const [diagnoses, setDiagnoses] = useState<string[]>(consultation.diagnoses || []);
  const [tests, setTests] = useState<string[]>(consultation.tests || []);
  const [procedures, setProcedures] = useState<ProcedureItem[]>(consultation.procedures || []);
  const [clinicalNotes, setClinicalNotes] = useState({
    examination: consultation.clinicalNotes?.examination || '',
    investigationsAdvised: consultation.clinicalNotes?.investigationsAdvised || '',
    plan: consultation.clinicalNotes?.plan || ''
  });
  const [bodyMarkers, setBodyMarkers] = useState<BodyMarker[]>(consultation.bodyMarkers || []);
  const [images, setImages] = useState<ClinicalImage[]>(consultation.images || []);
  const [followUp, setFollowUp] = useState<{ date?: string; instructions?: string; notes?: string }>({
    date: consultation.followUp?.date || '',
    instructions: consultation.followUp?.instructions || '',
    notes: consultation.followUp?.notes || ''
  });
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>(consultation.prescriptions || []);
  const [aiSummary, setAiSummary] = useState<string>(consultation.aiSummary || '');

  // Filter & Search states
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [customDiagnosis, setCustomDiagnosis] = useState('');

  const [testSearch, setTestSearch] = useState('');
  const [customTest, setCustomTest] = useState('');

  const [procedureSearch, setProcedureSearch] = useState('');
  const [customProcedureName, setCustomProcedureName] = useState('');
  const [customProcedureCost, setCustomProcedureCost] = useState<number>(500);

  // New medication form inside consultation
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medFrequency, setMedFrequency] = useState('Once daily');
  const [medDuration, setMedDuration] = useState('7 days');
  const [medInstructions, setMedInstructions] = useState('After meals');
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);

  // Prior body markers for this patient
  const [priorMarkers, setPriorMarkers] = useState<BodyMarker[]>([]);

  // Loading states
  const [isSigning, setIsSigning] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch prior markers
  useEffect(() => {
    api.patients.getMarkers(patient.id)
      .then(res => {
        setPriorMarkers(res.markers.filter(m => m.consultationId !== consultation.id));
      })
      .catch(() => {});
  }, [patient.id, consultation.id]);

  // If symptoms were passed in walk-in, and diagnoses is empty, auto-seed relevant symptoms or diagnoses
  useEffect(() => {
    if (diagnoses.length === 0 && symptoms.length > 0) {
      // Seed first symptom as candidate diagnosis if suitable
      const initialDiagnoses = symptoms.filter(s => PREDEFINED_DIAGNOSES.includes(s));
      if (initialDiagnoses.length > 0) {
        setDiagnoses(initialDiagnoses);
      }
    }
  }, []);

  // Calculate procedure cost sum
  const proceduresTotal = procedures.reduce((acc, p) => acc + (p.cost || 0), 0);
  const grandTotal = proceduresTotal + (fee || 0);

  // AI Summary generation
  const generateSummary = async () => {
    setIsGeneratingAI(true);
    try {
      const res = await api.ai.summarize({
        patient: {
          name: patient.fullName,
          age: patient.age,
          gender: patient.gender,
          code: patient.patientCode
        },
        date: consultation.consultationDate,
        symptoms,
        diagnoses,
        tests,
        procedures,
        consultationFee: fee,
        clinicalNotes
      });
      setAiSummary(res.summary);
    } catch (err: unknown) {
      console.warn('AI summary error:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Switch to AI tab auto-generates if empty
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'aisummary' && !aiSummary) {
      generateSummary();
    }
  };

  // Diagnosis handlers
  const toggleDiagnosis = (diag: string) => {
    if (diagnoses.includes(diag)) {
      setDiagnoses(diagnoses.filter(d => d !== diag));
    } else {
      setDiagnoses([...diagnoses, diag]);
    }
  };

  const addCustomDiagnosis = () => {
    if (!customDiagnosis.trim()) return;
    if (!diagnoses.includes(customDiagnosis.trim())) {
      setDiagnoses([...diagnoses, customDiagnosis.trim()]);
    }
    setCustomDiagnosis('');
  };

  // Test handlers
  const toggleTest = (test: string) => {
    if (tests.includes(test)) {
      setTests(tests.filter(t => t !== test));
    } else {
      setTests([...tests, test]);
    }
  };

  const addCustomTest = () => {
    if (!customTest.trim()) return;
    if (!tests.includes(customTest.trim())) {
      setTests([...tests, customTest.trim()]);
    }
    setCustomTest('');
  };

  // Procedure handlers
  const addProcedure = (name: string, cost: number) => {
    const newProc: ProcedureItem = {
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      cost
    };
    setProcedures([...procedures, newProc]);
  };

  const removeProcedure = (id: string) => {
    setProcedures(procedures.filter(p => p.id !== id));
  };

  const updateProcedureCost = (id: string, cost: number) => {
    setProcedures(procedures.map(p => p.id === id ? { ...p, cost } : p));
  };

  // Image Upload handler
  const handleImageUpload = async (dataUrl: string, filename: string, caption?: string) => {
    const res = await api.images.upload({
      patientId: patient.id,
      consultationId: consultation.id,
      dataUrl,
      filename,
      caption
    });
    setImages([...images, res.image]);
  };

  const handleImageDelete = async (imageId: string) => {
    await api.images.delete(imageId);
    setImages(images.filter(i => i.id !== imageId));
  };

  // Body Marker handlers
  const handleAddMarker = (newMarker: Omit<BodyMarker, 'id' | 'createdAt'>) => {
    const marker: BodyMarker = {
      ...newMarker,
      id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    setBodyMarkers([...bodyMarkers, marker]);
  };

  const handleRemoveMarker = (id: string) => {
    setBodyMarkers(bodyMarkers.filter(m => m.id !== id));
  };

  // Prescription handler
  const handleAddPrescription = () => {
    if (!medName.trim()) return;
    const item: PrescriptionItem = {
      id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      patientId: patient.id,
      consultationId: consultation.id,
      medicineName: medName.trim(),
      dosage: medDosage.trim() || '1 tab',
      frequency: medFrequency,
      duration: medDuration,
      instructions: medInstructions,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    setPrescriptions([...prescriptions, item]);
    setMedName('');
    setMedDosage('');
  };

  const handleRemovePrescription = (id: string) => {
    setPrescriptions(prescriptions.filter(p => p.id !== id));
  };

  // Sign & Finish Handler
  const handleSignAndFinish = async () => {
    setIsSigning(true);
    setError(null);

    // If AI summary is not generated, create deterministic summary now
    let finalSummary = aiSummary;
    if (!finalSummary) {
      const lines: string[] = [];
      const dateFormatted = consultation.consultationDate.split('T')[0];
      lines.push(`CONSULTATION — ${dateFormatted}\n`);
      if (diagnoses.length > 0) {
        lines.push('DIAGNOSIS');
        diagnoses.forEach(d => lines.push(`• ${d}`));
        lines.push('');
      }
      lines.push('CHARGES');
      lines.push(`• Procedures: ₹${proceduresTotal}`);
      lines.push(`• Consultation fee: ₹${fee}`);
      lines.push(`• Total: ₹${grandTotal}`);
      finalSummary = lines.join('\n');
    }

    try {
      const res = await api.consultations.sign(consultation.id, {
        fee,
        symptoms,
        diagnoses,
        tests,
        procedures,
        clinicalNotes,
        bodyMarkers,
        images,
        followUp,
        prescriptions,
        aiSummary: finalSummary
      });

      // Celebration confetti
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 }
        });
      } catch {
        // ignore
      }

      onSuccess(res.consultation);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save consultation';
      setError(message);
    } finally {
      setIsSigning(false);
    }
  };

  // Filter diagnoses
  const filteredDiagnoses = PREDEFINED_DIAGNOSES.filter(d =>
    d.toLowerCase().includes(diagnosisSearch.toLowerCase().trim())
  );

  // Filter tests
  const filteredTests = PREDEFINED_TESTS.filter(t =>
    t.toLowerCase().includes(testSearch.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[94vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Consultation</h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-800">{patient.fullName}</span>
              <span>•</span>
              <span>{patient.age}y</span>
              <span>•</span>
              <span>{patient.gender}</span>
              <span>•</span>
              <span className="font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-semibold">
                {patient.patientCode}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-semibold text-slate-600">Consultation fee</span>
              <span className="text-xs font-bold text-slate-400">₹</span>
              <input
                type="number"
                min="0"
                step="50"
                value={fee}
                onChange={e => setFee(Number(e.target.value))}
                className="w-16 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-teal-500 text-right"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-slate-50/70 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleTabChange('diagnosis')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'diagnosis'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Diagnosis</span>
            {diagnoses.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                {diagnoses.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('tests')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'tests'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Tests</span>
            {tests.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                {tests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('procedure')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'procedure'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Procedure</span>
            {procedures.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                {procedures.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('notes')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'notes'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Clinical notes</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('bodymap')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'bodymap'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Body map</span>
            {bodyMarkers.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                {bodyMarkers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('images')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'images'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Clinical images</span>
            {images.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                {images.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('followup')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'followup'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Follow up & Rx</span>
            {prescriptions.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                {prescriptions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('aisummary')}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'aisummary'
                ? 'border-teal-700 text-teal-800 bg-white/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>AI summary</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* TAB 1: DIAGNOSIS */}
          {activeTab === 'diagnosis' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Tap to add a diagnosis. Selected diagnoses appear above.
              </p>

              {/* Selected Diagnoses Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[56px] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mr-1">
                  DERMATOLOGY DIAGNOSES (tap to add):
                </span>
                {diagnoses.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No diagnoses selected yet</span>
                ) : (
                  diagnoses.map(diag => (
                    <span
                      key={diag}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-teal-800 text-white shadow-xs"
                    >
                      {diag}
                      <button
                        type="button"
                        onClick={() => toggleDiagnosis(diag)}
                        className="hover:text-teal-200 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search all 93 dermatology diagnoses..."
                  value={diagnosisSearch}
                  onChange={e => setDiagnosisSearch(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
                />
              </div>

              {/* Quick suggestions pills */}
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                {filteredDiagnoses.map(d => {
                  const isSelected = diagnoses.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDiagnosis(d)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? 'bg-teal-800 text-white border-teal-800 font-semibold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-500 hover:text-teal-800'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              {/* Custom diagnosis entry */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  placeholder="Add a custom diagnosis (press Enter)"
                  value={customDiagnosis}
                  onChange={e => setCustomDiagnosis(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomDiagnosis())}
                  className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={addCustomDiagnosis}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TESTS */}
          {activeTab === 'tests' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Select all skin-related tests you're ordering for this patient.
              </p>

              {/* Selected Tests Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[56px] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mr-1">
                  SKIN TESTS & INVESTIGATIONS (tap to add):
                </span>
                {tests.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No tests selected</span>
                ) : (
                  tests.map(test => (
                    <span
                      key={test}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-teal-800 text-white shadow-xs"
                    >
                      {test}
                      <button
                        type="button"
                        onClick={() => toggleTest(test)}
                        className="hover:text-teal-200 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Search input */}
              <input
                type="text"
                placeholder="Search all 46 skin tests & investigations..."
                value={testSearch}
                onChange={e => setTestSearch(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
              />

              {/* Quick test pills */}
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                {filteredTests.map(t => {
                  const isSelected = tests.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTest(t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? 'bg-teal-800 text-white border-teal-800 font-semibold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-500 hover:text-teal-800'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Custom test entry */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  placeholder="Add a custom test (press Enter)"
                  value={customTest}
                  onChange={e => setCustomTest(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTest())}
                  className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={addCustomTest}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: PROCEDURE */}
          {activeTab === 'procedure' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500">
                Add every procedure performed (or to be performed) today. Add a charge to bill it.
              </p>

              {/* Common procedure catalogue chips */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  COMMON IN-CLINIC PROCEDURES (tap to add):
                </span>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_PROCEDURES.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => addProcedure(p.name, p.defaultCost)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/50 text-xs font-medium text-slate-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>{p.name}</span>
                      <span className="text-slate-400 font-semibold">₹{p.defaultCost}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom procedure input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Custom procedure name..."
                  value={customProcedureName}
                  onChange={e => setCustomProcedureName(e.target.value)}
                  className="flex-2 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                  <span className="text-xs font-semibold text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder="Cost"
                    value={customProcedureCost}
                    onChange={e => setCustomProcedureCost(Number(e.target.value))}
                    className="w-16 text-xs font-medium focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (customProcedureName.trim()) {
                      addProcedure(customProcedureName.trim(), customProcedureCost);
                      setCustomProcedureName('');
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  + Add procedure
                </button>
              </div>

              {/* Added Procedures List */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-700">Procedures Added Today ({procedures.length})</span>
                {procedures.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-white p-4 rounded-xl border border-dashed border-slate-200 text-center">
                    No procedures added today. Click any procedure above to add it.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
                    {procedures.map((proc, idx) => (
                      <div key={proc.id || idx} className="p-3 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <span className="text-xs font-bold text-slate-800">{proc.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Charge: ₹</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={proc.cost}
                            onChange={e => updateProcedureCost(proc.id, Number(e.target.value))}
                            className="w-20 text-xs font-semibold text-right px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeProcedure(proc.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CLINICAL NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Examination findings, impression, plan discussed with patient.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add image
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Examination:
                </label>
                <textarea
                  rows={3}
                  value={clinicalNotes.examination}
                  onChange={e => setClinicalNotes({ ...clinicalNotes, examination: e.target.value })}
                  placeholder="e.g. Erythematous papules and open comedones over cheeks and forehead. No pustules or scarring noted."
                  className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-normal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Investigations advised:
                </label>
                <textarea
                  rows={2}
                  value={clinicalNotes.investigationsAdvised}
                  onChange={e => setClinicalNotes({ ...clinicalNotes, investigationsAdvised: e.target.value })}
                  placeholder="e.g. Skin scraping for KOH mount advised if scaling persists."
                  className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-normal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Plan:
                </label>
                <textarea
                  rows={3}
                  value={clinicalNotes.plan}
                  onChange={e => setClinicalNotes({ ...clinicalNotes, plan: e.target.value })}
                  placeholder="e.g. Start topical adapalene gel at night. Advised non-comedogenic foaming cleanser and daily mineral sunscreen."
                  className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs font-normal"
                />
              </div>
            </div>
          )}

          {/* TAB 5: BODY MAP */}
          {activeTab === 'bodymap' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <BodyMap
                markers={bodyMarkers}
                onAddMarker={handleAddMarker}
                onRemoveMarker={handleRemoveMarker}
                patientId={patient.id}
                consultationId={consultation.id}
                priorMarkers={priorMarkers}
              />
            </div>
          )}

          {/* TAB 6: CLINICAL IMAGES */}
          {activeTab === 'images' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <ClinicalImageUploader
                images={images}
                onUpload={handleImageUpload}
                onDelete={handleImageDelete}
              />
            </div>
          )}

          {/* TAB 7: FOLLOW UP & RX */}
          {activeTab === 'followup' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Follow-up section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    Follow-Up Schedule & Appointment Sync
                  </h4>
                  <span className="text-[10px] text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full font-semibold">
                    Auto-syncs to Appointments
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600">Quick preset:</span>
                  {[
                    { label: '3 days', days: 3 },
                    { label: '1 week', days: 7 },
                    { label: '2 weeks', days: 14 },
                    { label: '1 month', days: 30 }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const target = new Date();
                        target.setDate(target.getDate() + preset.days);
                        setFollowUp({ ...followUp, date: target.toISOString().split('T')[0] });
                      }}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:border-teal-500 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                    >
                      +{preset.label}
                    </button>
                  ))}

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-semibold text-slate-600">Date:</span>
                    <input
                      type="date"
                      value={followUp.date}
                      onChange={e => setFollowUp({ ...followUp, date: e.target.value })}
                      className="text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Follow-up Instructions for Patient
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Review in OPD with biopsy report; SOS if swelling increases."
                    value={followUp.instructions}
                    onChange={e => setFollowUp({ ...followUp, instructions: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Prescriptions inside consultation */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Pill className="w-3.5 h-3.5 text-teal-600" />
                    Prescriptions ({prescriptions.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">Saved to patient medical record</span>
                </div>

                {/* Form to add medicine with auto-suggest drop-down menu (no chips) */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="sm:col-span-2 relative">
                    <div className="flex items-center w-full bg-white border border-slate-200 rounded-md focus-within:ring-1 focus-within:ring-teal-500">
                      <input
                        type="text"
                        placeholder="Search or enter medicine..."
                        value={medName}
                        onChange={e => {
                          setMedName(e.target.value);
                          setIsMedDropdownOpen(true);
                        }}
                        onFocus={() => setIsMedDropdownOpen(true)}
                        className="w-full text-xs px-2.5 py-1.5 bg-transparent border-0 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setIsMedDropdownOpen(!isMedDropdownOpen)}
                        className="px-2 py-1.5 text-slate-400 hover:text-slate-600 border-l border-slate-100"
                        title="Open medications dropdown"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMedDropdownOpen ? 'rotate-180 text-teal-700' : ''}`} />
                      </button>
                    </div>

                    {/* Auto-suggest dropdown menu */}
                    {isMedDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Medication Catalogue ({COMMON_MEDICATIONS.filter(m => m.name.toLowerCase().includes(medName.toLowerCase().trim())).length})
                        </div>
                        {COMMON_MEDICATIONS.filter(m => m.name.toLowerCase().includes(medName.toLowerCase().trim())).map(med => (
                          <button
                            key={med.name}
                            type="button"
                            onClick={() => {
                              setMedName(med.name);
                              setMedDosage(med.dosage);
                              setMedFrequency(med.frequency);
                              setMedDuration(med.duration);
                              setMedInstructions(med.instructions);
                              setIsMedDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex flex-col text-slate-800 transition-colors"
                          >
                            <span className="font-semibold text-slate-900">{med.name}</span>
                            <span className="text-[10px] text-slate-400">
                              {med.dosage} • {med.frequency} • {med.instructions}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Dosage (e.g. 1 tab)"
                      value={medDosage}
                      onChange={e => setMedDosage(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Frequency (e.g. 1-0-1)"
                      value={medFrequency}
                      onChange={e => setMedFrequency(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleAddPrescription}
                      className="w-full py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Rx
                    </button>
                  </div>
                </div>

                {/* Prescribed Items Table */}
                {prescriptions.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {prescriptions.map(p => (
                      <div key={p.id} className="p-3 flex items-center justify-between text-xs gap-3">
                        <div className="flex-1">
                          <p className="font-bold text-slate-800">{p.medicineName}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.dosage} · {p.frequency} · {p.duration}
                            {p.instructions && ` (${p.instructions})`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePrescription(p.id)}
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: AI SUMMARY */}
          {activeTab === 'aisummary' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Auto-generated from your inputs. Edit as needed before signing.
                </p>
                <button
                  type="button"
                  onClick={generateSummary}
                  disabled={isGeneratingAI}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              </div>

              <div className="relative">
                <textarea
                  rows={12}
                  value={aiSummary}
                  onChange={e => setAiSummary(e.target.value)}
                  placeholder="Summary will appear here..."
                  className="w-full text-xs font-mono p-4 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 leading-relaxed text-slate-800 shadow-inner"
                />
                {isGeneratingAI && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs rounded-xl flex items-center justify-center">
                    <div className="flex items-center gap-2 text-teal-800 font-semibold text-xs">
                      <Sparkles className="w-4 h-4 animate-spin text-teal-600" />
                      Generating clinical summary...
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 italic">
                Tip: this summary will be saved with the visit. Edit freely — it's your final note.
              </p>
            </div>
          )}
        </div>

        {/* Modal Bottom Billing & Actions Bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
          {/* Charges summary breakdown */}
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">PROCEDURES</span>
              <span className="font-bold text-slate-700">₹{proceduresTotal}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">CONSULTATION</span>
              <span className="font-bold text-slate-700">₹{fee}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-[10px] uppercase font-bold text-teal-700 block tracking-wider">TOTAL</span>
              <span className="font-extrabold text-teal-900 text-sm">₹{grandTotal}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSignAndFinish}
              disabled={isSigning}
              className="inline-flex items-center gap-1.5 px-6 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-md transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSigning ? 'Signing & Saving...' : 'Sign & finish'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
