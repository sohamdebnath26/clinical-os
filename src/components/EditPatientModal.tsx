import React, { useState } from 'react';
import { Patient, Gender } from '../types';
import { api } from '../lib/api';
import { calculateAgeFromDOB } from '../lib/dateUtils';
import { useLanguage } from '../context/LanguageContext';
import { COMMON_ALLERGIES, COMMON_MEDICATIONS } from '../data/clinicalCatalogues';
import { DropdownSuggest } from './DropdownSuggest';
import { X, Save, AlertCircle, CheckCircle, Sparkles, UserCheck } from 'lucide-react';

interface EditPatientModalProps {
  patient: Patient;
  onClose: () => void;
  onPatientUpdated: (updatedPatient: Patient) => void;
}

export const EditPatientModal: React.FC<EditPatientModalProps> = ({
  patient,
  onClose,
  onPatientUpdated
}) => {
  const { t } = useLanguage();

  const [fullName, setFullName] = useState(patient.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(patient.dateOfBirth || '');
  const [age, setAge] = useState(String(patient.age));
  const [isAgeAutoCalculated, setIsAgeAutoCalculated] = useState(false);
  const [gender, setGender] = useState<Gender>(patient.gender);
  const [mobile, setMobile] = useState(patient.mobile);
  const [bloodGroup, setBloodGroup] = useState(patient.bloodGroup || 'O+');
  const [address, setAddress] = useState(patient.address || '');
  const [emergencyContact, setEmergencyContact] = useState(patient.emergencyContact || '');
  const [allergies, setAllergies] = useState(patient.allergies || '');
  const [currentMedications, setCurrentMedications] = useState(patient.currentMedications || '');
  const [medicalHistory, setMedicalHistory] = useState(patient.medicalHistory || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically calculate age when DOB is changed
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please provide patient full name.');
      return;
    }
    if (age === '' || Number(age) < 0) {
      setError('Please enter a valid age.');
      return;
    }
    if (mobile.replace(/\D/g, '').length !== 10) {
      setError('Mobile number must be exactly 10 digits.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.patients.update(patient.id, {
        fullName: fullName.trim(),
        age: Number(age),
        dateOfBirth: dateOfBirth || '',
        gender,
        mobile: mobile.trim(),
        bloodGroup,
        address: address.trim(),
        emergencyContact: emergencyContact.trim(),
        allergies: allergies.trim(),
        currentMedications: currentMedications.trim(),
        medicalHistory: medicalHistory.trim()
      });

      onPatientUpdated(res.patient);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update patient record';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const medicationOptions = COMMON_MEDICATIONS.map(m => ({
    label: m.name,
    subtext: `${m.dosage} • ${m.frequency}`
  }));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-800 text-white flex items-center justify-center font-bold shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Edit Patient Record
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                {patient.patientCode} • Updating demographic & medical details
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Full Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('fullName')} *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500 font-semibold text-slate-800"
              />
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('mobile')} (10 digits) *
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={mobile}
                onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500 font-mono"
              />
            </div>

            {/* Blood Group */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('bloodGroup')}
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
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>

            {/* DOB with auto age */}
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

            {/* Age */}
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
                value={age}
                onChange={e => handleAgeChange(e.target.value)}
                className={`w-full text-xs px-3 py-2 bg-white border rounded-xl focus:ring-1 focus:ring-teal-500 ${
                  isAgeAutoCalculated ? 'border-teal-500 bg-teal-50/20 font-semibold text-teal-900' : 'border-slate-300'
                }`}
              />
            </div>

            {/* Gender */}
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

            {/* Emergency Contact */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('emergencyContact')}
              </label>
              <input
                type="text"
                placeholder="Name & contact phone"
                value={emergencyContact}
                onChange={e => setEmergencyContact(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Residential Address */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('address')}
              </label>
              <input
                type="text"
                placeholder="Street address, city"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Allergies: Dropdown Menu with Auto-Suggest (NOT chips!) */}
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <DropdownSuggest
                label="Known Drug & Medical Allergies"
                placeholder="Select from dropdown menu or type to auto-suggest (e.g. Penicillin, Sulfa)..."
                suggestions={COMMON_ALLERGIES}
                value={allergies}
                onChange={setAllergies}
                isAllergy={true}
                helperText="Click the dropdown arrow or type to auto-suggest allergies from clinical catalogue."
              />
            </div>

            {/* Current Medications: Dropdown Menu with Auto-Suggest (NOT chips!) */}
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <DropdownSuggest
                label="Current / Ongoing Medications"
                placeholder="Select from dropdown menu or type to auto-suggest medication..."
                suggestions={medicationOptions}
                value={currentMedications}
                onChange={setCurrentMedications}
                isAllergy={false}
                helperText="Click the dropdown arrow or type to auto-suggest medications. Select from the dropdown menu."
              />
            </div>

            {/* Medical & Surgical History */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {t('chronicConditions')} & Surgical History
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

          {/* Footer actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? t('saving') : t('save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
