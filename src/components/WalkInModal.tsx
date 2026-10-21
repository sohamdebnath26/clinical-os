import React, { useState, useEffect } from 'react';
import { Patient, Gender, Consultation } from '../types';
import { PREDEFINED_SYMPTOMS } from '../data/clinicalCatalogues';
import { api } from '../lib/api';
import {
  X,
  Smartphone,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  UserCheck,
  Plus,
  Scale,
  Stethoscope,
  Sparkles,
  Phone,
  User
} from 'lucide-react';
import { VoiceDictationButton } from './VoiceDictationButton';

interface WalkInModalProps {
  onClose: () => void;
  onStartConsultation?: (consultation: Consultation, patient: Patient) => void;
  onPatientCreated?: (patient: Patient) => void;
}

const COUNTRY_CODES = [
  { code: '+91', label: '+91 (India)' },
  { code: '+1', label: '+1 (US/CA)' },
  { code: '+44', label: '+44 (UK)' },
  { code: '+971', label: '+971 (UAE)' },
  { code: '+65', label: '+65 (SG)' },
  { code: '+61', label: '+61 (AU)' },
  { code: '+966', label: '+966 (SA)' }
];

const PATIENT_FRIENDLY_SYMPTOMS = [
  'Acne / Pimples',
  'Skin Rash',
  'Itching / Pruritus',
  'Hair Fall / Alopecia',
  'Pigmentation / Dark spots',
  'Dry / Flaky Skin',
  'Fungal Ringworm',
  'Dandruff / Scalp Itch',
  'Eczema / Dermatitis',
  'Urticaria / Hives',
  'Nail Discoloration',
  'Moles / Skin Growth'
];

export const WalkInModal: React.FC<WalkInModalProps> = ({
  onClose,
  onStartConsultation,
  onPatientCreated
}) => {
  // Mode: 'doctor' ( matches exact reference UI ) | 'patient_intake' ( Hand to Patient mode )
  const [mode, setMode] = useState<'doctor' | 'patient_intake'>('doctor');
  // In patient_intake mode, step 1 is mobile verification, step 2 is logical details form
  const [intakeStep, setIntakeStep] = useState<'mobile_entry' | 'details_form'>('mobile_entry');
  const [patientIntakeCompleted, setPatientIntakeCompleted] = useState(false);

  // Shared Patient Form State
  const [fullName, setFullName] = useState('');
  const [sex, setSex] = useState<'Not specified' | Gender>('Not specified');
  const [age, setAge] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [countryCode, setCountryCode] = useState('+91');
  const [mobile, setMobile] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState('');

  // Discount / Panel collapsible section
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [discountType, setDiscountType] = useState('None');
  const [corporatePanel, setCorporatePanel] = useState('Self-Pay / Walk-in');

  // Existing patient lookup / search
  const [matchingPatients, setMatchingPatients] = useState<Patient[]>([]);
  const [existingDuplicatePatient, setExistingDuplicatePatient] = useState<Patient | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search matching patients when doctor types name
  useEffect(() => {
    const query = fullName.trim();
    if (mode !== 'doctor' || query.length < 2) {
      setMatchingPatients([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.patients.list(query);
        setMatchingPatients(res.patients.slice(0, 3));
      } catch {
        // ignore
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [fullName, mode]);

  // Handle 10-digit mobile number input and check for existing patient
  const handleMobileChange = async (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setMobile(cleaned);
    setExistingDuplicatePatient(null);
    setError(null);

    if (cleaned.length === 10) {
      try {
        const check = await api.patients.checkMobile(cleaned);
        if (check.exists && check.patient) {
          setExistingDuplicatePatient(check.patient);
          // If in Hand-to-Patient mode and fields are blank, pre-fill known details logically
          if (mode === 'patient_intake') {
            if (!fullName.trim()) setFullName(check.patient.fullName);
            if (!age) setAge(String(check.patient.age));
            if (sex === 'Not specified' && check.patient.gender) {
              setSex(check.patient.gender);
            }
            if (!weight && check.patient.weight) {
              setWeight(String(check.patient.weight));
            }
          }
        }
      } catch {
        // ignore
      }
    }
  };

  // Switch to "Hand to Patient" mode
  const handleOpenHandToPatient = () => {
    setError(null);
    setMode('patient_intake');
    if (mobile.length === 10) {
      setIntakeStep('details_form');
    } else {
      setIntakeStep('mobile_entry');
    }
  };

  // Proceed from mobile gate to patient self-intake details
  const handleProceedFromMobileGate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number to continue.');
      return;
    }
    setError(null);
    setIntakeStep('details_form');
  };

  // Toggle symptom selection
  const toggleSymptom = (sym: string) => {
    if (selectedSymptoms.includes(sym)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== sym));
    } else {
      setSelectedSymptoms([...selectedSymptoms, sym]);
    }
  };

  const handleAddCustomSymptom = () => {
    const trimmed = customSymptom.trim();
    if (!trimmed) return;
    if (!selectedSymptoms.includes(trimmed)) {
      setSelectedSymptoms([...selectedSymptoms, trimmed]);
    }
    setCustomSymptom('');
  };

  // Start consultation for an existing patient
  const handleSelectExistingPatient = async (patient: Patient) => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Update patient weight/notes if newly provided during intake
      if (weight || notes) {
        await api.patients.update(patient.id, {
          ...(weight ? { weight: Number(weight) } : {}),
          ...(notes ? { notes: notes.trim() } : {})
        });
      }

      if (onStartConsultation) {
        const res = await api.consultations.create({
          patientId: patient.id,
          symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined
        });
        onStartConsultation(res.consultation, {
          ...patient,
          ...(weight ? { weight: Number(weight) } : {}),
          ...(notes ? { notes: notes.trim() } : {})
        });
      } else if (onPatientCreated) {
        onPatientCreated(patient);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start consultation';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Patient finishes self-intake and hands back to doctor for review
  const handleCompleteIntakeAndReview = () => {
    if (mobile.length !== 10) {
      setError('Please enter your 10-digit mobile number.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!age || Number(age) <= 0 || Number(age) > 130) {
      setError('Please enter a valid age in years.');
      return;
    }
    if (sex === 'Not specified') {
      setError('Please select your gender.');
      return;
    }

    setError(null);
    setPatientIntakeCompleted(true);
    setMode('doctor');
  };

  // Save patient record & start consultation
  const handleSavePatient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!fullName.trim()) {
      setError("Please enter the patient's full name.");
      return;
    }
    if (!age || Number(age) <= 0 || Number(age) > 130) {
      setError('Please enter a valid age in years.');
      return;
    }
    if (mobile.length !== 10) {
      setError('Please enter a valid 10-digit patient phone number.');
      return;
    }

    // If duplicate patient exists with this mobile, start consultation for them directly
    if (existingDuplicatePatient) {
      await handleSelectExistingPatient(existingDuplicatePatient);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const resolvedGender: Gender =
      sex === 'Not specified' ? 'Prefer not to say' : sex;

    const discountSummary =
      discountType !== 'None' || corporatePanel !== 'Self-Pay / Walk-in'
        ? `Discount: ${discountType} | Panel: ${corporatePanel}`
        : '';

    const combinedNotes = [
      notes.trim(),
      weight ? `Weight: ${weight} kg` : '',
      selectedSymptoms.length > 0 ? `Symptoms: ${selectedSymptoms.join(', ')}` : '',
      discountSummary
    ]
      .filter(Boolean)
      .join(' · ');

    try {
      const patientRes = await api.patients.create({
        fullName: fullName.trim(),
        age: Number(age),
        gender: resolvedGender,
        mobile: mobile.trim(),
        countryCode,
        weight: weight ? Number(weight) : undefined,
        notes: combinedNotes,
        discountPanel: discountSummary,
        allergies: notes.trim() || 'None reported',
        primaryDiagnosis: selectedSymptoms[0] || undefined
      });

      if (onStartConsultation) {
        const consultationRes = await api.consultations.create({
          patientId: patientRes.patient.id,
          symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined
        });
        onStartConsultation(consultationRes.consultation, patientRes.patient);
      } else if (onPatientCreated) {
        onPatientCreated(patientRes.patient);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save patient record';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {mode === 'doctor' ? (
        /* =========================================================
           DOCTOR / RECEPTION VIEW — Configured per Reference UI
           ========================================================= */
        <div className="bg-white rounded-2xl w-full max-w-[460px] shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <form onSubmit={handleSavePatient} className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-bold text-slate-900 tracking-tight leading-snug">
                  Add patient
                </h2>
                <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
                  Save a new patient record. You can start a consultation for them afterwards.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Patient Self-Intake Completed Banner */}
            {patientIntakeCompleted && (
              <div className="p-3 bg-teal-50/90 border border-teal-200 rounded-xl flex items-start justify-between gap-2.5 animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2b6f63] shrink-0 mt-0.5" />
                  <div className="text-xs text-teal-950">
                    <span className="font-semibold block">Patient self-intake completed</span>
                    <span className="text-[11px] text-teal-800">
                      {[
                        weight ? `Weight: ${weight} kg` : '',
                        selectedSymptoms.length > 0 ? `Symptoms: ${selectedSymptoms.join(', ')}` : ''
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Details verified by patient.'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenHandToPatient}
                  className="text-[11px] font-semibold text-[#2b6f63] hover:underline shrink-0 cursor-pointer"
                >
                  Edit Intake
                </button>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={() => setError(null)} className="cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 1. Patient name */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">
                Patient name
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  placeholder="Patient's full name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20 transition-all"
                />
              </div>

              {/* Quick match suggestion if an existing walk-in patient matches by name */}
              {matchingPatients.length > 0 && !existingDuplicatePatient && (
                <div className="mt-1.5 border border-slate-200 rounded-lg bg-slate-50/80 divide-y divide-slate-200/70 overflow-hidden">
                  {matchingPatients.map(pat => (
                    <div
                      key={pat.id}
                      className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-teal-50/50 transition-colors"
                    >
                      <div className="truncate pr-2">
                        <span className="font-semibold text-slate-800">{pat.fullName}</span>
                        <span className="text-slate-500 ml-1.5">
                          ({pat.age}y · {pat.gender} · {pat.mobile})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectExistingPatient(pat)}
                        className="text-[11px] font-semibold text-[#2b6f63] hover:text-[#1e5248] shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        Start consultation
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Sex & Age (years) */}
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">
                  Sex
                </label>
                <select
                  value={sex}
                  onChange={e => setSex(e.target.value as 'Not specified' | Gender)}
                  className="w-full text-[13px] px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20 transition-all cursor-pointer"
                >
                  <option value="Not specified">Not specified</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">
                  Age (years)
                </label>
                <input
                  type="number"
                  min="0"
                  max="130"
                  placeholder="Age in years"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20 transition-all"
                />
              </div>
            </div>

            {/* 3. Patient phone */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">
                Patient phone
              </label>
              <div className="flex items-stretch">
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  aria-label="Country code"
                  className="text-[13px] px-2.5 py-2.5 bg-slate-50/70 border border-r-0 border-slate-300 rounded-l-lg text-slate-800 focus:outline-none focus:border-[#2b6f63] cursor-pointer shrink-0"
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  value={mobile}
                  onChange={e => handleMobileChange(e.target.value)}
                  className="w-full text-[13px] px-3.5 py-2.5 bg-white border border-slate-300 rounded-r-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20 transition-all"
                />
              </div>
              <p className="text-[12px] text-slate-500 mt-1.5 leading-normal">
                Defaults to India (+91) — pick another country code for NRI/international patients.
              </p>

              {/* Existing Patient Duplicate Mobile Alert */}
              {existingDuplicatePatient && (
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2">
                  <div className="text-xs text-amber-900">
                    <span className="font-semibold">{existingDuplicatePatient.fullName}</span>{' '}
                    <span className="text-amber-700">
                      ({existingDuplicatePatient.patientCode} · {existingDuplicatePatient.age}y) is already registered with this phone.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectExistingPatient(existingDuplicatePatient)}
                    className="px-2.5 py-1.5 bg-[#2b6f63] hover:bg-[#22584e] text-white rounded-md text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Open Patient
                  </button>
                </div>
              )}
            </div>

            {/* 4. Notes (optional) */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                rows={2}
                placeholder="Anything worth recording — e.g. allergies mentioned, preferred language"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full text-[13px] px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20 transition-all resize-y"
              />
              <p className="text-[12px] text-slate-500 mt-1 leading-normal">
                Anything worth recording now. The patient confirms allergies on the intake form.
              </p>
            </div>

            {/* 5. Collapsible Add discount / panel */}
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setShowDiscountPanel(!showDiscountPanel)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                {showDiscountPanel ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Add discount / panel</span>
              </button>

              {showDiscountPanel && (
                <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200/80 rounded-xl grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Discount Category
                    </label>
                    <select
                      value={discountType}
                      onChange={e => setDiscountType(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                    >
                      <option value="None">None (Standard)</option>
                      <option value="Senior Citizen (10%)">Senior Citizen (10%)</option>
                      <option value="Staff / Family (20%)">Staff / Family (20%)</option>
                      <option value="Student (10%)">Student (10%)</option>
                      <option value="Camp / Charity (50%)">Camp / Charity (50%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Panel / Corporate
                    </label>
                    <select
                      value={corporatePanel}
                      onChange={e => setCorporatePanel(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                    >
                      <option value="Self-Pay / Walk-in">Self-Pay / Walk-in</option>
                      <option value="CGHS">CGHS</option>
                      <option value="ECHS">ECHS</option>
                      <option value="Star Health">Star Health</option>
                      <option value="HDFC ERGO">HDFC ERGO</option>
                      <option value="ICICI Lombard">ICICI Lombard</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* 6. Footer Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-[13px] font-semibold text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleOpenHandToPatient}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-[13px] font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                <span>Hand to patient</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !fullName.trim() || mobile.length !== 10}
                className="px-4 py-2 bg-[#2b6f63] hover:bg-[#235c52] disabled:bg-[#8eb3ac] text-white rounded-lg text-[13px] font-semibold shadow-2xs transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : 'Add patient'}
              </button>
            </div>

            {/* 7. Bottom Helper Text */}
            <p className="text-[11.5px] text-slate-500 text-center pt-1">
              New walk-in? Hand the device over and the patient can fill in their own details.
            </p>
          </form>
        </div>
      ) : (
        /* =========================================================
           "HAND TO PATIENT" SELF-INTAKE MODE
           Logical Step 1: Enter 10-digit Mobile Number
           Logical Step 2: Patient fills Name, Gender, Age, Weight, Symptoms
           ========================================================= */
        <div className="bg-white rounded-2xl w-full max-w-[520px] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Top Self Check-In Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-[#0e423d] to-[#1b5e55] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4 text-teal-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight">Patient Self Check-In</h2>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-100 border border-teal-300/30">
                    Hand to Patient
                  </span>
                </div>
                <p className="text-xs text-teal-100/85 mt-0.5">
                  Please enter your details below so the doctor can prepare for your visit
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('doctor');
              }}
              className="text-xs font-semibold text-teal-100 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title="Return to Doctor View"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Doctor View</span>
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={() => setError(null)} className="cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {intakeStep === 'mobile_entry' ? (
              /* STEP 1: MOBILE NUMBER ENTRY GATE */
              <form onSubmit={handleProceedFromMobileGate} className="space-y-4 py-2">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 text-[#2b6f63] flex items-center justify-center mx-auto mb-2">
                    <Phone className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Step 1: Enter Your Mobile Number
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Enter your 10-digit mobile number to unlock your self check-in form.
                  </p>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Mobile Number *
                  </label>
                  <div className="flex items-stretch">
                    <select
                      value={countryCode}
                      onChange={e => setCountryCode(e.target.value)}
                      className="text-sm font-medium px-3 py-3 bg-slate-50 border border-r-0 border-slate-300 rounded-l-xl text-slate-800 focus:outline-none focus:border-[#2b6f63]"
                    >
                      {COUNTRY_CODES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoFocus
                      maxLength={10}
                      placeholder="Enter 10-digit mobile number"
                      value={mobile}
                      onChange={e => {
                        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
                        handleMobileChange(cleaned);
                        if (cleaned.length === 10) {
                          setTimeout(() => setIntakeStep('details_form'), 220);
                        }
                      }}
                      className="w-full text-base font-mono tracking-wider px-4 py-3 bg-white border border-slate-300 rounded-r-xl text-slate-900 placeholder:text-slate-400 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-slate-500">
                      Your details will automatically open once 10 digits are entered.
                    </span>
                    <span className="text-xs font-mono font-semibold text-slate-500">
                      {mobile.length}/10
                    </span>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('doctor')}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mobile.length !== 10}
                    className="flex-1 py-3 px-5 bg-[#2b6f63] hover:bg-[#235c52] disabled:bg-[#8eb3ac] text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>Continue to Enter Details</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              /* STEP 2: LOGICAL PATIENT SELF-INTAKE FORM
                 1. Verified Mobile Header
                 2. Full Name & Gender
                 3. Age (years) & Weight (kg)
                 4. Symptoms / Reason for Visit
                 5. Allergies / Additional Notes */
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Verified Mobile Number Bar */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-100/80 text-[#2b6f63] flex items-center justify-center font-bold text-xs">
                      1
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Mobile Number
                      </span>
                      <span className="text-xs font-bold font-mono text-slate-800">
                        {countryCode} {mobile}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIntakeStep('mobile_entry')}
                    className="text-xs font-semibold text-[#2b6f63] hover:underline cursor-pointer"
                  >
                    Change number
                  </button>
                </div>

                {/* Returning Patient Notice if matched */}
                {existingDuplicatePatient && (
                  <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl flex items-center justify-between gap-2">
                    <div className="text-xs text-teal-950">
                      <span className="font-bold block">Welcome back, {existingDuplicatePatient.fullName}!</span>
                      <span className="text-[11px] text-teal-800">
                        We pre-filled your profile details. Please update your weight and today&apos;s symptoms below.
                      </span>
                    </div>
                  </div>
                )}

                {/* Logical Group 1: Personal Identity (Name & Gender) */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <User className="w-4 h-4 text-[#2b6f63]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Personal Details (Name &amp; Gender)
                    </h3>
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Full Name *
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        className="w-full text-xs pl-3.5 pr-9 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20"
                      />
                      <div className="absolute right-1.5">
                        <VoiceDictationButton
                          value={fullName}
                          onChange={setFullName}
                          variant="badge"
                          className="border-0 shadow-none bg-transparent"
                          title="Speak your full name"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Gender Touch Pills */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Gender *
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {(['Female', 'Male', 'Other'] as Gender[]).map(g => {
                        const active = sex === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setSex(g)}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              active
                                ? 'bg-[#2b6f63] text-white border-[#2b6f63] shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-[#2b6f63]'
                            }`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Logical Group 2: Age & Weight */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Scale className="w-4 h-4 text-[#2b6f63]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Age &amp; Body Weight
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Age (years) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="130"
                          placeholder="e.g. 28"
                          value={age}
                          onChange={e => setAge(e.target.value)}
                          className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">
                          yrs
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Weight (kg)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="300"
                          step="0.5"
                          placeholder="e.g. 64"
                          value={weight}
                          onChange={e => setWeight(e.target.value)}
                          className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#2b6f63] focus:ring-2 focus:ring-[#2b6f63]/20"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">
                          kg
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Logical Group 3: Symptoms / Chief Complaints */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-[#2b6f63]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Symptoms / Reason for Visit
                      </h3>
                    </div>
                    {selectedSymptoms.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#2b6f63] bg-teal-50 px-2 py-0.5 rounded-full">
                        {selectedSymptoms.length} selected
                      </span>
                    )}
                  </div>

                  <p className="text-[11.5px] text-slate-500">
                    Tap the symptoms you are experiencing today or add your own below:
                  </p>

                  {/* Selected Symptoms */}
                  {selectedSymptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-teal-50/60 border border-teal-100 rounded-lg">
                      {selectedSymptoms.map(sym => (
                        <span
                          key={sym}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#2b6f63] text-white"
                        >
                          {sym}
                          <button
                            type="button"
                            onClick={() => toggleSymptom(sym)}
                            className="hover:text-teal-200 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quick Tap Symptom Grid */}
                  <div className="flex flex-wrap gap-1.5">
                    {PATIENT_FRIENDLY_SYMPTOMS.map(sym => {
                      const isSelected = selectedSymptoms.includes(sym);
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => toggleSymptom(sym)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#2b6f63] text-white border-[#2b6f63] font-semibold'
                              : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:border-[#2b6f63]'
                          }`}
                        >
                          {sym}
                        </button>
                      );
                    })}
                  </div>

                  {/* Add Custom Symptom */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Describe other symptoms (e.g. redness on cheeks for 2 weeks)"
                      value={customSymptom}
                      onChange={e => setCustomSymptom(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomSymptom();
                        }
                      }}
                      className="flex-1 text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#2b6f63]"
                    />
                    <VoiceDictationButton
                      value={customSymptom}
                      onChange={setCustomSymptom}
                      variant="badge"
                      title="Speak symptom"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSymptom}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Logical Group 4: Allergies / Additional Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Known Allergies or Notes (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. No known allergies, or allergic to sulfa/penicillin"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#2b6f63]"
                  />
                </div>

                {/* Self-Intake Action Footer */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={handleCompleteIntakeAndReview}
                    className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Done — Review in Doctor Window
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSavePatient()}
                    disabled={isSubmitting}
                    className="px-4 py-2.5 bg-[#2b6f63] hover:bg-[#235c52] disabled:bg-[#8eb3ac] text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{isSubmitting ? 'Saving...' : 'Submit & Hand Back to Doctor'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
