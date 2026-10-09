import React, { useState, useEffect } from 'react';
import { Patient, Appointment, AppointmentType, Gender } from '../types';
import { api } from '../lib/api';
import { calculateAgeFromDOB } from '../lib/dateUtils';
import { useLanguage } from '../context/LanguageContext';
import { X, Calendar, Clock, User, FileText, CheckCircle2, UserPlus, Search } from 'lucide-react';

interface ScheduleAppointmentModalProps {
  onClose: () => void;
  onSuccess: (appointment: Appointment) => void;
  patient?: Patient | null;
  initialAppointment?: Appointment | null;
}

export const ScheduleAppointmentModal: React.FC<ScheduleAppointmentModalProps> = ({
  onClose,
  onSuccess,
  patient: preselectedPatient,
  initialAppointment
}) => {
  const { t } = useLanguage();
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(preselectedPatient || null);
  const [patientSearch, setPatientSearch] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);

  // Patient Mode: existing vs new patient registration
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing');
  const [newFullName, setNewFullName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newDateOfBirth, setNewDateOfBirth] = useState('');
  const [newAge, setNewAge] = useState('');
  const [isNewAgeAutoCalculated, setIsNewAgeAutoCalculated] = useState(false);
  const [newGender, setNewGender] = useState<Gender>('Male');

  const handleNewDOBChange = (val: string) => {
    setNewDateOfBirth(val);
    if (val) {
      const calculated = calculateAgeFromDOB(val);
      if (calculated !== '') {
        setNewAge(String(calculated));
        setIsNewAgeAutoCalculated(true);
      }
    } else {
      setIsNewAgeAutoCalculated(false);
    }
  };

  // Form states
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultDate = initialAppointment?.date || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  })();

  const [date, setDate] = useState<string>(defaultDate);
  const [time, setTime] = useState<string>(initialAppointment?.time || '10:00 AM');
  const [type, setType] = useState<AppointmentType>(initialAppointment?.type || 'follow_up');
  const [instructions, setInstructions] = useState<string>(initialAppointment?.instructions || '');
  const [notes, setNotes] = useState<string>(initialAppointment?.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preselectedPatient && !initialAppointment) {
      api.patients.list()
        .then(res => setAllPatients(res.patients))
        .catch(err => console.warn('Failed to load patients for appointment:', err));
    }
  }, [preselectedPatient, initialAppointment]);

  const filteredPatients = allPatients.filter(p =>
    p.fullName.toLowerCase().includes(patientSearch.toLowerCase().trim()) ||
    p.patientCode.toLowerCase().includes(patientSearch.toLowerCase().trim()) ||
    (p.mobile && p.mobile.includes(patientSearch.trim()))
  );

  const applyPresetDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date) {
      setError('Please select an appointment date');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let patientIdToUse = selectedPatient?.id;

      // If in new patient mode, register patient first
      if (!initialAppointment && !preselectedPatient && patientMode === 'new') {
        if (!newFullName.trim()) {
          setError('Please enter the patient full name');
          setIsSubmitting(false);
          return;
        }

        const patientRes = await api.patients.create({
          fullName: newFullName.trim(),
          mobile: newMobile.trim(),
          gender: newGender,
          age: Number(newAge) || 0,
          dateOfBirth: newDateOfBirth || undefined
        });

        patientIdToUse = patientRes.patient.id;
      } else if (!patientIdToUse) {
        setError('Please select a patient for this appointment');
        setIsSubmitting(false);
        return;
      }

      if (initialAppointment) {
        const res = await api.appointments.update(initialAppointment.id, {
          date,
          time,
          type,
          instructions,
          notes
        });
        if (res.appointment) onSuccess(res.appointment);
      } else {
        const res = await api.appointments.create({
          patientId: patientIdToUse,
          date,
          time,
          type,
          instructions,
          notes
        });
        if (res.appointment) onSuccess(res.appointment);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to schedule appointment';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-800 text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                {initialAppointment ? 'Reschedule Appointment' : 'Schedule Appointment / Follow-up'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Maintain clinical continuity consistent with follow-up dates
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Patient Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-700" />
                Patient
              </label>
              {!selectedPatient && !preselectedPatient && !initialAppointment && (
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPatientMode('existing')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                      patientMode === 'existing'
                        ? 'bg-white text-teal-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Existing Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientMode('new')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                      patientMode === 'new'
                        ? 'bg-white text-teal-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    New Patient
                  </button>
                </div>
              )}
            </div>

            {selectedPatient ? (
              <div className="flex items-center justify-between p-3 bg-teal-50/60 border border-teal-200 rounded-xl">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">{selectedPatient.fullName}</span>
                  <span className="text-[11px] text-slate-500">
                    {selectedPatient.patientCode} · {selectedPatient.age}y {selectedPatient.gender} · {selectedPatient.mobile || 'No phone'}
                  </span>
                </div>
                {!preselectedPatient && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientMode('existing');
                    }}
                    className="text-xs text-teal-800 font-semibold hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : patientMode === 'new' && !preselectedPatient && !initialAppointment ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-teal-700" />
                    New Patient Information
                  </span>
                  <span className="text-[10px] text-slate-400">Will be saved to clinic records</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Gurpreet Singh"
                      value={newFullName}
                      onChange={e => setNewFullName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={newMobile}
                      onChange={e => setNewMobile(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={newDateOfBirth}
                      onChange={e => handleNewDOBChange(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-600">
                        Age (Years)
                      </label>
                      {isNewAgeAutoCalculated && (
                        <span className="text-[9px] font-bold text-teal-700 bg-teal-50 px-1 rounded">Auto</span>
                      )}
                    </div>
                    <input
                      type="number"
                      placeholder="e.g. 35"
                      value={newAge}
                      onChange={e => {
                        setNewAge(e.target.value);
                        setIsNewAgeAutoCalculated(false);
                      }}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Gender
                    </label>
                    <select
                      value={newGender}
                      onChange={e => setNewGender(e.target.value as Gender)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search patient by name, ID code, or mobile..."
                  value={patientSearch}
                  onChange={e => {
                    setPatientSearch(e.target.value);
                    setIsPatientDropdownOpen(true);
                  }}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
                {isPatientDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {filteredPatients.length > 0 ? (
                      filteredPatients.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setIsPatientDropdownOpen(false);
                            setPatientSearch('');
                          }}
                          className="w-full text-left p-2.5 hover:bg-teal-50/60 text-xs transition-colors flex items-center justify-between"
                        >
                          <div>
                            <span className="font-bold text-slate-800 block">{p.fullName}</span>
                            <span className="text-[10px] text-slate-400">
                              {p.patientCode} • {p.age}y {p.gender}
                            </span>
                          </div>
                          <span className="text-[10px] text-teal-700 font-medium">Select</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-500">
                        <p>No matching patient found.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPatientDropdownOpen(false);
                            setPatientMode('new');
                            if (patientSearch) setNewFullName(patientSearch);
                          }}
                          className="mt-1 text-teal-800 font-bold hover:underline inline-flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" />
                          Register as new patient
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date Picker & Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-700" />
                Follow-up / Appointment Date
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Quick presets:</span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setDate(todayStr)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPresetDays(3)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors"
              >
                +3 Days
              </button>
              <button
                type="button"
                onClick={() => applyPresetDays(7)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors"
              >
                +1 Week
              </button>
              <button
                type="button"
                onClick={() => applyPresetDays(14)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors"
              >
                +2 Weeks
              </button>
              <button
                type="button"
                onClick={() => applyPresetDays(30)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors"
              >
                +1 Month
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white font-medium"
                />
              </div>

              <div>
                <select
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white font-medium"
                >
                  <option value="09:00 AM">09:00 AM (Morning OPD)</option>
                  <option value="09:30 AM">09:30 AM</option>
                  <option value="10:00 AM">10:00 AM</option>
                  <option value="10:30 AM">10:30 AM</option>
                  <option value="11:00 AM">11:00 AM</option>
                  <option value="11:30 AM">11:30 AM</option>
                  <option value="12:00 PM">12:00 PM (Noon)</option>
                  <option value="02:00 PM">02:00 PM (Afternoon OPD)</option>
                  <option value="03:00 PM">03:00 PM</option>
                  <option value="04:00 PM">04:00 PM</option>
                  <option value="05:00 PM">05:00 PM (Evening OPD)</option>
                  <option value="06:00 PM">06:00 PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Appointment Nature / Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'follow_up', label: 'Follow-up', desc: 'Post-consult review' },
                { key: 'new_consultation', label: 'Consultation', desc: 'Full medical intake' },
                { key: 'routine_checkup', label: 'Checkup', desc: 'Periodic review' },
                { key: 'procedure', label: 'Procedure', desc: 'Treatment / Minor OT' }
              ].map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setType(item.key as AppointmentType)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    type === item.key
                      ? 'border-teal-700 bg-teal-50/70 text-teal-950 font-bold ring-1 ring-teal-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <span className="text-xs block">{item.label}</span>
                  <span className="text-[10px] font-normal text-slate-400 block">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-teal-700" />
              Doctor Instructions & Care Plan
            </label>
            <input
              type="text"
              placeholder="e.g. Bring biopsy report; check wound healing; SOS if erythema increases"
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white"
            />
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Internal Clinical Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Private notes for clinic staff or doctor..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white"
            />
          </div>

          {/* Bottom actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedPatient}
              className="px-5 py-2 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : initialAppointment ? 'Update Appointment' : 'Confirm Appointment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
