import React, { useState, useEffect } from 'react';
import { Patient, Gender, Consultation } from '../types';
import { PREDEFINED_SYMPTOMS } from '../data/clinicalCatalogues';
import { api } from '../lib/api';
import { calculateAgeFromDOB } from '../lib/dateUtils';
import { useLanguage } from '../context/LanguageContext';
import {
  X,
  Search,
  UserPlus,
  ArrowRight,
  AlertCircle,
  Check,
  Plus,
  UserCheck,
  Sparkles
} from 'lucide-react';

interface WalkInModalProps {
  onClose: () => void;
  onStartConsultation: (consultation: Consultation, patient: Patient) => void;
}

export const WalkInModal: React.FC<WalkInModalProps> = ({
  onClose,
  onStartConsultation
}) => {
  const { t } = useLanguage();
  const [step, setStep] = useState<'search' | 'register'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // New patient form fields
  const [mobile, setMobile] = useState('');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [age, setAge] = useState<string>('');
  const [isAgeAutoCalculated, setIsAgeAutoCalculated] = useState(false);
  const [gender, setGender] = useState<Gender>('Male');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomSearch, setSymptomSearch] = useState('');
  const [customSymptom, setCustomSymptom] = useState('');

  // Automatically calculate age when DOB is changed in walk-in
  const handleDateOfBirthChange = (val: string) => {
    setDateOfBirth(val);
    if (val) {
      const calculated = calculateAgeFromDOB(val);
      if (calculated !== '') {
        setAge(String(calculated));
        setIsAgeAutoCalculated(true);
      }
    } else {
      setIsAgeAutoCalculated(false);
    }
  };

  const handleAgeChange = (val: string) => {
    setAge(val);
    setIsAgeAutoCalculated(false);
  };

  // Validation & Loading
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingDuplicatePatient, setExistingDuplicatePatient] = useState<Patient | null>(null);

  // Search patients as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.patients.list(searchQuery.trim());
        setSearchResults(res.patients);
      } catch (err) {
        console.warn('Patient search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When selecting an existing patient from search
  const handleSelectExistingPatient = async (patient: Patient) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.consultations.create({
        patientId: patient.id,
        symptoms: selectedSymptoms
      });
      onStartConsultation(res.consultation, patient);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start consultation';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle symptom pill
  const toggleSymptom = (sym: string) => {
    if (selectedSymptoms.includes(sym)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== sym));
    } else {
      setSelectedSymptoms([...selectedSymptoms, sym]);
    }
  };

  const handleAddCustomSymptom = () => {
    if (!customSymptom.trim()) return;
    if (!selectedSymptoms.includes(customSymptom.trim())) {
      setSelectedSymptoms([...selectedSymptoms, customSymptom.trim()]);
    }
    setCustomSymptom('');
  };

  // Check duplicate mobile
  const handleMobileChange = async (val: string) => {
    // Only numbers, up to 10
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setMobile(cleaned);
    setExistingDuplicatePatient(null);

    if (cleaned.length === 10) {
      try {
        const check = await api.patients.checkMobile(cleaned);
        if (check.exists && check.patient) {
          setExistingDuplicatePatient(check.patient);
        }
      } catch {
        // ignore
      }
    }
  };

  // Register new walk-in patient and start consultation
  const handleRegisterAndStart = async () => {
    if (!fullName.trim()) {
      setError('Please enter the patient full name.');
      return;
    }
    if (!age || Number(age) <= 0 || Number(age) > 130) {
      setError('Please enter a valid age.');
      return;
    }
    if (mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Create Patient
      const patientRes = await api.patients.create({
        fullName: fullName.trim(),
        age: Number(age),
        dateOfBirth: dateOfBirth || '',
        gender,
        mobile: mobile.trim()
      });

      // 2. Create Consultation with selected symptoms
      const consultationRes = await api.consultations.create({
        patientId: patientRes.patient.id,
        symptoms: selectedSymptoms
      });

      onStartConsultation(consultationRes.consultation, patientRes.patient);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Symptoms to display
  const filteredSymptoms = PREDEFINED_SYMPTOMS.filter(s =>
    s.toLowerCase().includes(symptomSearch.toLowerCase().trim())
  );

  const avatarColors = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-purple-500'];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-700" />
              Walk-in patient
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Find or add them, then go straight into the consultation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </span>
              <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* STEP 1: SEARCH PATIENT */}
          {step === 'search' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  FIND THE PATIENT
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Name, code, or phone..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  A name or a full mobile number — either finds them.
                </p>
              </div>

              {/* Search Results Dropdown */}
              {searchQuery.trim().length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white shadow-md max-h-60 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((pat, idx) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => handleSelectExistingPatient(pat)}
                        disabled={isSubmitting}
                        className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${avatarColors[idx % avatarColors.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                            {pat.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-teal-800">
                              {pat.fullName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {pat.patientCode} • {pat.mobile} • {pat.gender} • {pat.age}y
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-700 transition-colors" />
                      </button>
                    ))
                  ) : !isSearching ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No matching patients found with &quot;{searchQuery}&quot;.
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400">Searching...</div>
                  )}
                </div>
              )}

              {/* Action to switch to registration */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    // Pre-fill query into name or mobile
                    if (/^\d+$/.test(searchQuery.trim())) {
                      setMobile(searchQuery.trim().slice(0, 10));
                    } else if (searchQuery.trim()) {
                      setFullName(searchQuery.trim());
                    }
                    setStep('register');
                  }}
                  className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Register & start consultation
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: REGISTRATION FORM */
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Mobile Number with counter & duplicate alert */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    MOBILE NUMBER *
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-slate-400">{mobile.length}/10</span>
                    <button
                      type="button"
                      onClick={() => setStep('search')}
                      className="text-[11px] font-semibold text-teal-700 hover:text-teal-800"
                    >
                      Search again
                    </button>
                  </div>
                </div>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={e => handleMobileChange(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono tracking-wider"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  New patient — record is created when you start the consultation.
                </p>

                {/* Duplicate mobile detected warning */}
                {existingDuplicatePatient && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-amber-900">
                        Patient already registered with this mobile!
                      </p>
                      <p className="text-[11px] text-amber-700">
                        {existingDuplicatePatient.fullName} ({existingDuplicatePatient.patientCode})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectExistingPatient(existingDuplicatePatient)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      Open Patient
                    </button>
                  </div>
                )}
              </div>

              {/* Name, DOB, Age, Gender Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    {t('fullName')} *
                  </label>
                  <input
                    type="text"
                    placeholder={t('fullName')}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    {t('dateOfBirth')} <span className="font-normal text-slate-400 lowercase">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={e => handleDateOfBirthChange(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="sm:col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      {t('age')} *
                    </label>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="125"
                    placeholder="e.g. 25"
                    value={age}
                    onChange={e => handleAgeChange(e.target.value)}
                    className={`w-full text-xs px-2 py-2 bg-white border rounded-xl focus:ring-1 focus:ring-teal-500 text-center ${
                      isAgeAutoCalculated ? 'border-teal-500 bg-teal-50/30 font-bold text-teal-900' : 'border-slate-300'
                    }`}
                  />
                  {isAgeAutoCalculated && (
                    <span className="text-[9px] font-bold text-teal-700 block text-center mt-0.5">
                      {t('autoCalculated')}
                    </span>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    {t('gender')} *
                  </label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value as Gender)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="Male">{t('male')}</option>
                    <option value="Female">{t('female')}</option>
                    <option value="Other">{t('other')}</option>
                  </select>
                </div>
              </div>

              {/* Symptoms / Reason (optional) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    SYMPTOMS / REASON <span className="font-normal text-slate-400 lowercase">(optional)</span>
                  </label>
                  {selectedSymptoms.length > 0 && (
                    <span className="text-[11px] font-semibold text-teal-800">
                      {selectedSymptoms.length} selected
                    </span>
                  )}
                </div>

                {/* Selected Symptoms Chips */}
                {selectedSymptoms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-teal-50/50 rounded-xl border border-teal-100">
                    {selectedSymptoms.map(sym => (
                      <span
                        key={sym}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-800 text-white"
                      >
                        {sym}
                        <button
                          type="button"
                          onClick={() => toggleSymptom(sym)}
                          className="hover:text-teal-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search symptoms */}
                <input
                  type="text"
                  placeholder="Search all 90 symptoms..."
                  value={symptomSearch}
                  onChange={e => setSymptomSearch(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                />

                {/* Common quick chips */}
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                  {filteredSymptoms.slice(0, 16).map(s => {
                    const isSelected = selectedSymptoms.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSymptom(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                          isSelected
                            ? 'bg-teal-800 text-white border-teal-800 font-semibold'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-500'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Add custom symptom */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add a custom symptom (press Enter)"
                    value={customSymptom}
                    onChange={e => setCustomSymptom(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomSymptom())}
                    className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSymptom}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Submit action */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleRegisterAndStart}
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  {isSubmitting ? 'Registering...' : 'Register & start consultation'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
