import React, { useState } from 'react';
import { Patient, Gender } from '../types';
import { api } from '../lib/api';
import { calculateAgeFromDOB } from '../lib/dateUtils';
import { useLanguage } from '../context/LanguageContext';
import { COMMON_ALLERGIES, COMMON_MEDICATIONS } from '../data/clinicalCatalogues';
import { DropdownSuggest } from './DropdownSuggest';
import { X, UserPlus, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';

interface AddPatientModalProps {
  onClose: () => void;
  onPatientCreated: (patient: Patient) => void;
}

export const AddPatientModal: React.FC<AddPatientModalProps> = ({
  onClose,
  onPatientCreated
}) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isAgeAutoCalculated, setIsAgeAutoCalculated] = useState(false);
  const [gender, setGender] = useState<Gender>('Male');
  const [mobile, setMobile] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [address, setAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [allergies, setAllergies] = useState('');
  const [currentMedications, setCurrentMedications] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  const [existingPatient, setExistingPatient] = useState<Patient | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically calculate age whenever DOB is entered or changed
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

  const handleMobileChange = async (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setMobile(cleaned);
    setExistingPatient(null);

    if (cleaned.length === 10) {
      try {
        const res = await api.patients.checkMobile(cleaned);
        if (res.exists && res.patient) {
          setExistingPatient(res.patient);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please provide patient full name.');
      return;
    }
    if (age === '' || Number(age) < 0) {
      setError('Please enter or calculate a valid age.');
      return;
    }
    if (mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (existingPatient) {
      setError(`An existing patient was found with this mobile number (${existingPatient.fullName} · ${existingPatient.patientCode}).`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.patients.create({
        fullName: fullName.trim(),
        age: Number(age),
        dateOfBirth,
        gender,
        mobile: mobile.trim(),
        bloodGroup,
        address: address.trim(),
        emergencyContact: emergencyContact.trim(),
        allergies: allergies.trim(),
        currentMedications: currentMedications.trim(),
        medicalHistory: medicalHistory.trim()
      });

      onPatientCreated(res.patient);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error creating patient';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Add New Patient</h2>
              <p className="text-xs text-slate-500">Register patient into clinical registry</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </span>
              <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {existingPatient && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center justify-between">
              <div>
                <span className="font-bold block">Duplicate Mobile Alert:</span>
                An existing patient was found with this mobile number: {existingPatient.fullName} ({existingPatient.patientCode}).
              </div>
              <button
                type="button"
                onClick={() => onPatientCreated(existingPatient)}
                className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-semibold hover:bg-amber-700 shrink-0 ml-2"
              >
                Open Existing
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Eleanor Vance"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Mobile Number *
              </label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit number"
                  value={mobile}
                  onChange={e => handleMobileChange(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                  {mobile.length}/10
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('dateOfBirth')}
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={e => handleDateOfBirthChange(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {t('dobHint')}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  {t('age')} *
                </label>
                {isAgeAutoCalculated && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                    <Sparkles className="w-2.5 h-2.5 text-teal-600" /> {t('autoCalculated')}
                  </span>
                )}
              </div>
              <input
                type="number"
                min="0"
                max="130"
                required
                placeholder={t('age')}
                value={age}
                onChange={e => handleAgeChange(e.target.value)}
                className={`w-full text-xs px-3 py-2 bg-white border rounded-xl focus:ring-1 focus:ring-teal-500 ${
                  isAgeAutoCalculated ? 'border-teal-500 bg-teal-50/20 font-semibold text-teal-900' : 'border-slate-300'
                }`}
              />
            </div>

            <div>
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

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Blood Group
              </label>
              <select
                value={bloodGroup}
                onChange={e => setBloodGroup(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              >
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Emergency Contact
              </label>
              <input
                type="text"
                placeholder="Name & contact phone"
                value={emergencyContact}
                onChange={e => setEmergencyContact(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Residential Address
              </label>
              <input
                type="text"
                placeholder="Street address, city"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Allergies Dropdown Menu with Auto-suggest (NOT chips) */}
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <DropdownSuggest
                label="Known Drug Allergies"
                placeholder="Select from dropdown menu or type to auto-suggest (e.g. Penicillin, Sulfa)..."
                suggestions={COMMON_ALLERGIES}
                value={allergies}
                onChange={setAllergies}
                isAllergy={true}
                helperText="Click dropdown arrow or type to auto-suggest allergies."
              />
            </div>

            {/* Current Medications Dropdown Menu with Auto-suggest (NOT chips) */}
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <DropdownSuggest
                label="Current / Regular Medications"
                placeholder="Select from dropdown menu or type to auto-suggest medication..."
                suggestions={COMMON_MEDICATIONS.map(m => ({ label: m.name, subtext: `${m.dosage} • ${m.frequency}` }))}
                value={currentMedications}
                onChange={setCurrentMedications}
                isAllergy={false}
                helperText="Click dropdown arrow or type to auto-suggest medication from catalogue."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Medical & Surgical History
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Type 2 Diabetes, Hypertension, Asthma"
                value={medicalHistory}
                onChange={e => setMedicalHistory(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
