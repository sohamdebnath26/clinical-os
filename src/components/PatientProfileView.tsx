import React, { useState, useEffect } from 'react';
import { Patient, Consultation, PrescriptionItem, BodyMarker, ClinicalImage, Appointment } from '../types';
import { api } from '../lib/api';
import { BodyMap } from './BodyMap';
import { PrintRxModal } from './PrintRxModal';
import { EditPatientModal } from './EditPatientModal';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';
import { MarkdownView } from './MarkdownView';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Plus,
  Stethoscope,
  Sparkles,
  User,
  Clock,
  Pill,
  ChevronRight,
  ShieldAlert,
  Printer,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Pencil
} from 'lucide-react';

interface PatientProfileViewProps {
  patientId: string;
  onBack: () => void;
  onStartConsultation: (patient: Patient) => void;
  onOpenAIWithPrompt?: (prompt: string) => void;
}

type TabType = 'overview' | 'appointments' | 'bodymap' | 'visits' | 'prescriptions' | 'timeline';

export const PatientProfileView: React.FC<PatientProfileViewProps> = ({
  patientId,
  onBack,
  onStartConsultation,
  onOpenAIWithPrompt
}) => {
  const { doctor } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [markers, setMarkers] = useState<BodyMarker[]>([]);
  const [images, setImages] = useState<ClinicalImage[]>([]);

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Print Rx Modal
  const [showPrintRx, setShowPrintRx] = useState(false);

  // Edit Patient Modal
  const [showEditModal, setShowEditModal] = useState(false);

  // Schedule Appointment Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Expandable timeline events
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  const loadPatientData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [patRes, conRes, timeRes, rxRes, markRes, imgRes, apptRes] = await Promise.all([
        api.patients.get(patientId),
        api.patients.getConsultations(patientId),
        api.patients.getTimeline(patientId),
        api.patients.getPrescriptions(patientId),
        api.patients.getMarkers(patientId),
        api.patients.getImages(patientId),
        api.appointments.list({ patientId })
      ]);

      setPatient(patRes.patient);
      setConsultations(conRes.consultations);
      setTimelineEvents(timeRes.events);
      setPrescriptions(rxRes.prescriptions);
      setMarkers(markRes.markers);
      setImages(imgRes.images);
      setAppointments(apptRes.appointments);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error loading patient profile';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatientData();
  }, [patientId]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold">Loading clinical medical record...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <p className="text-sm text-red-600 font-semibold">{error || 'Patient not found'}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
        >
          Return to Patient Directory
        </button>
      </div>
    );
  }

  const toggleExpandEvent = (id: string) => {
    setExpandedEvents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={onBack}
            className="hover:text-slate-700 font-medium transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Patients</span>
          </button>
          <span>/</span>
          <span className="text-slate-700 font-semibold">{patient.fullName}</span>
          <span>/</span>
          <span className="capitalize">{activeTab}</span>
        </div>
      </div>

      {/* Patient Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
            {patient.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {patient.fullName}
              </h1>
              <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                {patient.patientCode}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-medium">
              <span>{patient.age} years old</span>
              <span>•</span>
              <span>{patient.gender}</span>
              {patient.bloodGroup && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">Blood: {patient.bloodGroup}</span>
                </>
              )}
              {patient.allergies && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> Allergies: {patient.allergies}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          <button
            type="button"
            onClick={() => onOpenAIWithPrompt?.('')}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl text-xs font-semibold text-teal-900 shadow-2xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>AI Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-teal-700" />
            <span>Edit details</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPrintRx(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Prescription</span>
          </button>
          <button
            type="button"
            onClick={() => onStartConsultation(patient)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>New consultation</span>
          </button>
        </div>
      </div>

      {/* AI Assistant Quick Chips */}
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          ASK THE AI ASSISTANT:
        </span>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`Summarize ${patient.fullName}'s clinical history`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          Summarize this patient&apos;s history
        </button>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`Generate a structured SOAP note for ${patient.fullName}`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          Generate a SOAP note
        </button>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`List current medications and dosing for ${patient.fullName}`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          List current medications
        </button>
        <button
          type="button"
          onClick={() => onOpenAIWithPrompt?.(`Draft a follow-up plan for ${patient.fullName}`)}
          className="px-3 py-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-medium text-slate-700 transition-colors"
        >
          Draft a follow-up plan
        </button>
      </div>

      {/* Profile Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
        {(['overview', 'appointments', 'bodymap', 'visits', 'prescriptions', 'timeline'] as TabType[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`py-3 px-4 text-xs font-bold transition-all border-b-2 shrink-0 ${
              activeTab === tab
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab === 'overview' && 'Overview'}
            {tab === 'appointments' && `Appointments & Follow-ups (${appointments.length})`}
            {tab === 'bodymap' && 'Body map'}
            {tab === 'visits' && `Visits (${consultations.length})`}
            {tab === 'prescriptions' && `Prescriptions (${prescriptions.length})`}
            {tab === 'timeline' && `Timeline (${timelineEvents.length})`}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
          {/* Left Column: Personal info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Personal Information
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Full Name</span>
                  <span className="font-bold text-slate-800">{patient.fullName}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Patient Code</span>
                  <span className="font-mono font-bold text-teal-800">{patient.patientCode}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Age & Gender</span>
                  <span className="font-semibold text-slate-800">{patient.age}y / {patient.gender}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Mobile Number</span>
                  <span className="font-mono font-medium text-slate-800">{patient.mobile}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Blood Group</span>
                  <span className="font-semibold text-slate-800">{patient.bloodGroup || 'Not recorded'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Date of Birth</span>
                  <span className="font-medium text-slate-700">{patient.dateOfBirth || 'Not provided'}</span>
                </div>
                {patient.emergencyContact && (
                  <div className="col-span-2">
                    <span className="text-[11px] text-slate-400 block font-medium">Emergency Contact</span>
                    <span className="font-medium text-slate-700">{patient.emergencyContact}</span>
                  </div>
                )}
                {patient.address && (
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-[11px] text-slate-400 block font-medium">Residential Address</span>
                    <span className="font-medium text-slate-700">{patient.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Medical History, Medications & Allergies */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Clinical Background & Allergies
                </h3>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-rose-700 block mb-0.5">Known Drug Allergies:</span>
                  <p className="text-slate-700 bg-rose-50/50 p-2.5 rounded-lg border border-rose-100">
                    {patient.allergies || 'No known drug or environmental allergies documented.'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-teal-800 block mb-0.5">Current / Regular Medications:</span>
                  <p className="text-slate-700 bg-teal-50/30 p-2.5 rounded-lg border border-teal-100">
                    {patient.currentMedications || 'No ongoing long-term medications documented.'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-700 block mb-0.5">Medical & Surgical History:</span>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {patient.medicalHistory || 'No past surgical or chronic medical history reported.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Encounters summary */}
          <div className="space-y-6">
            {/* Quick stats card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Patient Metrics
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-slate-800 block">{consultations.length}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Total Visits</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-teal-800 block">{prescriptions.length}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Prescriptions</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-slate-800 block">{markers.length}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Body Pins</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-slate-800 block">{images.length}</span>
                  <span className="text-[11px] text-slate-500 font-medium">Images</span>
                </div>
              </div>
            </div>

            {/* Upcoming Follow-Up & Appointment Card */}
            {(() => {
              const upcomingAppt = appointments.find(a => a.status === 'scheduled' || a.status === 'checked_in');
              const followUpDate = upcomingAppt?.date || consultations[0]?.followUp?.date;
              const followUpInstructions = upcomingAppt?.instructions || consultations[0]?.followUp?.instructions;

              if (!followUpDate) {
                return (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-700" />
                        Follow-up Status
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAppointment(null);
                          setShowScheduleModal(true);
                        }}
                        className="text-xs font-bold text-teal-800 hover:underline"
                      >
                        + Schedule
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      No future follow-up appointment currently scheduled for this patient.
                    </p>
                  </div>
                );
              }

              return (
                <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center justify-between text-amber-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-700" />
                      Follow-up Scheduled
                    </span>
                    <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                      {upcomingAppt?.time || '10:00 AM'}
                    </span>
                  </div>
                  <p className="text-slate-900 font-bold text-sm pt-0.5">
                    {followUpDate}
                  </p>
                  {followUpInstructions && (
                    <p className="text-slate-700 text-[11px] leading-relaxed bg-white/60 p-2 rounded-lg border border-amber-100">
                      <strong>Plan:</strong> {followUpInstructions}
                    </p>
                  )}
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStartConsultation(patient)}
                      className="flex-1 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors flex items-center justify-center gap-1"
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Start Visit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAppointment(upcomingAppt || null);
                        setShowScheduleModal(true);
                      }}
                      className="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 2: APPOINTMENTS & FOLLOW-UPS */}
      {activeTab === 'appointments' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Appointments & Follow-up History</h3>
              <p className="text-xs text-slate-500">
                Scheduled reviews and follow-up dates consistent with clinical consultations
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingAppointment(null);
                setShowScheduleModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Follow-up</span>
            </button>
          </div>

          {appointments.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto shadow-2xs">
                <Calendar className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">No appointments scheduled for this patient</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Follow-ups set during consultation automatically sync here, or schedule an appointment below.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingAppointment(null);
                  setShowScheduleModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-800 text-white rounded-xl text-xs font-semibold hover:bg-teal-900 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Follow-up</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
              {appointments.map(appt => (
                <div key={appt.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-700" />
                        {appt.date}
                      </span>
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {appt.time || '10:00 AM'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        appt.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : appt.status === 'checked_in'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : appt.status === 'in_progress'
                          ? 'bg-teal-50 text-teal-800 border border-teal-300'
                          : appt.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {appt.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                        {appt.type.replace('_', ' ')}
                      </span>
                    </div>

                    {appt.instructions && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                        <strong>Doctor Instructions:</strong> {appt.instructions}
                      </p>
                    )}
                    {appt.notes && (
                      <p className="text-[11px] text-slate-500 italic">
                        Notes: {appt.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => onStartConsultation(patient)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                      >
                        <Stethoscope className="w-3.5 h-3.5 text-teal-200" />
                        <span>Start Consultation</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAppointment(appt);
                        setShowScheduleModal(true);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BODY MAP */}
      {activeTab === 'bodymap' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <BodyMap
            markers={markers}
            readOnly={true}
            patientId={patient.id}
          />
        </div>
      )}

      {/* TAB 3: VISITS */}
      {activeTab === 'visits' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100 animate-in fade-in duration-150">
          {consultations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No consultations recorded yet. Click &quot;New consultation&quot; above to start one.
            </div>
          ) : (
            consultations.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {new Date(c.consultationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      c.status === 'signed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    <strong className="text-slate-700">Diagnosis:</strong> {c.diagnoses.join(', ') || 'None recorded'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Doctor: {c.doctorName} • Fee: ₹{c.fee} • Procedures: {c.procedures.length}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1"
                >
                  View in Timeline <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: PRESCRIPTIONS */}
      {activeTab === 'prescriptions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100 animate-in fade-in duration-150">
          <div className="p-4 bg-slate-50/70 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Active & Historical Prescriptions ({prescriptions.length})
            </h4>
            <button
              type="button"
              onClick={() => setShowPrintRx(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-teal-700" />
              Print Prescription (Rx)
            </button>
          </div>

          {prescriptions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No prescriptions recorded for this patient.
            </div>
          ) : (
            prescriptions.map(rx => (
              <div key={rx.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{rx.medicineName}</p>
                  <p className="text-slate-600 mt-0.5">
                    {rx.dosage} • <span className="font-mono text-teal-800 font-semibold">{rx.frequency}</span> • {rx.duration}
                  </p>
                  {rx.instructions && (
                    <p className="text-[11px] text-slate-500 mt-0.5 italic">Instructions: {rx.instructions}</p>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  {new Date(rx.date || rx.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 5: TIMELINE (Crucial screen seen in video 00:52!) */}
      {activeTab === 'timeline' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {timelineEvents.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">No Historical Consultations Yet</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                When you finish and sign a consultation for {patient.fullName}, it will be permanently recorded here in the chronological timeline.
              </p>
            </div>
          ) : (
            <div className="space-y-6 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-200">
              {timelineEvents.map((evt) => {
                const isExpanded = !!expandedEvents[evt.id];
                const dateObj = new Date(evt.date);
                const dateFormatted = dateObj.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });

                return (
                  <div key={evt.id} className="relative pl-12">
                    {/* Circle Node */}
                    <div className="absolute left-3 top-1.5 -translate-x-1/2 w-4 h-4 rounded-full bg-teal-600 border-2 border-white shadow-xs z-10" />

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-slate-300">
                      {/* Timeline Event Header */}
                      <div
                        onClick={() => toggleExpandEvent(evt.id)}
                        className="p-4 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-extrabold text-slate-900 tracking-tight">
                            {dateFormatted}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs font-semibold text-teal-800">
                            {evt.diagnoses.join(', ') || 'Consultation Encounter'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">Dr. {evt.doctorName}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      {/* Content Card Body */}
                      <div className="p-5 space-y-4 text-xs">
                        {/* Symptoms */}
                        {evt.symptoms && evt.symptoms.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              SYMPTOMS
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {evt.symptoms.map((s: string) => (
                                <span key={s} className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full font-medium text-[11px]">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Summary Block (Exact format from video 00:52!) */}
                        {evt.aiSummary && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1 mb-1">
                              <Sparkles className="w-3 h-3 text-teal-600" />
                              VISIT SUMMARY & CHARGES
                            </span>
                            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-800 leading-relaxed shadow-inner">
                              <MarkdownView content={evt.aiSummary} />
                            </div>
                          </div>
                        )}

                        {/* Expanded details: Notes, Procedures, Tests */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
                            {evt.clinicalNotes?.examination && (
                              <div>
                                <span className="font-bold text-slate-700 block">Examination:</span>
                                <p className="text-slate-600">{evt.clinicalNotes.examination}</p>
                              </div>
                            )}

                            {evt.clinicalNotes?.plan && (
                              <div>
                                <span className="font-bold text-slate-700 block">Plan:</span>
                                <p className="text-slate-600">{evt.clinicalNotes.plan}</p>
                              </div>
                            )}

                            {evt.tests && evt.tests.length > 0 && (
                              <div>
                                <span className="font-bold text-slate-700 block">Investigations Ordered:</span>
                                <p className="text-slate-600">{evt.tests.join(', ')}</p>
                              </div>
                            )}

                            {evt.prescriptions && evt.prescriptions.length > 0 && (
                              <div>
                                <span className="font-bold text-slate-700 block">Medications Prescribed:</span>
                                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                  {evt.prescriptions.map((p: any, i: number) => (
                                    <li key={i}>{p.medicineName} ({p.dosage}, {p.frequency})</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Print Rx Modal */}
      {showPrintRx && doctor && (
        <PrintRxModal
          patient={patient}
          prescriptions={prescriptions}
          doctor={doctor}
          onClose={() => setShowPrintRx(false)}
        />
      )}

      {/* Edit Patient Modal */}
      {showEditModal && (
        <EditPatientModal
          patient={patient}
          onClose={() => setShowEditModal(false)}
          onPatientUpdated={(updated) => {
            setPatient(updated);
          }}
        />
      )}

      {/* Schedule Appointment / Follow-up Modal */}
      {showScheduleModal && (
        <ScheduleAppointmentModal
          patient={patient}
          initialAppointment={editingAppointment}
          onClose={() => {
            setShowScheduleModal(false);
            setEditingAppointment(null);
          }}
          onSuccess={() => {
            setShowScheduleModal(false);
            setEditingAppointment(null);
            loadPatientData();
          }}
        />
      )}
    </div>
  );
};
