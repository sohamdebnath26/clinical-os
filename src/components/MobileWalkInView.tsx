import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { PREDEFINED_SYMPTOMS } from '../data/clinicalCatalogues';
import {
  Smartphone,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  User,
  Activity,
  Scale,
  Stethoscope,
  Plus,
  X,
  Check,
  Sparkles,
  Phone
} from 'lucide-react';
import { VoiceDictationButton } from './VoiceDictationButton';

interface MobileWalkInViewProps {
  token: string;
}

const COUNTRY_CODES = [
  { code: '+91', label: '+91' },
  { code: '+1', label: '+1' },
  { code: '+44', label: '+44' },
  { code: '+971', label: '+971' },
  { code: '+65', label: '+65' },
  { code: '+61', label: '+61' },
];

export const MobileWalkInView: React.FC<MobileWalkInViewProps> = ({ token }) => {
  const [session, setSession] = useState<{
    token: string;
    doctorId: string;
    doctorName: string;
    clinicName: string;
    mobile: string;
    countryCode: string;
    fullName: string;
    sex: string;
    age: string;
    weight: string;
    symptoms: string[];
    notes: string;
    noKnownAllergies: boolean;
    discountPanel: string;
    status: 'pending' | 'submitted';
    submittedAt?: string;
    expiresAt: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);

  // Patient self-intake fields
  const [countryCode, setCountryCode] = useState('+91');
  const [mobile, setMobile] = useState('');
  const [fullName, setFullName] = useState('');
  const [sex, setSex] = useState<'Not specified' | 'Female' | 'Male' | 'Other'>('Not specified');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState('');
  const [symptomSearch, setSymptomSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    api.walkin
      .getMobileSession(token)
      .then(res => {
        if (!mounted) return;
        const s = res.session;
        setSession(s);
        setCountryCode(s.countryCode || '+91');
        setMobile((s.mobile || '').replace(/\D/g, '').slice(0, 10));
        setFullName(s.fullName || '');
        if (s.sex === 'Female' || s.sex === 'Male' || s.sex === 'Other') {
          setSex(s.sex);
        } else {
          setSex('Not specified');
        }
        setAge(s.age || '');
        setWeight(s.weight || '');
        setSelectedSymptoms(Array.isArray(s.symptoms) ? s.symptoms : []);
        setNotes(s.notes || '');
        setNoKnownAllergies(Boolean(s.noKnownAllergies));
        if (s.status === 'submitted') {
          setIsSubmittedSuccess(true);
        }
        setError(null);
      })
      .catch(err => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unable to load walk-in registration link');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const toggleSymptom = (sym: string) => {
    setSelectedSymptoms(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const handleAddCustomSymptom = () => {
    const trimmed = customSymptom.trim();
    if (!trimmed) return;
    if (!selectedSymptoms.includes(trimmed)) {
      setSelectedSymptoms(prev => [...prev, trimmed]);
    }
    setCustomSymptom('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = mobile.replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length !== 10) {
      setError('Please enter your 10-digit mobile number.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!age || Number(age) <= 0 || Number(age) > 130) {
      setError('Please enter your valid age in years.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api.walkin.submitMobileSession(token, {
        mobile: cleanPhone,
        countryCode,
        fullName: fullName.trim(),
        sex,
        age: String(age),
        weight: weight ? String(weight) : '',
        symptoms: selectedSymptoms,
        notes: noKnownAllergies ? 'No known allergies' : notes.trim(),
        noKnownAllergies
      });
      setSession(res.session);
      setIsSubmittedSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit details');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSymptoms = PREDEFINED_SYMPTOMS.filter(s =>
    s.toLowerCase().includes(symptomSearch.toLowerCase().trim())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d3f3b] text-white flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-teal-300 animate-spin mb-3" />
        <p className="text-base font-bold">Loading Patient Self-Check-In...</p>
        <p className="text-xs text-teal-200/80 mt-1">Connecting securely to clinic reception</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-base font-bold">Registration Link Expired or Invalid</h1>
        <p className="text-xs text-slate-300 mt-2 max-w-xs leading-relaxed">{error}</p>
        <p className="text-[11px] text-slate-400 mt-4">
          Please ask the doctor or reception desk to send a fresh registration link to your mobile number.
        </p>
      </div>
    );
  }

  if (isSubmittedSuccess) {
    return (
      <div className="min-h-screen bg-[#f2f6f5] text-slate-900 flex flex-col justify-between p-4 sm:p-6">
        <div className="max-w-md w-full mx-auto mt-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-lg text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
              <Sparkles className="w-3.5 h-3.5" />
              Check-In Complete
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-3">
              Thank you, {fullName}!
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Your walk-in registration details have been sent directly to{' '}
              <span className="font-semibold text-slate-800">{session?.doctorName || 'your doctor'}</span>&apos;s screen.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-left space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500 font-medium">Mobile Number</span>
              <span className="font-bold text-slate-800">{countryCode} {mobile}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
              <span className="text-slate-500 font-medium">Age / Gender</span>
              <span className="font-bold text-slate-800">{age} yrs • {sex}</span>
            </div>
            {weight && (
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                <span className="text-slate-500 font-medium">Weight</span>
                <span className="font-bold text-slate-800">{weight} kg</span>
              </div>
            )}
            {selectedSymptoms.length > 0 && (
              <div className="pt-1">
                <span className="text-slate-500 font-medium block mb-1.5">Symptoms Reported</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSymptoms.map(sym => (
                    <span
                      key={sym}
                      className="px-2.5 py-1 rounded-lg bg-teal-800 text-white font-semibold text-[11px]"
                    >
                      {sym}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsSubmittedSuccess(false)}
            className="w-full py-3 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors"
          >
            Edit My Details
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          {session?.clinicName || 'Clinical OS'} • Secure Patient Self-Registration
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f6f5] text-slate-900 pb-12">
      {/* Top Clinical Banner */}
      <div className="bg-[#0d3f3b] text-white px-5 py-4 shadow-md sticky top-0 z-20">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300 block">
                {session?.clinicName || 'Clinical Practice'}
              </span>
              <h1 className="text-sm font-bold leading-tight">
                Walk-In Patient Self Check-In
              </h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            Live Sync
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 space-y-4">
        {/* Attending Doctor Info */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Registering For Consultation With
            </span>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {session?.doctorName || 'Attending Doctor'}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
            Step-by-Step Form
          </span>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </span>
            <button type="button" onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 1: Mobile Number */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] font-bold flex items-center justify-center">
              1
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#3f6f66]" />
              Registered Mobile Number
            </h2>
          </div>

          <div className="flex items-stretch rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:border-[#3f6f66] focus-within:ring-2 focus-within:ring-[#3f6f66]/15">
            <select
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border-r border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none"
            >
              {COUNTRY_CODES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              value={mobile}
              onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210 (10 digits)"
              maxLength={10}
              className="flex-1 px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {mobile.length > 0 && (
              <span className="self-center mr-3 text-[11px] font-mono text-slate-400">
                {mobile.length}/10
              </span>
            )}
          </div>
        </div>

        {/* STEP 2: Personal Details (Name, Gender, Age, Weight) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] font-bold flex items-center justify-center">
              2
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#3f6f66]" />
              Personal & Vitals Details
            </h2>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3.5 py-2.5 pr-10 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15"
              />
              <div className="absolute right-2">
                <VoiceDictationButton
                  value={fullName}
                  onChange={setFullName}
                  variant="badge"
                  className="border-0 shadow-none bg-transparent"
                  title="Speak your name"
                />
              </div>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Gender <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Female', 'Male', 'Other'] as const).map(g => {
                const active = sex === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSex(g)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      active
                        ? 'bg-[#3f6f66] text-white border-[#3f6f66] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Age & Weight side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-[#3f6f66]" />
                Age (years) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="125"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="e.g. 28"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-[#3f6f66]" />
                Weight (kg)
              </label>
              <input
                type="number"
                min="1"
                max="300"
                step="0.5"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 65"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] focus:ring-2 focus:ring-[#3f6f66]/15"
              />
            </div>
          </div>
        </div>

        {/* STEP 3: Symptoms / Reason for Visit */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-[#3f6f66]" />
                Symptoms / Reason for Visit
              </h2>
            </div>
            {selectedSymptoms.length > 0 && (
              <span className="text-[11px] font-bold text-[#3f6f66] bg-[#3f6f66]/10 px-2 py-0.5 rounded-full">
                {selectedSymptoms.length} selected
              </span>
            )}
          </div>

          {selectedSymptoms.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-teal-50/70 border border-teal-200/80 rounded-xl">
              {selectedSymptoms.map(sym => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#3f6f66] text-white"
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

          <input
            type="text"
            value={symptomSearch}
            onChange={e => setSymptomSearch(e.target.value)}
            placeholder="Filter common symptoms..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66]"
          />

          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-0.5">
            {filteredSymptoms.slice(0, 18).map(sym => {
              const isSelected = selectedSymptoms.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymptom(sym)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    isSelected
                      ? 'bg-[#3f6f66] text-white border-[#3f6f66] font-semibold shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-[#3f6f66]'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={customSymptom}
              onChange={e => setCustomSymptom(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomSymptom();
                }
              }}
              placeholder="Other symptom? Type here..."
              className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66]"
            />
            <VoiceDictationButton
              value={customSymptom}
              onChange={setCustomSymptom}
              variant="badge"
              title="Speak custom symptom"
            />
            <button
              type="button"
              onClick={handleAddCustomSymptom}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* STEP 4: Allergies / Notes */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#3f6f66] text-white text-[11px] font-bold flex items-center justify-center">
                4
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Allergies & Notes (Optional)
              </h2>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={noKnownAllergies}
                onChange={e => {
                  setNoKnownAllergies(e.target.checked);
                  if (e.target.checked) setNotes('No known allergies');
                  else if (notes === 'No known allergies') setNotes('');
                }}
                className="rounded border-slate-300 text-[#3f6f66] focus:ring-[#3f6f66]"
              />
              No known allergies
            </label>
          </div>

          <input
            type="text"
            value={notes}
            disabled={noKnownAllergies}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any drug/food allergies or notes for the doctor"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3f6f66] disabled:bg-slate-100 disabled:text-slate-500"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 px-5 rounded-2xl bg-[#3f6f66] hover:bg-[#325a52] text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending to Doctor...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Submit Walk-In Registration
            </>
          )}
        </button>
      </form>
    </div>
  );
};
